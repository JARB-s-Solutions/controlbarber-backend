import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat.js';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js'; // Necesario para la búsqueda de slots

// Activamos los plugins
dayjs.extend(customParseFormat);
dayjs.extend(utc);
dayjs.extend(timezone);

const prisma = new PrismaClient();

// Helper: Convierte "15:00" a Date, FORZANDO UTC directo
const timeToDate = (timeString) => {
    if (!timeString) return null;
    return dayjs.utc(`1970-01-01T${timeString}:00`).toDate();
};

// --- VALIDACIONES (ZOD) ---

const scheduleItemSchema = z.object({
    dayOfWeek: z.number().min(0).max(6),
    startTime: z.string().regex(/^\d{2}:\d{2}$/, "Formato debe ser HH:mm"),
    endTime: z.string().regex(/^\d{2}:\d{2}$/, "Formato debe ser HH:mm"),
    breakStart: z.string().regex(/^\d{2}:\d{2}$/, "Formato HH:mm").optional().nullable(),
    breakEnd: z.string().regex(/^\d{2}:\d{2}$/, "Formato HH:mm").optional().nullable(),
    isWorkDay: z.boolean().default(true)
});

const updateScheduleSchema = z.array(scheduleItemSchema);

// --- CONTROLADORES ---

// 1. Guardar/Actualizar Horarios (Configuración)
export const updateSchedule = async (req, res) => {
    try {
        const data = updateScheduleSchema.parse(req.body);
        const barberId = req.user.id;
        const results = [];

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

// 2. Obtener mi horario semanal (Configuración)
export const getMySchedule = async (req, res) => {
    try {
        const schedule = await prisma.scheduleConfig.findMany({
            where: { barberId: req.user.id },
            orderBy: { dayOfWeek: 'asc' }
        });

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

// 3. CALCULAR SLOTS DISPONIBLES (Para el Cliente) - CORREGIDO
export const getAvailableSlots = async (req, res) => {
    try {
        const { barberId } = req.params;
        const { date, serviceId, timeZone } = req.query; 

        if (!date || !serviceId || !timeZone) {
            return res.status(400).json({ error: "Faltan parámetros (date, serviceId, timeZone)" });
        }

        // A. Obtener duración del servicio
        const service = await prisma.service.findUnique({ where: { id: parseInt(serviceId) } });
        if (!service) return res.status(404).json({ error: "Servicio no encontrado" });
        const duration = service.durationMin || service.duration; // Aseguramos que lea el campo correcto

        // B. Obtener configuración del día
        const dayOfWeek = dayjs.tz(date, timeZone).day();
        const config = await prisma.scheduleConfig.findUnique({
            where: { barberId_dayOfWeek: { barberId, dayOfWeek } }
        });

        if (!config || !config.isWorkDay) {
            return res.json({ date, slots: [], message: "Día no laborable" });
        }

        // C. DEFINIR HORAS DE TRABAJO
        const timeStrStart = config.startTime.toISOString().split('T')[1].substring(0, 8);
        const timeStrEnd = config.endTime.toISOString().split('T')[1].substring(0, 8);

        let workStart = dayjs.tz(`${date} ${timeStrStart}`, timeZone);
        let workEnd = dayjs.tz(`${date} ${timeStrEnd}`, timeZone);

        if (timeStrEnd.startsWith('00:00')) {
            workEnd = dayjs.tz(date, timeZone).endOf('day'); 
        }

        // D. Definir Descanso (Break)
        let breakStart = null;
        let breakEnd = null;
        if (config.breakStart && config.breakEnd) {
            const bStartStr = config.breakStart.toISOString().split('T')[1].substring(0, 8);
            const bEndStr = config.breakEnd.toISOString().split('T')[1].substring(0, 8);
            breakStart = dayjs.tz(`${date} ${bStartStr}`, timeZone);
            breakEnd = dayjs.tz(`${date} ${bEndStr}`, timeZone);
        }

        // E. OBTENER TODO LO QUE ESTORBA (Citas Y Bloqueos) 🛡️
        
        // 1. Citas
        const appointments = await prisma.appointment.findMany({
            where: {
                barberId,
                status: { not: 'CANCELLED' },
                date: {
                    gte: dayjs.tz(date, timeZone).startOf('day').toDate(),
                    lte: dayjs.tz(date, timeZone).endOf('day').toDate()
                }
            },
            include: { service: true }
        });

        // 2. BLOQUEOS (Aquí estaba lo que faltaba) 🔒
        // Traemos cualquier bloqueo que toque el día seleccionado
        const blocks = await prisma.scheduleBlock.findMany({
            where: {
                barberId,
                OR: [
                    {
                        startDate: { lte: dayjs.tz(date, timeZone).endOf('day').toDate() },
                        endDate: { gte: dayjs.tz(date, timeZone).startOf('day').toDate() }
                    }
                ]
            }
        });

        // F. Generar los Huecos (Loop)
        const slots = [];
        let currentSlot = workStart;

        while (currentSlot.add(duration, 'minute').isSameOrBefore(workEnd)) {
            const slotEnd = currentSlot.add(duration, 'minute');
            let isAvailable = true;

            // 1. Checar colisión con Descanso
            if (breakStart && breakEnd) {
                if (currentSlot.isBefore(breakEnd) && slotEnd.isAfter(breakStart)) {
                    isAvailable = false;
                }
            }

            // 2. Checar colisión con Citas
            if (isAvailable) {
                for (const appt of appointments) {
                    // Convertimos la fecha de la cita (UTC) a la Zona Horaria del cliente para comparar bien
                    const apptStart = dayjs(appt.date).tz(timeZone);
                    const apptDuration = appt.service.durationMin || appt.service.duration;
                    const apptEnd = apptStart.add(apptDuration, 'minute');

                    if (currentSlot.isBefore(apptEnd) && slotEnd.isAfter(apptStart)) {
                        isAvailable = false;
                        break;
                    }
                }
            }

            // 3. Checar colisión con BLOQUEOS (Vacaciones/Cierre de día) 🔒
            if (isAvailable) {
                for (const block of blocks) {
                    const blockStart = dayjs(block.startDate).tz(timeZone);
                    const blockEnd = dayjs(block.endDate).tz(timeZone);

                    if (currentSlot.isBefore(blockEnd) && slotEnd.isAfter(blockStart)) {
                        isAvailable = false;
                        break;
                    }
                }
            }

            // 4. Checar si ya pasó la hora (Buffer)
            if (isAvailable) {
                const now = dayjs().tz(timeZone);
                if (currentSlot.isBefore(now.add(15, 'minute'))) {
                    isAvailable = false;
                }
            }

            if (isAvailable) {
                slots.push(currentSlot.format('HH:mm'));
            }

            currentSlot = currentSlot.add(30, 'minute'); 
        }

        res.json({
            date,
            slots,
            message: slots.length > 0 ? "Horarios disponibles" : "No hay horarios disponibles"
        });

    } catch (error) {
        console.error("Error Schedule Controller:", error);
        res.status(500).json({ error: "Error al calcular slots" });
    }
};