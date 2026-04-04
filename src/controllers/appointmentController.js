import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import { sendReviewRequest, sendAppointmentConfirmation, sendAppointmentCancellation, sendNewAppointmentNotificationToBarber } from '../utils/email.js';
import { createNotification } from './notificationController.js'; // Ajusta si la cambiaste
import { checkPlanLimits } from '../utils/permissions.js';

dayjs.extend(utc);
const prisma = new PrismaClient();

const createAppointmentSchema = z.object({
    barberId: z.string().uuid(),
    serviceId: z.number(),
    date: z.string().datetime(), 
    clientName: z.string().min(1, "Nombre requerido"),
    clientPhone: z.string().min(1, "Teléfono requerido"),
    clientEmail: z.string().email().optional().or(z.literal(''))
});

export const createAppointment = async (req, res) => {
    try {
        const data = createAppointmentSchema.parse(req.body);

        // 1. OBTENER CONTEXTO DE SUCURSAL DESDE EL BARBERO 🕵️
        const barber = await prisma.barber.findUnique({ where: { id: data.barberId } });
        if (!barber) return res.status(404).json({ error: "Barbero no encontrado" });
        
        const barbershopId = barber.barbershopId; // Extraemos la sucursal

        // 2. CHEQUEO DE PLAN DE LA SUCURSAL 
        const { limits } = await checkPlanLimits(barbershopId);
        if (!limits.canReceiveBookings) {
            return res.status(403).json({ error: "Esta sucursal no acepta reservas online en este momento." });
        }

        // 3. CONSULTAS EN PARALELO 
        const [service, conflictBlock] = await Promise.all([
            prisma.service.findFirst({ where: { id: data.serviceId, barbershopId } }), // Valida que el servicio sea de la tienda
            prisma.scheduleBlock.findFirst({
                where: {
                    barberId: data.barberId,
                    startDate: { lt: dayjs.utc(data.date).add(30, 'minute').toDate() }, // Asumiendo cruce inicial
                    endDate: { gt: dayjs.utc(data.date).toDate() }
                }
            })
        ]);

        if (!service) return res.status(404).json({ error: "Servicio inválido" });
        if (conflictBlock) return res.status(409).json({ error: "El barbero no está disponible en este horario." });

        const newApptStart = dayjs.utc(data.date);
        const newApptEnd = newApptStart.add(service.durationMin, 'minute');

        // 4. VALIDAR DISPONIBILIDAD (Colisiones)
        const dailyAppointments = await prisma.appointment.findMany({
            where: {
                barberId: data.barberId,
                date: { gte: newApptStart.startOf('day').toDate(), lte: newApptStart.endOf('day').toDate() },
                status: { not: 'CANCELLED' }
            },
            include: { service: true }
        });

        for (const appt of dailyAppointments) {
            const existingStart = dayjs.utc(appt.date);
            const existingEnd = existingStart.add(appt.service.durationMin, 'minute');
            if (newApptStart.isBefore(existingEnd) && newApptEnd.isAfter(existingStart)) {
                return res.status(409).json({ error: "Horario ocupado." });
            }
        }

        // 5. GESTIÓN DEL CLIENTE (A nivel Sucursal) 🧑‍🤝‍🧑
        let client = await prisma.client.findUnique({
            where: { client_phone_per_shop: { phone: data.clientPhone, barbershopId } }
        });

        if (!client) {
            client = await prisma.client.create({
                data: { barbershopId, name: data.clientName, phone: data.clientPhone, email: data.clientEmail || null }
            });
        }

        // 6. CREAR LA CITA
        const newAppointment = await prisma.appointment.create({
            data: {
                barbershopId, // Vinculada a la tienda
                barberId: data.barberId, // Atendida por este empleado
                serviceId: data.serviceId,
                clientId: client.id,
                date: newApptStart.toDate(),
                status: 'CONFIRMED',
                frozenPrice: service.price,
                origin: 'APP'
            }
        });

        // 7. NOTIFICACIONES
        if (limits.hasEmailNotifications) {
            if (client.email) sendAppointmentConfirmation(client.email, client.name, barber.fullName, service.name, newAppointment.date);
            if (barber.email) sendNewAppointmentNotificationToBarber(barber.email, barber.fullName, client.name, service.name, newAppointment.date);
        }
        
        res.status(201).json(newAppointment);

    } catch (error) {
        if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
        console.error(error);
        res.status(500).json({ error: "Error al crear la cita" });
    }
};

export const getMyAppointments = async (req, res) => {
    try {
        const { date } = req.query;
        const { id: userId, role, barbershopId } = req.user; 

        // LÓGICA DE ROLES: Un dueño ve todo, un empleado ve lo suyo
        const whereClause = { barbershopId };
        
        // Si no es dueño ni gerente, filtramos solo sus citas
        if (role === 'BARBER') {
            whereClause.barberId = userId;
        }

        if (date) {
            const startOfDay = dayjs.utc(date).startOf('day').toDate();
            const endOfDay = dayjs.utc(date).endOf('day').toDate();
            whereClause.date = { gte: startOfDay, lte: endOfDay };
        }

        const appointments = await prisma.appointment.findMany({
            where: whereClause,
            include: { client: true, service: true, barber: { select: { fullName: true } } },
            orderBy: { date: 'asc' }
        });

        res.json(appointments);
    } catch (error) {
        res.status(500).json({ error: "Error al obtener citas" });
    }
};

const updateStatusSchema = z.object({
    status: z.enum(['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'])
});

export const updateAppointmentStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = updateStatusSchema.parse(req.body);
        const { id: userId, role, barbershopId } = req.user;

        const { limits } = await checkPlanLimits(barbershopId);

        const appointment = await prisma.appointment.findUnique({
            where: { id },
            include: { client: true, service: true, barber: true }
        });

        // Seguridad: ¿La cita pertenece a mi sucursal?
        if (!appointment || appointment.barbershopId !== barbershopId) {
            return res.status(404).json({ error: "Cita no encontrada o acceso denegado" });
        }

        // Seguridad: Un BARBER solo puede modificar SUS citas (El dueño puede modificar todas)
        if (role === 'BARBER' && appointment.barberId !== userId) {
            return res.status(403).json({ error: "No puedes modificar las citas de otros empleados" });
        }

        if (status === 'COMPLETED' && dayjs(appointment.date).isAfter(dayjs())) {
            return res.status(400).json({ error: "No puedes completar una cita futura." });
        }

        const updatedAppointment = await prisma.appointment.update({
            where: { id },
            data: { status }
        });

        if (limits.hasEmailNotifications) {
            if (status === 'COMPLETED' && appointment.client.email) {
                sendReviewRequest(appointment.client.email, appointment.client.name, appointment.barber.fullName, appointment.id, appointment.service.name);
            }
            if (status === 'CANCELLED' && appointment.client.email) {
                sendAppointmentCancellation(appointment.client.email, appointment.client.name, appointment.barber.fullName, appointment.date);
            }
        }

        res.json({ message: `Cita actualizada a ${status}`, appointment: updatedAppointment });

    } catch (error) {
        if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
        res.status(500).json({ error: "Error al actualizar cita" });
    }
};