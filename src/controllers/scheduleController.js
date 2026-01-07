import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat.js';

dayjs.extend(customParseFormat);

const prisma = new PrismaClient();

// Helper: Convierte "09:00" a un objeto Date (usando una fecha base fija)
const timeToDate = (timeString) => {
    if (!timeString) return null;
    return dayjs(`1970-01-01 ${timeString}`, 'YYYY-MM-DD HH:mm').toDate();
};

// Validar una sola fila de configuración
const scheduleItemSchema = z.object({
    dayOfWeek: z.number().min(0).max(6), // 0=Domingo, 6=Sábado
    startTime: z.string().regex(/^\d{2}:\d{2}$/, "Formato debe ser HH:mm"),
    endTime: z.string().regex(/^\d{2}:\d{2}$/, "Formato debe ser HH:mm"),
    breakStart: z.string().regex(/^\d{2}:\d{2}$/, "Formato HH:mm").optional().nullable(),
    breakEnd: z.string().regex(/^\d{2}:\d{2}$/, "Formato HH:mm").optional().nullable(),
    isWorkDay: z.boolean().default(true)
}).refine(data => {
    // Validar lógica: Fin > Inicio
    const start = timeToDate(data.startTime);
    const end = timeToDate(data.endTime);
    return end > start;
}, { message: "La hora de fin debe ser mayor a la de inicio" });

// Validar que recibimos un array de configuraciones
const updateScheduleSchema = z.array(scheduleItemSchema);

// Guardar/Actualizar Horarios
export const updateSchedule = async (req, res) => {
    try {
        const data = updateScheduleSchema.parse(req.body);
        const barberId = req.user.id;

        const results = [];

        // Procesamos cada día enviado
        // Usamos una transacción para asegurar que todo se guarde o nada
        await prisma.$transaction(async (tx) => {
            for (const item of data) {
                const config = await tx.scheduleConfig.upsert({
                    where: {
                        barberId_dayOfWeek: {
                            barberId: barberId,
                            dayOfWeek: item.dayOfWeek
                        }
                    },
                    update: {
                        startTime: timeToDate(item.startTime),
                        endTime: timeToDate(item.endTime),
                        breakStart: timeToDate(item.breakStart),
                        breakEnd: timeToDate(item.breakEnd),
                        isWorkDay: item.isWorkDay
                    },
                    create: {
                        barberId: barberId,
                        dayOfWeek: item.dayOfWeek,
                        startTime: timeToDate(item.startTime),
                        endTime: timeToDate(item.endTime),
                        breakStart: timeToDate(item.breakStart),
                        breakEnd: timeToDate(item.breakEnd),
                        isWorkDay: item.isWorkDay
                    }
                });
                results.push(config);
            }
        });

        res.json({ message: "Horarios actualizados", data: results });

    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.errors });
        }
        console.error(error);
        res.status(500).json({ error: "Error al guardar horarios" });
    }
};

// Obtener mi horario semanal
export const getMySchedule = async (req, res) => {
    try {
        const schedule = await prisma.scheduleConfig.findMany({
            where: { barberId: req.user.id },
            orderBy: { dayOfWeek: 'asc' }
        });

        // Formatear para que el frontend reciba "09:00" en lugar de "1970-01-01T09:00:00.000Z"
        const formatted = schedule.map(day => ({
            ...day,
            startTime: dayjs(day.startTime).format('HH:mm'),
            endTime: dayjs(day.endTime).format('HH:mm'),
            breakStart: day.breakStart ? dayjs(day.breakStart).format('HH:mm') : null,
            breakEnd: day.breakEnd ? dayjs(day.breakEnd).format('HH:mm') : null,
        }));

        res.json(formatted);
    } catch (error) {
        res.status(500).json({ error: "Error al obtener horario" });
    }
};