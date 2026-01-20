import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';

dayjs.extend(utc);
dayjs.extend(timezone);

const prisma = new PrismaClient();

// --- HELPER: Verificar si la caja está abierta ---
const ensureDayIsOpen = async (barberId, date) => {
    const isOpen = await prisma.dailyOpen.findUnique({
        where: { barberId_date: { barberId, date } }
    });
    
    // Verificar si ya cerró también (no puedes vender si ya cerraste)
    const isClosed = await prisma.dailyClose.findUnique({
        where: { barberId_date: { barberId, date } }
    });

    if (!isOpen) throw new Error("CAJA_CERRADA");
    if (isClosed) throw new Error("DIA_FINALIZADO");
    return isOpen; // Retorna los datos de apertura (incluida la base)
};

// ==========================================
// 1. APERTURA DE CAJA 🟢
// ==========================================
const openDaySchema = z.object({
    initialCash: z.number().min(0).default(0), // Dinero base/cambio
    timeZone: z.string().optional().default('UTC')
});

export const openDay = async (req, res) => {
    try {
        const { initialCash, timeZone } = openDaySchema.parse(req.body);
        const barberId = req.user.id;

        const now = dayjs().tz(timeZone);
        const dateForDb = now.startOf('day').toDate();

        // Verificar si ya abrió hoy
        const existingOpen = await prisma.dailyOpen.findUnique({
            where: { barberId_date: { barberId, date: dateForDb } }
        });

        if (existingOpen) {
            return res.status(409).json({ error: "Ya has realizado la apertura de caja hoy." });
        }

        const newOpen = await prisma.dailyOpen.create({
            data: {
                barberId,
                date: dateForDb,
                initialCash: initialCash
            }
        });

        res.status(201).json({ message: "Caja abierta correctamente", data: newOpen });

    } catch (error) {
        if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
        console.error(error);
        res.status(500).json({ error: "Error al abrir la caja" });
    }
};

// ==========================================
// 2. COBRAR CITA (Con validación de caja)
// ==========================================
const chargeAppointmentSchema = z.object({
    appointmentId: z.string().uuid(),
    method: z.enum(['CASH', 'TRANSFER', 'CARD']),
    amount: z.number().positive().optional(),
    tip: z.number().min(0).optional(),
    timeZone: z.string().optional().default('UTC')
});

export const chargeAppointment = async (req, res) => {
    try {
        const { appointmentId, method, amount, tip, timeZone } = chargeAppointmentSchema.parse(req.body);
        const barberId = req.user.id;
        const todayDate = dayjs().tz(timeZone).startOf('day').toDate();

        // 🔒 VALIDAR CAJA ABIERTA
        try {
            await ensureDayIsOpen(barberId, todayDate);
        } catch (e) {
            if (e.message === "CAJA_CERRADA") return res.status(403).json({ error: "Debes realizar la APERTURA DE CAJA antes de cobrar." });
            if (e.message === "DIA_FINALIZADO") return res.status(403).json({ error: "El día ya fue cerrado. No puedes realizar más cobros." });
        }

        // Buscar la cita
        const appointment = await prisma.appointment.findUnique({
            where: { id: appointmentId },
            include: { service: true, client: true }
        });

        if (!appointment) return res.status(404).json({ error: "Cita no encontrada" });
        if (appointment.barberId !== barberId) return res.status(403).json({ error: "No tienes permiso" });
        if (appointment.status === 'COMPLETED' || appointment.status === 'CANCELLED') {
            return res.status(400).json({ error: "Esta cita ya fue procesada anteriormente" });
        }

        const finalAmount = amount !== undefined ? amount : Number(appointment.frozenPrice);

        const result = await prisma.$transaction(async (tx) => {
            const serviceTx = await tx.transaction.create({
                data: {
                    barberId,
                    appointmentId,
                    type: 'SERVICE',
                    amount: finalAmount,
                    method: method,
                    description: `Cobro Cita: ${appointment.service.name}`
                }
            });

            if (tip && tip > 0) {
                await tx.transaction.create({
                    data: {
                        barberId,
                        appointmentId,
                        type: 'TIP',
                        amount: tip,
                        method: method,
                        description: `Propina - ${appointment.client.name}`
                    }
                });
            }

            const updatedAppt = await tx.appointment.update({
                where: { id: appointmentId },
                data: { status: 'COMPLETED' }
            });

            return { serviceTx, updatedAppt };
        });

        res.json({ 
            message: "Cobro realizado exitosamente", 
            transaction: result.serviceTx 
        });

    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.errors });
        }
        console.error("Error cobrando cita:", error);
        res.status(500).json({ error: "Error al procesar el cobro" });
    }
};

