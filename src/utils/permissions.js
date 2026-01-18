import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const checkPlanLimits = async (barberId) => {
    // 1. Obtenemos la suscripción
    const sub = await prisma.subscription.findUnique({
        where: { barberId }
    });

    // Si no tiene suscripción o está vencida, asumimos FREE
    // Aquí asumiremos que el defecto es FREE si no existe o está activa.
    const plan = (sub && sub.status === 'ACTIVE') ? sub.type : 'FREE';

    return {
        plan,
        isPremium: plan === 'PREMIUM',
        limits: {
            maxServices: plan === 'PREMIUM' ? Infinity : 5,
            maxPhotos: plan === 'PREMIUM' ? Infinity : 5,
            canReceiveBookings: plan === 'PREMIUM', // Solo premium recibe reservas online
            hasEmailNotifications: plan === 'PREMIUM' // Solo premium envía correos
        }
    };
};