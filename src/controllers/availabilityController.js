import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween.js';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js'; 

// CONFIGURACIÓN DE PLUGINS
dayjs.extend(isBetween);
dayjs.extend(utc);
dayjs.extend(timezone);

const prisma = new PrismaClient();

// Validación de entrada
const availabilitySchema = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato requerido: YYYY-MM-DD"),
    serviceId: z.string().transform(val => parseInt(val)),
    barberId: z.string().uuid()
});

export const getAvailability = async (req, res) => {
    try {
        // Parsear datos
        const { date, serviceId, barberId } = availabilitySchema.parse(req.query);

        // Obtener servicio y su duración
        const service = await prisma.service.findUnique({ where: { id: serviceId } });
        if (!service) return res.status(404).json({ error: "Servicio no encontrado" });

        // Determinar Día de la Semana
        // Usamos UTC para que "2026-01-20" no se convierta en "2026-01-19 18:00" por error
        const dayOfWeek = dayjs.utc(date).day(); 

        // Buscar Configuración de Horario
        const schedule = await prisma.scheduleConfig.findUnique({
            where: {
                barberId_dayOfWeek: { barberId, dayOfWeek }
            }
        });

        if (!schedule || !schedule.isWorkDay) {
            return res.json({ date, slots: [], message: "Día no laborable" });
        }

        // Definir límites del día en UTC Absoluto
        // Esto crea: 2026-01-20T00:00:00Z hasta 2026-01-20T23:59:59Z
        const startOfDay = dayjs.utc(date).startOf('day').toDate();
        const endOfDay = dayjs.utc(date).endOf('day').toDate();

        // Obtener Citas Existentes (Ya filtradas por el rango del día)
        const appointments = await prisma.appointment.findMany({
            where: {
                barberId,
                date: { gte: startOfDay, lte: endOfDay },
                status: { not: 'CANCELLED' }
            },
            include: { service: true }
        });

        // Obtener Bloqueos (Vacaciones, emergencias)
        const blocks = await prisma.scheduleBlock.findMany({
            where: {
                barberId,
                OR: [
                    // Cualquier bloqueo que se solape con este día
                    { startDate: { lte: endOfDay }, endDate: { gte: startOfDay } }
                ]
            }
        });

        //  ALGORITMO DE GENERACIÓN DE SLOTS (UTC)
        
        const slots = [];
        const duration = service.durationMin;
        const interval = 30; // Intervalo estándar entre huecos

        // Extraer horas de configuración (La DB devuelve UTC, ej: 1970-01-01T15:00:00Z)
        const configStartHour = dayjs.utc(schedule.startTime).format('HH:mm');
        const configEndHour = dayjs.utc(schedule.endTime).format('HH:mm');

        // Construir los punteros de tiempo sobre la FECHA solicitada
        let currentTime = dayjs.utc(`${date}T${configStartHour}:00`);
        let endTime = dayjs.utc(`${date}T${configEndHour}:00`);

        // Si el cierre es menor al inicio (ej: cierra a las 00:00 o 02:00 AM)
        // significa que cierra al día siguiente.
        if (endTime.isBefore(currentTime) || endTime.isSame(currentTime)) {
            endTime = endTime.add(1, 'day');
        }

        // Configurar Descansos (Lunch Break)
        let breakStart = null;
        let breakEnd = null;

        if (schedule.breakStart && schedule.breakEnd) {
            const breakStartHour = dayjs.utc(schedule.breakStart).format('HH:mm');
            const breakEndHour = dayjs.utc(schedule.breakEnd).format('HH:mm');
            
            breakStart = dayjs.utc(`${date}T${breakStartHour}:00`);
            breakEnd = dayjs.utc(`${date}T${breakEndHour}:00`);

            // Ajuste de cruce de día para descansos
            if (breakEnd.isBefore(breakStart)) breakEnd = breakEnd.add(1, 'day');
            if (breakStart.isBefore(currentTime)) {
                breakStart = breakStart.add(1, 'day');
                breakEnd = breakEnd.add(1, 'day');
            }
        }

        // Bucle Principal: Generar Huecos
        while (currentTime.add(duration, 'minute').isSame(endTime) || currentTime.add(duration, 'minute').isBefore(endTime)) {
            
            const slotStart = currentTime;
            const slotEnd = currentTime.add(duration, 'minute');
            let isBusy = false;

            // --- Validación 1: Descanso ---
            if (breakStart && breakEnd) {
                // Si el slot se solapa con el descanso
                if (slotStart.isBefore(breakEnd) && slotEnd.isAfter(breakStart)) {
                    isBusy = true;
                }
            }

            // --- Validación 2: Citas Existentes ---
            if (!isBusy) {
                for (const appt of appointments) {
                    const apptStart = dayjs.utc(appt.date);
                    const apptDuration = appt.service.durationMin;
                    const apptEnd = apptStart.add(apptDuration, 'minute');

                    // Lógica de colisión de rangos
                    if (slotStart.isBefore(apptEnd) && slotEnd.isAfter(apptStart)) {
                        isBusy = true;
                        break; // Ya chocó, salimos del for
                    }
                }
            }

            // --- Validación 3: Bloqueos ---
            if (!isBusy) {
                for (const block of blocks) {
                    const blockStart = dayjs.utc(block.startDate);
                    const blockEnd = dayjs.utc(block.endDate);

                    if (slotStart.isBefore(blockEnd) && slotEnd.isAfter(blockStart)) {
                        isBusy = true;
                        break; 
                    }
                }
            }

            // Si pasó todas las validaciones, guardamos el slot
            if (!isBusy) {
                // Guardamos en formato HH:mm (UTC). El Frontend lo convertirá a local.
                slots.push(slotStart.format('HH:mm')); 
            }

            // Avanzamos al siguiente intervalo
            currentTime = currentTime.add(interval, 'minute');
        }

        res.json({
            date,
            dayOfWeek,
            timeZone: "UTC", // Indicamos explícitamente que esto es UTC
            availableSlots: slots
        });

    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.errors });
        }
        console.error("Error Availability:", error);
        res.status(500).json({ error: "Error interno calculando disponibilidad" });
    }
};