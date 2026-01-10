import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';

dayjs.extend(utc);
dayjs.extend(timezone);

const prisma = new PrismaClient();

// Esquema para venta manual O RETIRO
const createTransactionSchema = z.object({
    type: z.enum(['SERVICE', 'PRODUCT', 'TIP', 'OTHER', 'WITHDRAWAL']),
    amount: z.number().positive(),
    method: z.enum(['CASH', 'TRANSFER', 'CARD']),
    description: z.string().optional() // Opcional, para saber qué vendió
});

// Crear Venta Manual (POS)
export const createTransaction = async (req, res) => {
    try {
        const data = createTransactionSchema.parse(req.body);
        const barberId = req.user.id;

        const newTransaction = await prisma.transaction.create({
            data: {
                barberId,
                type: data.type,
                amount: data.amount,
                method: data.method,
                // No vinculamos cita porque es venta libre
            }
        });

        res.status(201).json(newTransaction);

    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.errors });
        }
        console.error(error);
        res.status(500).json({ error: "Error al registrar venta" });
    }
};


// Obtener Resumen del Día (CON RETIROS)
export const getDailySummary = async (req, res) => {
    try {
        const barberId = req.user.id;
        const userTimeZone = req.query.timeZone || 'UTC';

        const now = dayjs().tz(userTimeZone);
        const startOfDay = now.startOf('day').toDate();
        const endOfDay = now.endOf('day').toDate();

        // Sumar INGRESOS por Citas
        const appointments = await prisma.appointment.aggregate({
            _sum: { frozenPrice: true },
            where: {
                barberId,
                status: 'COMPLETED',
                date: { gte: startOfDay, lte: endOfDay }
            }
        });

        // Sumar INGRESOS Manuales (Todo lo que NO sea retiro)
        const incomeTransactions = await prisma.transaction.aggregate({
            _sum: { amount: true },
            where: {
                barberId,
                type: { not: 'WITHDRAWAL' }, 
                createdAt: { gte: startOfDay, lte: endOfDay }
            }
        });

        // Sumar SALIDAS (Retiros)
        const withdrawals = await prisma.transaction.aggregate({
            _sum: { amount: true },
            where: {
                barberId,
                type: 'WITHDRAWAL', // <--- Solo retiros
                createdAt: { gte: startOfDay, lte: endOfDay }
            }
        });

        // Totales
        const totalServices = Number(appointments._sum.frozenPrice || 0);
        const totalManualIncome = Number(incomeTransactions._sum.amount || 0);
        const totalWithdrawals = Number(withdrawals._sum.amount || 0);

        // FORMULA: (Servicios + Ventas Manuales) - Retiros
        const totalDay = (totalServices + totalManualIncome) - totalWithdrawals;

        res.json({
            date: now.format('YYYY-MM-DD'),
            inflow: {
                services: totalServices,
                manual: totalManualIncome
            },
            outflow: {
                withdrawals: totalWithdrawals
            },
            balance: totalDay // Lo que debería haber en caja realmente
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error al obtener resumen" });
    }
};


// REALIZAR CIERRE DE CAJA (Daily Close)
export const performDailyClose = async (req, res) => {
    try {
        const barberId = req.user.id;
        const userTimeZone = req.body.timeZone || 'UTC';

        const now = dayjs().tz(userTimeZone);
        const dateForDb = now.startOf('day').toDate();
        const startOfDay = now.startOf('day').toDate();
        const endOfDay = now.endOf('day').toDate();

        // Verificar existencia
        const existingClose = await prisma.dailyClose.findUnique({
            where: { barberId_date: { barberId, date: dateForDb } }
        });
        if (existingClose) return res.status(409).json({ error: "Ya has cerrado caja hoy" });

        // CALCULAR INGRESOS (Entradas)
        const appointmentsSum = await prisma.appointment.aggregate({
            _sum: { frozenPrice: true },
            where: { barberId, status: 'COMPLETED', date: { gte: startOfDay, lte: endOfDay } }
        });
        
        // Ingresos Manuales (CASH vs TRANSFER) - Excluyendo Withdrawals
        const incomeCash = await prisma.transaction.aggregate({
            _sum: { amount: true },
            where: { 
                barberId, 
                method: 'CASH', 
                type: { not: 'WITHDRAWAL' }, // Solo entradas
                createdAt: { gte: startOfDay, lte: endOfDay } 
            }
        });
        const incomeTransfer = await prisma.transaction.aggregate({
            _sum: { amount: true },
            where: { 
                barberId, 
                method: 'TRANSFER', 
                type: { not: 'WITHDRAWAL' }, // Solo entradas
                createdAt: { gte: startOfDay, lte: endOfDay } 
            }
        });

        // CALCULAR RETIROS (Salidas)
        const withdrawalCash = await prisma.transaction.aggregate({
            _sum: { amount: true },
            where: { 
                barberId, 
                type: 'WITHDRAWAL', 
                method: 'CASH', 
                createdAt: { gte: startOfDay, lte: endOfDay } 
            }
        });
        // Si permites retiros por transferencia bancaria
        const withdrawalTransfer = await prisma.transaction.aggregate({
            _sum: { amount: true },
            where: { 
                barberId, 
                type: 'WITHDRAWAL', 
                method: 'TRANSFER', 
                createdAt: { gte: startOfDay, lte: endOfDay } 
            }
        });

        // MATEMÁTICA FINAL (Entradas - Salidas)
        const totalAppts = Number(appointmentsSum._sum.frozenPrice || 0); // Asumimos cash por ahora
        
        // Efectivo Real = (Citas + Ventas Efectivo) - Retiros Efectivo
        const totalCash = (totalAppts + Number(incomeCash._sum.amount || 0)) - Number(withdrawalCash._sum.amount || 0);
        
        // Digital Real = Ventas Digitales - Retiros Digitales
        const totalTransfer = Number(incomeTransfer._sum.amount || 0) - Number(withdrawalTransfer._sum.amount || 0);
        
        const totalDay = totalCash + totalTransfer;

        // Crear Registro
        const dailyClose = await prisma.dailyClose.create({
            data: {
                barberId,
                date: dateForDb,
                totalCash,
                totalTransfer,
                totalDay
            }
        });

        res.status(201).json(dailyClose);

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error al cerrar caja" });
    }
};


// REABRIR CAJA (Eliminar el cierre)
export const undoDailyClose = async (req, res) => {
    try {
        const barberId = req.user.id;
        const userTimeZone = req.body.timeZone || 'UTC'; // O recibir fecha específica por body

        // Calculamos la fecha "logica" de hoy (00:00:00)
        const now = dayjs().tz(userTimeZone);
        const dateForDb = now.startOf('day').toDate();

        // Intentamos borrar el cierre de esa fecha
        try {
            await prisma.dailyClose.delete({
                where: {
                    barberId_date: {
                        barberId,
                        date: dateForDb
                    }
                }
            });
            res.json({ message: "Caja reabierta exitosamente. Puedes agregar más ventas y cerrar de nuevo." });
        } catch (error) {
            // Prisma lanza error si no encuentra el registro para borrar
            if (error.code === 'P2025') {
                return res.status(404).json({ error: "No existe un cierre de caja para el día de hoy." });
            }
            throw error;
        }

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error al reabrir la caja" });
    }
};

// HISTORIAL DE MOVIMIENTOS (Citas + Ventas Manuales)
export const getFinancialHistory = async (req, res) => {
    try {
        const barberId = req.user.id;
        // Filtros opcionales de fecha (si no envía, trae los últimos 30 días)
        const { startDate, endDate } = req.query;

        // Definir rango
        const start = startDate ? dayjs(startDate).startOf('day').toDate() : dayjs().subtract(30, 'day').toDate();
        const end = endDate ? dayjs(endDate).endOf('day').toDate() : dayjs().endOf('day').toDate();

        // Obtener Citas COMPLETADAS
        const appointments = await prisma.appointment.findMany({
            where: {
                barberId,
                status: 'COMPLETED',
                date: { gte: start, lte: end }
            },
            select: {
                id: true,
                date: true,
                frozenPrice: true,
                service: { select: { name: true } },
                client: { select: { name: true } }
            }
        });

        // Obtener Transacciones Manuales
        const transactions = await prisma.transaction.findMany({
            where: {
                barberId,
                createdAt: { gte: start, lte: end }
            }
        });

        // Unificar y Formatear
        const unifiedHistory = [
            // Mapeamos citas
            ...appointments.map(app => ({
                id: app.id,
                type: 'SERVICE', // Etiqueta para el frontend
                concept: `${app.service.name} - ${app.client.name}`,
                amount: app.frozenPrice,
                method: 'CASH', // Asumido por ahora, o sacar de una futura relación
                date: app.date,
                isManual: false
            })),
            // Mapeamos ventas manuales
            ...transactions.map(tx => ({
                id: tx.id,
                type: tx.type, // PRODUCT, TIP, etc.
                concept: tx.description || 'Venta Manual',
                amount: tx.amount,
                method: tx.method,
                date: tx.createdAt,
                isManual: true
            }))
        ];

        // Ordenar por fecha (El más reciente primero)
        unifiedHistory.sort((a, b) => new Date(b.date) - new Date(a.date));

        res.json(unifiedHistory);

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error al obtener historial" });
    }
};


// 6. HISTORIAL DE CIERRES DE CAJA (Reportes Finales)
export const getDailyCloseHistory = async (req, res) => {
    try {
        const barberId = req.user.id;
        const { startDate, endDate } = req.query;

        // Definir rango de fechas (si no envía, trae todo el historial)
        const whereClause = {
            barberId: barberId
        };

        if (startDate || endDate) {
            whereClause.date = {};
            if (startDate) {
                whereClause.date.gte = dayjs(startDate).startOf('day').toDate();
            }
            if (endDate) {
                whereClause.date.lte = dayjs(endDate).endOf('day').toDate();
            }
        }

        const closes = await prisma.dailyClose.findMany({
            where: whereClause,
            orderBy: {
                date: 'desc' // Los más recientes primero
            }
        });

        res.json(closes);

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error al obtener historial de cierres" });
    }
};