// ==========================================
// 3. VENTA MANUAL / GASTO (Con validación)
// ==========================================
const createTransactionSchema = z.object({
    type: z.enum(['SERVICE', 'PRODUCT', 'TIP', 'OTHER', 'WITHDRAWAL']),
    amount: z.number().positive(),
    method: z.enum(['CASH', 'TRANSFER', 'CARD']),
    description: z.string().optional(),
    timeZone: z.string().optional().default('UTC')
});

export const createTransaction = async (req, res) => {
    try {
        const data = createTransactionSchema.parse(req.body);
        const barberId = req.user.id;
        const todayDate = dayjs().tz(data.timeZone).startOf('day').toDate();

        // 🔒 VALIDAR CAJA ABIERTA
        let dailyOpen;
        try {
            dailyOpen = await ensureDayIsOpen(barberId, todayDate);
        } catch (e) {
            if (e.message === "CAJA_CERRADA") return res.status(403).json({ error: "Debes abrir caja antes de registrar movimientos." });
            if (e.message === "DIA_FINALIZADO") return res.status(403).json({ error: "El día ya fue cerrado. No puedes realizar más movimientos." });
            throw e;
        }

        // VALIDACIÓN DE FONDOS (Para Retiros en Efectivo)
        if (data.type === 'WITHDRAWAL' && data.method === 'CASH') {
            const startOfDay = todayDate;

            // Ingresos CASH del día
            const totalIn = await prisma.transaction.aggregate({
                _sum: { amount: true },
                where: { 
                    barberId, 
                    method: 'CASH', 
                    type: { not: 'WITHDRAWAL' }, 
                    createdAt: { gte: startOfDay } 
                }
            });

            // Salidas CASH del día
            const totalOut = await prisma.transaction.aggregate({
                _sum: { amount: true },
                where: { 
                    barberId, 
                    method: 'CASH', 
                    type: 'WITHDRAWAL', 
                    createdAt: { gte: startOfDay } 
                }
            });

            // 💰 EFECTIVO DISPONIBLE = (Base Inicial + Ventas) - Retiros
            const initialBase = Number(dailyOpen.initialCash);
            const salesCash = Number(totalIn._sum.amount || 0);
            const withdrawalsCash = Number(totalOut._sum.amount || 0);
            
            const currentCash = (initialBase + salesCash) - withdrawalsCash;

            if (data.amount > currentCash) {
                return res.status(400).json({ 
                    error: `Fondos insuficientes. En caja hay: $${currentCash.toFixed(2)} (Base: $${initialBase} + Ventas: $${salesCash} - Retiros: $${withdrawalsCash})` 
                });
            }
        }

        const newTransaction = await prisma.transaction.create({
            data: {
                barberId,
                type: data.type,
                amount: data.amount,
                method: data.method,
                description: data.description 
            }
        });

        res.status(201).json(newTransaction);

    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.errors });
        }
        console.error(error);
        res.status(500).json({ error: "Error al registrar movimiento" });
    }
};

// ==========================================
// 4. RESUMEN DEL DÍA (Con Base Inicial) 📊
// ==========================================
export const getDailySummary = async (req, res) => {
    try {
        const barberId = req.user.id;
        const userTimeZone = req.query.timeZone || 'UTC';

        const now = dayjs().tz(userTimeZone);
        const startOfDay = now.startOf('day').toDate();
        const endOfDay = now.endOf('day').toDate();

        // Obtener la BASE INICIAL
        const dailyOpen = await prisma.dailyOpen.findUnique({
            where: { barberId_date: { barberId, date: startOfDay } }
        });

        const initialCash = dailyOpen ? Number(dailyOpen.initialCash) : 0;
        const isOpened = !!dailyOpen;

        // Sumar INGRESOS por Citas
        const appointments = await prisma.appointment.aggregate({
            _sum: { frozenPrice: true },
            where: {
                barberId,
                status: 'COMPLETED',
                date: { gte: startOfDay, lte: endOfDay }
            }
        });

        // Sumar INGRESOS Manuales
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
                type: 'WITHDRAWAL',
                createdAt: { gte: startOfDay, lte: endOfDay }
            }
        });

        const totalServices = Number(appointments._sum.frozenPrice || 0);
        const totalManualIncome = Number(incomeTransactions._sum.amount || 0);
        const totalWithdrawals = Number(withdrawals._sum.amount || 0);

        // TOTAL EN CAJA = (Base + Servicios + Manuales) - Retiros
        const totalBalance = (initialCash + totalServices + totalManualIncome) - totalWithdrawals;

        res.json({
            status: isOpened ? "OPEN" : "CLOSED_OR_PENDING",
            date: now.format('YYYY-MM-DD'),
            initialBase: initialCash,
            inflow: {
                services: totalServices,
                manual: totalManualIncome
            },
            outflow: {
                withdrawals: totalWithdrawals
            },
            balance: totalBalance
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error al obtener resumen" });
    }
};

