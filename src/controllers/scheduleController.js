import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat.js';
import utc from 'dayjs/plugin/utc.js'; // 1. Importante: UTC

// 2. Activamos los plugins
dayjs.extend(customParseFormat);
dayjs.extend(utc);

const prisma = new PrismaClient();

// Helper: Convierte "15:00" a Date, FORZANDO UTC directo
// Al usar .utc() le decimos: "Lo que te doy YA ES UTC, no le sumes mi zona horaria"
const timeToDate = (timeString) => {
    if (!timeString) return null;
    return dayjs.utc(`1970-01-01T${timeString}:00`).toDate();
};

// Validación de una sola fila de configuración
const scheduleItemSchema = z.object({
    dayOfWeek: z.number().min(0).max(6), // 0=Domingo...
    startTime: z.string().regex(/^\d{2}:\d{2}$/, "Formato debe ser HH:mm"),
    endTime: z.string().regex(/^\d{2}:\d{2}$/, "Formato debe ser HH:mm"),
    breakStart: z.string().regex(/^\d{2}:\d{2}$/, "Formato HH:mm").optional().nullable(),
    breakEnd: z.string().regex(/^\d{2}:\d{2}$/, "Formato HH:mm").optional().nullable(),
    isWorkDay: z.boolean().default(true)
});

// Validación del array completo
const updateScheduleSchema = z.array(scheduleItemSchema);

// 1. Guardar/Actualizar Horarios
export const updateSchedule = async (req, res) => {
    try {
        const data = updateScheduleSchema.parse(req.body);
        const barberId = req.user.id;

        const results = [];

        // Usamos transacción para asegurar consistencia
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

        res.json({ message: "Horarios actualizados correctamente", data: results });

    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.errors });
        }
        console.error(error);
        res.status(500).json({ error: "Error al guardar horarios" });
    }
};

// 2. Obtener mi horario semanal
export const getMySchedule = async (req, res) => {
    try {
        const schedule = await prisma.scheduleConfig.findMany({
            where: { barberId: req.user.id },
            orderBy: { dayOfWeek: 'asc' }
        });

        // Formatear para devolver "HH:mm" al frontend
        // Usamos .toISOString() que siempre devuelve UTC, y cortamos los caracteres de la hora.
        // Así aseguramos que lo que entra es igual a lo que sale.
        const formatted = schedule.map(day => ({
            ...day,
            startTime: day.startTime ? day.startTime.toISOString().slice(11, 16) : null,
            endTime: day.endTime ? day.endTime.toISOString().slice(11, 16) : null,
            breakStart: day.breakStart ? day.breakStart.toISOString().slice(11, 16) : null,
            breakEnd: day.breakEnd ? day.breakEnd.toISOString().slice(11, 16) : null,
        }));

        res.json(formatted);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error al obtener horario" });
    }
};