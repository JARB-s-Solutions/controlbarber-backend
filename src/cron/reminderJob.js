import cron from 'node-cron';
import { prisma } from "../config/prisma.js";
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import { sendAppointmentReminderEmail } from '../utils/email.js'; // (La crearemos en el paso 4)

dayjs.extend(utc);
dayjs.extend(timezone);


// Función que busca y envía recordatorios
const checkAndSendReminders = async () => {
    console.log("  Ejecutando Cron de Recordatorios...");
    
    // Definir la ventana de tiempo (24 horas a partir de AHORA)
    const now = dayjs();
    const startWindow = now.add(24, 'hour').startOf('hour').toDate(); // Dentro de 24h exactas
    const endWindow = now.add(24, 'hour').endOf('hour').toDate();     // Hasta el final de esa hora

    try {
        // Buscar citas que cumplan TODAS las condiciones
        const appointments = await prisma.appointment.findMany({
            where: {
                // A. Que la cita sea mañana en este rango de hora
                date: {
                    gte: startWindow,
                    lte: endWindow
                },
                // Que esté confirmada
                status: 'CONFIRMED',
                // Que no hayamos enviado el recordatorio ya
                reminderSent: false,
                // FILTRO PREMIUM: El barbero debe tener suscripción activa y ser PREMIUM
                barber: {
                    subscription: {
                        status: 'ACTIVE',
                        type: 'PREMIUM' 
                    }
                }
            },
            include: {
                client: true,
                barber: true,
                service: true
            }
        });

        if (appointments.length === 0) {
            console.log(" No hay recordatorios pendientes para esta hora.");
            return;
        }

        console.log(` Enviando ${appointments.length} recordatorios...`);

        // 3. Iterar y Enviar
        for (const appt of appointments) {
            if (appt.client.email) {
                // Enviar Email
                await sendAppointmentReminderEmail(
                    appt.client.email,
                    appt.client.name,
                    appt.barber.fullName,
                    dayjs(appt.date).format('DD/MM/YYYY HH:mm'), // Formato legible
                    appt.service.name
                );

                // Marcar como enviado en BD
                await prisma.appointment.update({
                    where: { id: appt.id },
                    data: { reminderSent: true }
                });
                
                console.log(`   -> Enviado a ${appt.client.email}`);
            }
        }

    } catch (error) {
        console.error("❌ Error en Cron de Recordatorios:", error);
    }
};

// 4. Programar la tarea
// "0 * * * *" significa: "En el minuto 0 de cada hora" (ej: 14:00, 15:00, 16:00...)
export const startReminderCron = () => {
    cron.schedule('0 * * * *', checkAndSendReminders);
    console.log("🚀 Cron de Recordatorios iniciado (Revisión cada hora).");
};