// ==========================================
// 5. CIERRE DE CAJA (Con validación de apertura)
// ==========================================
export const performDailyClose = async (req, res) => {
    try {
        const barberId = req.user.id;
        const userTimeZone = req.body.timeZone || 'UTC';

        const now = dayjs().tz(userTimeZone);
        const dateForDb = now.startOf('day').toDate();
        const startOfDay = now.startOf('day').toDate();
        const endOfDay = now.endOf('day').toDate();

        // 1. Verificar si abrió caja
        const dailyOpen = await prisma.dailyOpen.findUnique({
            where: { barberId_date: { barberId, date: dateForDb } }
        });
        if (!dailyOpen) {
            return res.status(400).json({ error: "No puedes cerrar caja si no la has abierto hoy." });
        }

        // 2. Verificar si ya cerró
        const existingClose = await prisma.dailyClose.findUnique({
            where: { barberId_date: { barberId, date: dateForDb } }
        });
        if (existingClose) return res.status(409).json({ error: "Ya has cerrado caja hoy" });

        // CALCULAR INGRESOS
        const appointmentsSum = await prisma.appointment.aggregate({
            _sum: { frozenPrice: true },
            where: { barberId, status: 'COMPLETED', date: { gte: startOfDay, lte: endOfDay } }
        });
        
        const incomeCash = await prisma.transaction.aggregate({
            _sum: { amount: true },
            where: { 
                barberId, 
                method: 'CASH', 
                type: { not: 'WITHDRAWAL' },
                createdAt: { gte: startOfDay, lte: endOfDay } 
            }
        });
        
        const incomeTransfer = await prisma.transaction.aggregate({
            _sum: { amount: true },
            where: { 
                barberId, 
                method: 'TRANSFER', 
                type: { not: 'WITHDRAWAL' },
                createdAt: { gte: startOfDay, lte: endOfDay } 
            }
        });

        // CALCULAR RETIROS
        const withdrawalCash = await prisma.transaction.aggregate({
            _sum: { amount: true },
            where: { 
                barberId, 
                type: 'WITHDRAWAL', 
                method: 'CASH', 
                createdAt: { gte: startOfDay, lte: endOfDay } 
            }
        });
        
        const withdrawalTransfer = await prisma.transaction.aggregate({
            _sum: { amount: true },
            where: { 
                barberId, 
                type: 'WITHDRAWAL', 
                method: 'TRANSFER', 
                createdAt: { gte: startOfDay, lte: endOfDay } 
            }
        });

        // MATEMÁTICA FINAL (Incluyendo BASE en el Efectivo)
        const totalAppts = Number(appointmentsSum._sum.frozenPrice || 0);
        const initialBase = Number(dailyOpen.initialCash);
        
        const totalCash = (initialBase + totalAppts + Number(incomeCash._sum.amount || 0)) - Number(withdrawalCash._sum.amount || 0);
        const totalTransfer = Number(incomeTransfer._sum.amount || 0) - Number(withdrawalTransfer._sum.amount || 0);
        const totalDay = totalCash + totalTransfer;

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

// ==========================================
// 6. REABRIR CAJA
// ==========================================
export const undoDailyClose = async (req, res) => {
    try {
        const barberId = req.user.id;
        const userTimeZone = req.body.timeZone || 'UTC';
        
        const now = dayjs().tz(userTimeZone);
        const dateForDb = now.startOf('day').toDate();

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

// ==========================================
// 7. HISTORIAL DE MOVIMIENTOS
// ==========================================
export const getFinancialHistory = async (req, res) => {
    try {
        const barberId = req.user.id;
        const { startDate, endDate } = req.query;

        const start = startDate ? dayjs(startDate).startOf('day').toDate() : dayjs().subtract(30, 'day').toDate();
        const end = endDate ? dayjs(endDate).endOf('day').toDate() : dayjs().endOf('day').toDate();

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

        const transactions = await prisma.transaction.findMany({
            where: {
                barberId,
                createdAt: { gte: start, lte: end }
            }
        });

        const unifiedHistory = [
            ...appointments.map(app => ({
                id: app.id,
                type: 'SERVICE',
                concept: `${app.service.name} - ${app.client.name}`,
                amount: app.frozenPrice,
                method: 'CASH',
                date: app.date,
                isManual: false
            })),
            ...transactions.map(tx => ({
                id: tx.id,
                type: tx.type,
                concept: tx.description || 'Venta Manual',
                amount: tx.amount,
                method: tx.method,
                date: tx.createdAt,
                isManual: true
            }))
        ];

        unifiedHistory.sort((a, b) => new Date(b.date) - new Date(a.date));

        res.json(unifiedHistory);

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error al obtener historial" });
    }
};

// ==========================================
// 8. HISTORIAL DE CIERRES
// ==========================================
export const getDailyCloseHistory = async (req, res) => {
    try {
        const barberId = req.user.id;
        const { startDate, endDate } = req.query;

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
                date: 'desc'
            }
        });

        res.json(closes);

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error al obtener historial de cierres" });
    }
};


