import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Obtener Perfil Público Completo (Vista Cliente)
export const getBarberProfile = async (req, res) => {
    try {
        const { id } = req.params; // Puede ser UUID o Slug

        // Detectar si es UUID o Slug
        const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(id);
        const whereClause = isUuid ? { id } : { slug: id };

        // Consulta Maestra del Barbero
        const barber = await prisma.barber.findUnique({
            where: whereClause,
            select: {
                id: true,
                fullName: true,
                slug: true,
                phone: true,
                avatarUrl: true,
                rankingScore: true,
                isActive: true,
                
                subscription: { select: { status: true, type: true } },
                services: {
                    where: { isActive: true },
                    select: { id: true, name: true, price: true, durationMin: true }
                },
                gallery: {
                    take: 12,
                    orderBy: { createdAt: 'desc' },
                    select: { id: true, imageUrl: true, service: { select: { name: true } } }
                },
                schedules: {
                    where: { isWorkDay: true },
                    orderBy: { dayOfWeek: 'asc' },
                    select: { dayOfWeek: true, startTime: true, endTime: true, breakStart: true, breakEnd: true }
                }
            }
        });

        // --- VALIDACIONES ---
        if (!barber) return res.status(404).json({ error: "Barbería no encontrada" });
        if (!barber.isActive) return res.status(403).json({ error: "Barbería inactiva." });
        if (!barber.subscription || barber.subscription.status !== 'ACTIVE') {
            return res.status(403).json({ error: "Perfil no disponible (Suscripción)." });
        }

        const hasServices = barber.services.length > 0;
        const hasSchedule = barber.schedules.length > 0;
        if (!hasServices || !hasSchedule) {
            return res.status(422).json({ error: "Perfil en configuración." });
        }

        // --- OBTENER RESEÑAS (NUEVO BLOQUE) ⭐ ---
        // Buscamos las reseñas que pertenecen a citas de este barbero
        const rawReviews = await prisma.review.findMany({
            where: {
                appointment: {
                    barberId: barber.id // Filtro clave: Citas de ESTE barbero
                },
                isVisible: true // Solo las que no hayan sido ocultadas por moderación
            },
            take: 10, // Traemos las últimas 10
            orderBy: { createdAt: 'desc' }, // Las más recientes primero
            select: {
                id: true,
                rating: true,
                comment: true,
                createdAt: true,
                appointment: {
                    select: {
                        client: { select: { name: true } }, // Nombre del cliente
                        service: { select: { name: true } } // Qué servicio se hizo (opcional)
                    }
                }
            }
        });

        // --- PREPARAR DATOS ---
        
        // Total de reseñas
        const reviewCount = await prisma.appointment.count({
            where: { barberId: barber.id, review: { isNot: null } }
        });

        // Formatear Horarios
        const formatTime = (dateObj) => dateObj ? dateObj.toISOString().split('T')[1].substring(0, 5) : null;
        const formattedSchedule = barber.schedules.map(day => ({
            dayOfWeek: day.dayOfWeek,
            startTime: formatTime(day.startTime),
            endTime: formatTime(day.endTime),
            breakStart: formatTime(day.breakStart),
            breakEnd: formatTime(day.breakEnd)
        }));

        // Formatear Reseñas (Limpiar estructura)
        const formattedReviews = rawReviews.map(review => ({
            id: review.id,
            author: review.appointment.client.name, // "Juan Pérez"
            rating: review.rating,
            comment: review.comment,
            date: review.createdAt,
            serviceName: review.appointment.service.name // "Corte Clásico"
        }));

        // Respuesta Final
        res.json({
            profile: {
                id: barber.id,
                name: barber.fullName,
                slug: barber.slug,
                avatar: barber.avatarUrl,
                phone: barber.phone,
                rating: barber.rankingScore, // El promedio ya calculado (ej: 4.8)
                reviewCount: reviewCount,
                plan: barber.subscription.type
            },
            services: barber.services,
            gallery: barber.gallery,
            schedule: formattedSchedule,
            reviews: formattedReviews 
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error interno al obtener perfil" });
    }
};