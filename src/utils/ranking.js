import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const updateBarberRanking = async (barberId) => {
    try {
        // 1. Obtener estadísticas del barbero
        
        const reviews = await prisma.review.findMany({
            where: { barberId: barberId }
        });

        const totalReviews = reviews.length;
        
        // Si no tiene reviews, score es 0
        if (totalReviews === 0) {
            await prisma.barber.update({
                where: { id: barberId },
                data: { rankingScore: 0 }
            });
            return;
        }

        // 2. Calcular Promedio de Estrellas
        const sumRating = reviews.reduce((acc, curr) => acc + curr.rating, 0);
        const avgRating = sumRating / totalReviews;

        // 3. Obtener Citas Completadas (Factor de Experiencia)
        const completedAppointments = await prisma.appointment.count({
            where: { 
                barberId: barberId,
                status: 'COMPLETED'
            }
        });

        // 4. ALGORITMO DE RANKING (Personalizable)
        // Peso: 70% Calidad (Estrellas) + 30% Popularidad (Citas)
        // Normalizamos las citas (ej: 100 citas es el "máximo" esperado para normalizar a 5)
        
        const popularityScore = Math.min(completedAppointments / 100, 1) * 5; // Max 5 puntos
        
        // Fórmula: (Promedio * 0.7) + (Popularidad * 0.3)
        // Ejemplo: 4.8 estrellas y 200 citas = (4.8 * 0.7) + (5 * 0.3) = 3.36 + 1.5 = 4.86 Score
        let finalScore = (avgRating * 0.7) + (popularityScore * 0.3);

        // BONUS: Si es PREMIUM, le damos un pequeño boost (ej: +0.2)
        const barber = await prisma.barber.findUnique({
            where: { id: barberId },
            include: { subscription: true }
        });
        
        if (barber.subscription?.type === 'PREMIUM' && barber.subscription?.status === 'ACTIVE') {
            finalScore += 0.2;
        }

        // Limitar a 5.0 máximo
        finalScore = Math.min(finalScore, 5.0);

        // 5. Guardar en BD
        await prisma.barber.update({
            where: { id: barberId },
            data: { rankingScore: finalScore }
        });

        console.log(`⭐ Ranking actualizado para ${barber.fullName}: ${finalScore}`);

    } catch (error) {
        console.error("Error actualizando ranking:", error);
    }
};