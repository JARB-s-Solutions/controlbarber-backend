import { PrismaClient } from '@prisma/client';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import duration from 'dayjs/plugin/duration.js';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(duration);

const prisma = new PrismaClient();

export const getDashboardStats = async (req, res) => {
    try {
        const barberId = req.user.id;
        const userTimeZone = req.query.timeZone || 'UTC';

        
        // DEFINICIÓN DE RANGOS DE TIEMPO
        
        const now = dayjs().tz(userTimeZone);
        
        const startOfToday = now.startOf('day').toDate();
        const endOfToday = now.endOf('day').toDate();
        
        const startOfYesterday = now.subtract(1, 'day').startOf('day').toDate();
        const endOfYesterday = now.subtract(1, 'day').endOf('day').toDate();
        
        const startOfWeek = now.startOf('week').toDate(); // Domingo/Lunes según locale
        const endOfWeek = now.endOf('week').toDate();

        
        // CONSULTAS EN PARALELO (Optimización) 
        
        const [
            // Finanzas HOY (Ingresos totales y propinas)
            financesToday,
            
            // Finanzas AYER (Para comparación)
            financesYesterday,
            
            // Citas de HOY (Para contadores y ocupación)
            appointmentsToday,
            
            // Próxima Cita
            nextAppointment,
            
            // Finanzas de la SEMANA
            financesWeek,

            // Ventas de Productos HOY
            productSalesToday,
            
            // Datos del Barbero (Ranking y Horario)
            barberData,

            // Reviews Recientes
            recentReviews,

            // Bloqueos de hoy (Para ocupación)
            todayBlocks

        ] = await Promise.all([
            
            prisma.transaction.aggregate({
                _sum: { amount: true },
                where: { 
                    barberId, 
                    type: { not: 'WITHDRAWAL' }, // Solo ingresos
                    createdAt: { gte: startOfToday, lte: endOfToday } 
                }
            }),
            
            prisma.transaction.aggregate({
                _sum: { amount: true },
                where: { 
                    barberId, 
                    type: { not: 'WITHDRAWAL' },
                    createdAt: { gte: startOfYesterday, lte: endOfYesterday } 
                }
            }),
            // (Traemos duración para calcular ocupación)
            prisma.appointment.findMany({
                where: { barberId, date: { gte: startOfToday, lte: endOfToday } },
                select: { status: true, service: { select: { durationMin: true } } }
            }),
            
            prisma.appointment.findFirst({
                where: { 
                    barberId, 
                    status: { in: ['PENDING', 'CONFIRMED'] },
                    date: { gt: now.toDate() } // Mayor a ahora mismo
                },
                orderBy: { date: 'asc' },
                include: { client: { select: { name: true } }, service: { select: { name: true, durationMin: true } } }
            }),
            
            prisma.transaction.aggregate({
                _sum: { amount: true },
                where: { 
                    barberId, 
                    type: { not: 'WITHDRAWAL' },
                    createdAt: { gte: startOfWeek, lte: endOfWeek } 
                }
            }),
            
            prisma.transaction.aggregate({
                _sum: { amount: true },
                _count: { id: true },
                where: { 
                    barberId, 
                    type: 'PRODUCT', 
                    createdAt: { gte: startOfToday, lte: endOfToday } 
                }
            }),
            // Traemos el Score y la config del día de la semana actual (0-6)
            prisma.barber.findUnique({
                where: { id: barberId },
                select: { 
                    rankingScore: true,
                    schedules: { 
                        where: { dayOfWeek: now.day() } 
                    }
                }
            }),
            
            prisma.review.findMany({
                where: { barberId },
                orderBy: { createdAt: 'desc' },
                take: 3,
                select: { 
                    id: true, rating: true, comment: true, createdAt: true, 
                    appointment: { select: { client: { select: { name: true } } } }
                }
            }),
            
            prisma.scheduleBlock.findMany({
                where: {
                    barberId,
                    OR: [
                        { startDate: { lte: endOfToday }, endDate: { gte: startOfToday } }
                    ]
                }
            })
        ]);

        
        // PROCESAMIENTO Y LÓGICA 
        

        // --- Consulta extra: Propinas de HOY (Separadas) ---
        // (La hacemos aparte o filtramos en memoria si trajéramos todas las transacciones, 
        //  pero una aggregate extra es barata)
        const tipsToday = await prisma.transaction.aggregate({
            _sum: { amount: true },
            where: { 
                barberId, 
                type: 'TIP', 
                createdAt: { gte: startOfToday, lte: endOfToday } 
            }
        });


        // GANANCIA DE HOY
        const incomeToday = Number(financesToday._sum.amount || 0);
        const incomeYesterday = Number(financesYesterday._sum.amount || 0);
        const incomeTips = Number(tipsToday._sum.amount || 0);
        
        // Cálculo de porcentaje vs ayer
        let percentageGrowth = 0;
        if (incomeYesterday === 0) {
            percentageGrowth = incomeToday > 0 ? 100 : 0;
        } else {
            percentageGrowth = ((incomeToday - incomeYesterday) / incomeYesterday) * 100;
        }


        // PRÓXIMA CITA
        let nextApptData = null;
        if (nextAppointment) {
            const apptDate = dayjs(nextAppointment.date).tz(userTimeZone);
            const diffMinutes = apptDate.diff(now, 'minute');
            
            // Formatear tiempo restante amigable
            let timeRemainingString = "";
            if (diffMinutes < 60) timeRemainingString = `${diffMinutes} min`;
            else {
                const hours = Math.floor(diffMinutes / 60);
                const mins = diffMinutes % 60;
                timeRemainingString = `${hours}h ${mins}m`;
            }

            nextApptData = {
                time: apptDate.format('HH:mm'),
                client: nextAppointment.client.name,
                service: nextAppointment.service.name,
                timeLeft: timeRemainingString
            };
        }


        // CITAS DEL DÍA
        let counts = { total: 0, completed: 0, pending: 0, cancelled: 0 };
        appointmentsToday.forEach(app => {
            counts.total++;
            if (app.status === 'COMPLETED') counts.completed++;
            if (app.status === 'PENDING' || app.status === 'CONFIRMED') counts.pending++;
            if (app.status === 'CANCELLED' || app.status === 'NO_SHOW') counts.cancelled++;
        });


        // VENTAS PROPIAS
        const productSalesAmount = Number(productSalesToday._sum.amount || 0);
        const productsCount = productSalesToday._count.id;
        // Servicios realizados = Citas completadas
        const servicesCount = counts.completed; 


        // RESUMEN SEMANAL
        const incomeWeek = Number(financesWeek._sum.amount || 0);
        // Aproximación de días trabajados (Día de la semana actual + 1, asumiendo que trabajó)
        // Ojo: Para mayor precisión se necesitaría contar DailyOpens de la semana.
        // Usaremos el índice del día actual (0-6) + 1 como divisor simple.
        const daysPassed = now.day() === 0 ? 1 : now.day() + 1; // Ajuste simple
        const dailyAverage = incomeWeek / daysPassed;


        // OCUPACIÓN DEL DÍA (Lógica de Tiempo) ⏳
        let occupancyPercent = 0;
        let freeHours = 0;
        
        const config = barberData.schedules[0]; // Horario de hoy
        
        if (config && config.isWorkDay) {
            // Calcular minutos totales laborables
            // Truco: Usar una fecha base para restar horas
            const startT = dayjs(config.startTime); 
            const endT = dayjs(config.endTime);
            
            // Si cierra al día siguiente (ej 00:00), sumar 1 día
            let totalMinutesAvailable = endT.diff(startT, 'minute');
            if (totalMinutesAvailable < 0) totalMinutesAvailable += 1440; // +24h

            // Restar descanso si existe
            if (config.breakStart && config.breakEnd) {
                const bStart = dayjs(config.breakStart);
                const bEnd = dayjs(config.breakEnd);
                let breakMins = bEnd.diff(bStart, 'minute');
                if (breakMins < 0) breakMins += 1440;
                totalMinutesAvailable -= breakMins;
            }

            // Restar Bloqueos de hoy (Estimado simple)
            // Si hay un bloqueo, asumimos que resta capacidad. 
            todayBlocks.forEach(block => {
                const bStart = dayjs(block.startDate);
                const bEnd = dayjs(block.endDate);
                const duration = bEnd.diff(bStart, 'minute');
                totalMinutesAvailable -= duration;
            });

            // Calcular minutos ocupados por citas (NO Canceladas)
            let minutesOccupied = 0;
            appointmentsToday.forEach(app => {
                if (app.status !== 'CANCELLED' && app.status !== 'NO_SHOW') {
                    minutesOccupied += app.service.durationMin;
                }
            });

            // Resultado final
            if (totalMinutesAvailable > 0) {
                occupancyPercent = Math.round((minutesOccupied / totalMinutesAvailable) * 100);
                // Tope 100% (por si hubo horas extra)
                if (occupancyPercent > 100) occupancyPercent = 100;

                const freeMinutes = totalMinutesAvailable - minutesOccupied;
                freeHours = (freeMinutes / 60).toFixed(1);
            }
        }


        // REVIEWS RECIENTES
        const formattedReviews = recentReviews.map(r => ({
            id: r.id,
            client: r.appointment.client.name,
            rating: r.rating,
            comment: r.comment,
            date: r.createdAt
        }));


        // RETORNO FINAL
        res.json({
            // 1
            today: {
                totalIncome: incomeToday,
                tips: incomeTips,
                growthPercentage: parseFloat(percentageGrowth.toFixed(1))
            },
            // 3
            nextAppointment: nextApptData,
            // 4
            appointments: {
                total: counts.total,
                completed: counts.completed,
                pending: counts.pending,
                cancelled: counts.cancelled
            },
            // 5
            sales: {
                totalDay: incomeToday, // Total general
                servicesPerformed: servicesCount,
                productsSold: productsCount,
                productIncome: productSalesAmount
            },
            // 6
            week: {
                totalIncome: incomeWeek,
                dailyAverage: parseFloat(dailyAverage.toFixed(2))
            },
            // 7
            occupancy: {
                percent: occupancyPercent,
                freeHours: Number(freeHours),
                blocksUsed: todayBlocks.length // Bloques no disponibles
            },
            // 8
            reputation: {
                score: Number(barberData.rankingScore),
                recent: formattedReviews
            }
        });

    } catch (error) {
        console.error("Dashboard Error:", error);
        res.status(500).json({ error: "Error cargando dashboard" });
    }
};