import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';

dayjs.extend(utc);

const prisma = new PrismaClient();

const createAppointmentSchema = z.object({
    barberId: z.string().uuid(),
    serviceId: z.number(),
    // Esperamos formato ISO UTC
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
            where: { phone: data.clientPhone }
        });

        if (!client) {
            client = await prisma.client.create({
                data: {
                    name: data.clientName,
                    phone: data.clientPhone,
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