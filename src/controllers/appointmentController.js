import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import { sendReviewRequest } from '../utils/email.js';
import { createNotification } from './notificationController.js';

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

        // Obtener servicio (necesitamos la duración para calcular el fin de la cita)
        const service = await prisma.service.findUnique({ where: { id: data.serviceId } });
        if (!service) return res.status(404).json({ error: "Servicio no encontrado" });

        // Definir Inicio y Fin de la NUEVA cita
        const newApptStart = dayjs.utc(data.date);
        const newApptEnd = newApptStart.add(service.durationMin, 'minute');

    
        // VALIDACIÓN DE DISPONIBILIDAD (EL ESCUDO ANTI-CHOQUES)
    
        
        // Buscamos todas las citas ACTIVAS de ese día para ese barbero
        const startOfDay = newApptStart.startOf('day').toDate();
        const endOfDay = newApptStart.endOf('day').toDate();

        const dailyAppointments = await prisma.appointment.findMany({
            where: {
                barberId: data.barberId,
                date: { gte: startOfDay, lte: endOfDay }, // Solo citas de hoy
                status: { not: 'CANCELLED' } // Ignoramos las canceladas
            },
            include: { service: true } // Necesitamos saber cuánto duran para calcular sus finales
        });

        // Comprobamos matemáticamente si chocan
        for (const appt of dailyAppointments) {
            // Calcular tiempos de la cita EXISTENTE
            const existingStart = dayjs.utc(appt.date);
            const existingEnd = existingStart.add(appt.service.durationMin, 'minute');

            // FÓRMULA DE COLISIÓN:
            // (NuevaEmpieza < ViejaTermina) Y (NuevaTermina > ViejaEmpieza)
            if (newApptStart.isBefore(existingEnd) && newApptEnd.isAfter(existingStart)) {
                return res.status(409).json({ 
                    error: "El horario seleccionado ya está ocupado por otra cita." 
                });
            }
        }


        // GESTIÓN DEL CLIENTE
        

        let client = await prisma.client.findUnique({
            where: { 
                client_phone_per_barber: {
                    phone: data.clientPhone,
                    barberId: data.barberId // Buscar solo en MIS clientes
                }
             }
        });

        // Si no existe en MI lista, lo creo vinculado a MÍ
        if (!client) {
            client = await prisma.client.create({
                data: {
                    barberId: data.barberId, // Asignar propiedad
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


        // NOTIFICAR AL BARBERO
        // Usamos el nombre del cliente y fecha formateada
        const fechaFormat = dayjs(newAppointment.date).format('DD/MM HH:mm');
        await createNotification(
            data.barberId, 
            "Nueva Cita Agendada", 
            `${client.name} ha reservado un ${service.name} para el ${fechaFormat}`
        );

        
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
        const barberId = req.user.id; // Viene del token

        const whereClause = {
            barberId: barberId
        };

        // Si envía fecha, filtramos por ese día (De 00:00 a 23:59 UTC del día seleccionado)
        if (date) {
            const startOfDay = dayjs.utc(date).startOf('day').toDate();
            const endOfDay = dayjs.utc(date).endOf('day').toDate();

            whereClause.date = {
                gte: startOfDay,
                lte: endOfDay
            };
        }

        const appointments = await prisma.appointment.findMany({
            where: whereClause,
            include: {
                client: true,  // Traer nombre y teléfono del cliente
                service: true  // Traer nombre del corte y precio
            },
            orderBy: {
                date: 'asc'    // Ordenar por hora (primero la de las 9am, luego 10am...)
            }
        });

        res.json(appointments);

    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.errors });
        }
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

// Actualizar estado (Cancelar, Completar, etc)// ... imports

export const updateAppointmentStatus = async (req, res) => {
    const { id } = req.params;

    try {
        const { status } = updateStatusSchema.parse(req.body);
        const barberId = req.user.id;

        // Buscar cita y datos relacionados (Cliente, Servicio, Barbero)
        const appointment = await prisma.appointment.findUnique({
            where: { id: id },
            include: {
                client: true,  // Necesitamos el email del cliente
                service: true, // Para decir "Tu corte X"
                barber: true   // Para decir "Con el barbero Y"
            }
        });

        // Validamos que exista y sea del barbero
        if (!appointment || appointment.barberId !== barberId) {
            return res.status(404).json({ error: "Cita no encontrada o no te pertenece" });
        }

        // REGLA DE NEGOCIO: No completar citas futuras
        if (status === 'COMPLETED') {
            const now = dayjs(); // Hora actual del servidor
            const apptDate = dayjs(appointment.date);

            // Si la cita es después de ahora mismo, error.
            if (apptDate.isAfter(now)) {
                return res.status(400).json({ 
                    error: "No puedes completar una cita que aún no ha ocurrido. Espera a la fecha y hora agendada." 
                });
            }
        }

        // 2. Actualizar estado
        const updatedAppointment = await prisma.appointment.update({
            where: { id: id },
            data: { status: status }
        });

        // 3. LOGICA DE NOTIFICACIÓN (Nuevo) 📧
        if (status === 'COMPLETED' && appointment.client.email) {
            // Enviamos el correo en segundo plano (sin await para no hacer esperar al barbero)
            sendReviewRequest(
                appointment.client.email,
                appointment.client.name,
                appointment.barber.fullName,
                appointment.id,
                appointment.service.name
            );
        }

        res.json({ 
            message: `Cita actualizada a ${status}`, 
            appointment: updatedAppointment 
        });

    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.errors });
        }
        console.error(error);
        res.status(500).json({ error: "Error al actualizar cita" });
    }
};