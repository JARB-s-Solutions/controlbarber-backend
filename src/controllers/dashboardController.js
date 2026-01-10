import { PrismaClient } from '@prisma/client';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';

dayjs.extend(utc);
dayjs.extend(timezone);

const prisma = new PrismaClient();

export const getDashboardStats = async (req, res) => {
    try {
        const barberId = req.user.id;
        const userTimeZone = req.query.timeZone || 'UTC'; 

        const now = dayjs().tz(userTimeZone);
        
        const startOfToday = now.startOf('day').toDate();
        const endOfToday = now.endOf('day').toDate();
        
        const startOfMonth = now.startOf('month').toDate();
        const endOfMonth = now.endOf('month').toDate();

        // =======================================================
        // 1. CALCULOS DE HOY
        // =======================================================

        // A. Citas Completadas (Ingresos)
        const appointmentsToday = await prisma.appointment.aggregate({
            _sum: { frozenPrice: true },
            where: {
                barberId,
                status: 'COMPLETED',
                date: { gte: startOfToday, lte: endOfToday }
            }
        });

        // B. Ventas Manuales (SOLO INGRESOS, Excluyendo retiros)
        const salesToday = await prisma.transaction.aggregate({
            _sum: { amount: true },
            where: {
                barberId,
                type: { not: 'WITHDRAWAL' }, // <--- IMPORTANTE: No sumar retiros como ventas
                createdAt: { gte: startOfToday, lte: endOfToday }
            }
        });

        // C. Retiros (Gastos)
        const withdrawalsToday = await prisma.transaction.aggregate({
            _sum: { amount: true },
            where: {
                barberId,
                type: 'WITHDRAWAL', // <--- Solo retiros
                createdAt: { gte: startOfToday, lte: endOfToday }
            }
        });

        // =======================================================
        // 2. CALCULOS DEL MES
        // =======================================================

        // A. Citas Mes
        const appointmentsMonth = await prisma.appointment.aggregate({
            _sum: { frozenPrice: true },
            where: { barberId, status: 'COMPLETED', date: { gte: startOfMonth, lte: endOfMonth } }
        });

        // B. Ventas Mes
        const salesMonth = await prisma.transaction.aggregate({
            _sum: { amount: true },
            where: { barberId, type: { not: 'WITHDRAWAL' }, createdAt: { gte: startOfMonth, lte: endOfMonth } }
        });

        // C. Retiros Mes
        const withdrawalsMonth = await prisma.transaction.aggregate({
            _sum: { amount: true },
            where: { barberId, type: 'WITHDRAWAL', createdAt: { gte: startOfMonth, lte: endOfMonth } }
        });

        // =======================================================
        // 3. MATEMÁTICA FINAL (NETO)
        // =======================================================

        // Valores numéricos seguros
        const valApptToday = Number(appointmentsToday._sum.frozenPrice || 0);
        const valSalesToday = Number(salesToday._sum.amount || 0);
        const valWithdToday = Number(withdrawalsToday._sum.amount || 0);

        const valApptMonth = Number(appointmentsMonth._sum.frozenPrice || 0);
        const valSalesMonth = Number(salesMonth._sum.amount || 0);
        const valWithdMonth = Number(withdrawalsMonth._sum.amount || 0);

        // FORMULA: (Citas + Ventas) - Retiros
        const netIncomeToday = (valApptToday + valSalesToday) - valWithdToday;
        const netIncomeMonth = (valApptMonth + valSalesMonth) - valWithdMonth;

        // =======================================================
        // 4. CONTEO DE CITAS
        // =======================================================
        const countToday = await prisma.appointment.groupBy({
            by: ['status'],
            where: { barberId, date: { gte: startOfToday, lte: endOfToday } },
            _count: { id: true }
        });

        const stats = {
            meta: {
                queryTimeZone: userTimeZone,
                date: now.format('YYYY-MM-DD')
            },
            // Balance Neto (Lo que realmente tienes en la bolsa)
            todayIncome: netIncomeToday, 
            monthIncome: netIncomeMonth,
            
            // Desglose de Retiros (Para mostrarlo en rojo en el frontend)
            expenses: {
                today: valWithdToday,
                month: valWithdMonth
            },

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