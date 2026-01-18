import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import { 
    sendReviewRequest, 
    sendAppointmentConfirmation,
    sendAppointmentCancellation,
    sendNewAppointmentNotificationToBarber
}  from '../utils/email.js';
import { createNotification } from './notificationController.js';
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

        // 1. CHEQUEO DE PLAN DEL BARBERO 🔒
        const { limits } = await checkPlanLimits(data.barberId);

        // REGLA 1: Si es FREE, no dejamos ni crear la cita (Bloqueo Total)
        if (!limits.canReceiveBookings) {
            return res.status(403).json({
                error: "Este barbero utiliza la versión gratuita y no acepta reservas online. Por favor contáctalo directamente."
            });
        }

        // Obtener servicio
        const service = await prisma.service.findUnique({ where: { id: data.serviceId } });
        if (!service) return res.status(404).json({ error: "Servicio no encontrado" });

        // Definir Inicio y Fin
        const newApptStart = dayjs.utc(data.date);
        const newApptEnd = newApptStart.add(service.durationMin, 'minute');


        // VERIFICAR BLOQUEOS (Vacaciones, Cierres)
        const conflictBlock = await prisma.scheduleBlock.findFirst({
            where: {
                barberId: data.barberId,
                // Lógica de colisión: El bloqueo empieza antes de que termine la cita
                // Y el bloqueo termina después de que empiece la cita.
                startDate: { lt: newApptEnd.toDate() },
                endDate: { gt: newApptStart.toDate() }
            }
        });

        if (conflictBlock) {
            return res.status(409).json({ 
                error: `No disponible: El barbero ha bloqueado este horario (${conflictBlock.reason}).` 
            });
        }



        // VALIDACIÓN DE DISPONIBILIDAD
        const startOfDay = newApptStart.startOf('day').toDate();
        const endOfDay = newApptStart.endOf('day').toDate();

        const dailyAppointments = await prisma.appointment.findMany({
            where: {
                barberId: data.barberId,
                date: { gte: startOfDay, lte: endOfDay },
                status: { not: 'CANCELLED' }
            },
            include: { service: true }
        });

        for (const appt of dailyAppointments) {
            const existingStart = dayjs.utc(appt.date);
            const existingEnd = existingStart.add(appt.service.durationMin, 'minute');

            if (newApptStart.isBefore(existingEnd) && newApptEnd.isAfter(existingStart)) {
                return res.status(409).json({ error: "El horario seleccionado ya está ocupado." });
            }
        }

        // GESTIÓN DEL CLIENTE
        let client = await prisma.client.findUnique({
            where: { 
                client_phone_per_barber: {
                    phone: data.clientPhone,
                    barberId: data.barberId
                }
             }
        });

        if (!client) {
            client = await prisma.client.create({
                data: {
                    barberId: data.barberId,
                    name: data.clientName,
                    phone: data.clientPhone,
                    email: data.clientEmail || null
                }
            });
        }

        // CREAR LA CITA
        const newAppointment = await prisma.appointment.create({
            data: {
                barber: { connect: { id: data.barberId } },
                service: { connect: { id: data.serviceId } },
                client: { connect: { id: client.id } },
                date: newApptStart.toDate(),
                status: 'CONFIRMED',
                frozenPrice: service.price,
                origin: 'APP'
            }
        });

        // NOTIFICACIÓN INTERNA (Siempre se envía, es parte del sistema base)
        const fechaFormat = dayjs(newAppointment.date).format('DD/MM HH:mm');
        await createNotification(
            data.barberId, 
            "📅 Nueva Cita Agendada", 
            `${client.name} ha reservado un ${service.name} para el ${fechaFormat}`
        );

        // REGLA 2: Solo enviamos correos si el plan lo permite (PREMIUM) 📧🔒
        if (limits.hasEmailNotifications) {
            
            // A. Obtener datos del barbero
            const barberData = await prisma.barber.findUnique({
                where: { id: data.barberId },
                select: { email: true, fullName: true }
            });

            // B. Email al Cliente
            if (client.email && barberData) {
                sendAppointmentConfirmation(
                    client.email,
                    client.name,
                    barberData.fullName,
                    service.name,
                    newAppointment.date
                );
            }

            // C. Email al Barbero
            if (barberData && barberData.email) {
                sendNewAppointmentNotificationToBarber(
                    barberData.email,
                    barberData.fullName,
                    client.name,
                    service.name,
                    newAppointment.date
                );
            }
        }
        
        res.status(201).json(newAppointment);

    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.errors });
        }
        console.error("Error creating appointment:", error);
        res.status(500).json({ error: "Error al crear la cita" });
    }
};

