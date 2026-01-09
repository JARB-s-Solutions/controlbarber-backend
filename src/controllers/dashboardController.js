import { PrismaClient } from '@prisma/client';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';

// Activamos los plugins necesarios
dayjs.extend(utc);
dayjs.extend(timezone);

const prisma = new PrismaClient();

export const getDashboardStats = async (req, res) => {
    try {
        const barberId = req.user.id;
        
        // RECIBIR LA ZONA HORARIA DEL CLIENTE
        // Si el frontend no la manda, usamos 'UTC' por defecto para que no falle.
        const userTimeZone = req.query.timeZone || 'UTC'; 

        // Calcular "Ahora" en la zona del usuario
        const now = dayjs().tz(userTimeZone);

        // Definir los límites del día SEGÚN EL USUARIO
        // startOf('day') buscará la zona que envíes.
        // .toDate() lo convertirá al instante UTC exacto que Prisma necesita.
        const startOfToday = now.startOf('day').toDate();
        const endOfToday = now.endOf('day').toDate();
        
        const startOfMonth = now.startOf('month').toDate();
        const endOfMonth = now.endOf('month').toDate();

        // --- Debug Log Para ver en consola qué está calculando
        console.log(`Zona Usuario: ${userTimeZone}`);
        console.log(`Buscando desde (UTC): ${startOfToday.toISOString()}`);
        console.log(`Hasta (UTC): ${endOfToday.toISOString()}`);

        // Consultas a Base de Datos (Igual que antes)
        const incomeToday = await prisma.appointment.aggregate({
            _sum: { frozenPrice: true },
            where: {
                barberId,
                status: 'COMPLETED',
                date: { gte: startOfToday, lte: endOfToday }
            }
        });

        const incomeMonth = await prisma.appointment.aggregate({
            _sum: { frozenPrice: true },
            where: {
                barberId,
                status: 'COMPLETED',
                date: { gte: startOfMonth, lte: endOfMonth }
            }
        });

        const countToday = await prisma.appointment.groupBy({
            by: ['status'],
            where: {
                barberId,
                date: { gte: startOfToday, lte: endOfToday }
            },
            _count: { id: true }
        });

        // Formatear respuesta
        const stats = {
            meta: {
                queryTimeZone: userTimeZone, // Le confirmamos al front qué zona usamos
                date: now.format('YYYY-MM-DD')
            },
            todayIncome: incomeToday._sum.frozenPrice || 0,
            monthIncome: incomeMonth._sum.frozenPrice || 0,
            appointments: {
                pending: 0,
                completed: 0,
                cancelled: 0,
                total: 0
            }
        };

        countToday.forEach(group => {
            const count = group._count.id;
            if (group.status === 'PENDING' || group.status === 'CONFIRMED') stats.appointments.pending += count;
            if (group.status === 'COMPLETED') stats.appointments.completed += count;
            if (group.status === 'CANCELLED') stats.appointments.cancelled += count;
            stats.appointments.total += count;
        });

        res.json(stats);

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error al obtener métricas" });
    }
};