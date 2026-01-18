import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import dayjs from 'dayjs';
import { sendAppointmentCancellation } from "../utils/email.js"

const prisma = new PrismaClient();

// Esquema de validación
const blockSchema = z.object({
    startDate: z.string().datetime({ message: "Formato de fecha inválido (Use ISO 8601)" }),
    endDate: z.string().datetime({ message: "Formato de fecha inválido (Use ISO 8601)" }),
    reason: z.string().optional()
}).refine(data => new Date(data.endDate) > new Date(data.startDate), {
    message: "La fecha de fin debe ser posterior a la de inicio",
    path: ["endDate"]
});

// Crear un bloqueo
export const createBlock = async (req, res) => {
    try {
        const data = blockSchema.parse(req.body);
        
        const newBlock = await prisma.scheduleBlock.create({
            data: {
                barberId: req.user.id,
                startDate: data.startDate,
                endDate: data.endDate,
                reason: data.reason || "No disponible"
            }
        });

        res.status(201).json({ message: "Bloqueo creado", block: newBlock });

    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.errors });
        }
        res.status(500).json({ error: "Error al crear bloqueo" });
    }
};

// Listar mis bloqueos (Solo futuros)
export const getMyBlocks = async (req, res) => {
    try {
        const blocks = await prisma.scheduleBlock.findMany({
            where: {
                barberId: req.user.id,
                endDate: { gte: new Date() } // Solo traer bloqueos que no han terminado
            },
            orderBy: { startDate: 'asc' }
        });
        res.json(blocks);
    } catch (error) {
        res.status(500).json({ error: "Error al obtener bloqueos" });
    }
};

// Eliminar bloqueo (Por si se cancelan las vacaciones)
export const deleteBlock = async (req, res) => {
    const { id } = req.params;
    try {
        const result = await prisma.scheduleBlock.deleteMany({
            where: {
                id: parseInt(id),
                barberId: req.user.id // Seguridad: Solo el dueño puede borrarlo
            }
        });

        if (result.count === 0) {
            return res.status(404).json({ error: "Bloqueo no encontrado" });
        }

        res.json({ message: "Bloqueo eliminado correctamente" });
    } catch (error) {
        res.status(500).json({ error: "Error al eliminar bloqueo" });
    }
};


const closeDaySchema = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato requerido: YYYY-MM-DD"),
    reason: z.string().min(1, "Debes especificar un motivo para notificar a los clientes")
});

export const closeDay = async (req, res) => {
    try {
        // 1. Validar datos
        const { date, reason } = closeDaySchema.parse(req.body);
        const barberId = req.user.id;
        // Buscamos el nombre real del barbero en la BD porque no viene en el token
        const currentBarber = await prisma.barber.findUnique({
            where: { id: barberId },
            select: { fullName: true }
        });
        
        // Si por algo falla, ponemos un texto por defecto
        const barberName = currentBarber ? currentBarber.fullName : "Tu Barbero";

        // 2. Definir rango del día (De 00:00 a 23:59 UTC)
        // Usamos dayjs para asegurar precisión
        const startOfDay = dayjs.utc(date).startOf('day').toDate();
        const endOfDay = dayjs.utc(date).endOf('day').toDate();

        // 3. INICIAR TRANSACCIÓN (Todo o nada)
        // Necesitamos cancelar citas Y crear el bloqueo al mismo tiempo
        const result = await prisma.$transaction(async (tx) => {
            
            // A. Buscar citas activas que chocarán con el cierre
            const conflictingAppointments = await tx.appointment.findMany({
                where: {
                    barberId: barberId,
                    date: { gte: startOfDay, lte: endOfDay },
                    status: { notIn: ['CANCELLED', 'COMPLETED'] } // Solo las pendientes o confirmadas
                },
                include: { client: true } // Necesitamos el email del cliente
            });

            // B. Cancelar masivamente esas citas en la BD
            if (conflictingAppointments.length > 0) {
                await tx.appointment.updateMany({
                    where: {
                        id: { in: conflictingAppointments.map(appt => appt.id) }
                    },
                    data: { 
                        status: 'CANCELLED' 
                    }
                });
            }

            // C. Crear el Bloqueo de agenda (ScheduleBlock)
            const newBlock = await tx.scheduleBlock.create({
                data: {
                    barberId: barberId,
                    startDate: startOfDay,
                    endDate: endOfDay,
                    reason: reason
                }
            });

            return { newBlock, conflictingAppointments };
        });

        // 4. ENVIAR NOTIFICACIONES (Fuera de la transacción para no bloquear la BD si el email tarda)
        // No usamos await dentro del map para enviar en paralelo
        const emailPromises = result.conflictingAppointments.map(appt => {
            if (appt.client.email) {
                return sendAppointmentCancellation(
                    appt.client.email,
                    appt.client.name,
                    barberName,
                    appt.date,
                    reason // Pasamos el motivo personalizado
                );
            }
        });

        await Promise.all(emailPromises);

        res.status(201).json({
            message: `Día cerrado exitosamente. Se cancelaron ${result.conflictingAppointments.length} citas y se notificó a los clientes.`,
            block: result.newBlock,
            cancelledAppointments: result.conflictingAppointments.length
        });

    } catch (error) {
        console.error(error);
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.errors });
        }
        res.status(500).json({ error: "Error al cerrar el día" });
    }
};