// Validación para el filtro de fecha
const getAppointmentsSchema = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato YYYY-MM-DD").optional(),
});

export const getMyAppointments = async (req, res) => {
    try {
        const { date } = getAppointmentsSchema.parse(req.query);
        const barberId = req.user.id; 

        const whereClause = { barberId: barberId };

        if (date) {
            const startOfDay = dayjs.utc(date).startOf('day').toDate();
            const endOfDay = dayjs.utc(date).endOf('day').toDate();
            whereClause.date = { gte: startOfDay, lte: endOfDay };
        }

        const appointments = await prisma.appointment.findMany({
            where: whereClause,
            include: { client: true, service: true },
            orderBy: { date: 'asc' }
        });

        res.json(appointments);
    } catch (error) {
        if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
        console.error(error);
        res.status(500).json({ error: "Error al obtener citas" });
    }
};

// Esquema para validar que el estado sea válido
const updateStatusSchema = z.object({
    status: z.enum(['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'], {
        errorMap: () => ({ message: "Estado no válido" })
    })
});

export const updateAppointmentStatus = async (req, res) => {
    const { id } = req.params;

    try {
        const { status } = updateStatusSchema.parse(req.body);
        const barberId = req.user.id;

        // 1. CHEQUEO DE PLAN (Para saber si enviamos correos) 🔒
        const { limits } = await checkPlanLimits(barberId);

        const appointment = await prisma.appointment.findUnique({
            where: { id: id },
            include: {
                client: true,
                service: true,
                barber: true
            }
        });

        if (!appointment || appointment.barberId !== barberId) {
            return res.status(404).json({ error: "Cita no encontrada o no te pertenece" });
        }

        if (status === 'COMPLETED') {
            const now = dayjs(); 
            const apptDate = dayjs(appointment.date);
            if (apptDate.isAfter(now)) {
                return res.status(400).json({ error: "No puedes completar una cita futura." });
            }
        }

        const updatedAppointment = await prisma.appointment.update({
            where: { id: id },
            data: { status: status }
        });

        // REGLA 2: Solo enviamos correos si es PREMIUM 📧🔒
        if (limits.hasEmailNotifications) {

            // Cita Completada -> Pedir Reseña
            if (status === 'COMPLETED' && appointment.client.email) {
                sendReviewRequest(
                    appointment.client.email,
                    appointment.client.name,
                    appointment.barber.fullName,
                    appointment.id,
                    appointment.service.name
                );
            }

            // Cita Cancelada -> Avisar al cliente
            if (status === 'CANCELLED' && appointment.client.email) {
                sendAppointmentCancellation(
                    appointment.client.email,
                    appointment.client.name,
                    appointment.barber.fullName,
                    appointment.date
                );
                
                // Notificación interna (siempre va, no cuesta)
                 await createNotification(
                    barberId, 
                    "❌ Cita Cancelada", 
                    `La cita con ${appointment.client.name} ha sido cancelada.`
                );
            }
        }

        res.json({ 
            message: `Cita actualizada a ${status}`, 
            appointment: updatedAppointment 
        });

    } catch (error) {
        if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
        console.error(error);
        res.status(500).json({ error: "Error al actualizar cita" });
    }
};