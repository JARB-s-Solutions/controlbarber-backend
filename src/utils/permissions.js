import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const checkPlanLimits = async (barbershopId) => {
    // 1. Obtenemos la suscripción DE LA SUCURSAL
    const sub = await prisma.subscription.findUnique({
        where: { barbershopId }
    });

    const plan = (sub && sub.status === 'ACTIVE') ? sub.type : 'FREE';

    return {
        plan,
        isPremium: plan === 'PREMIUM' || plan === 'ENTERPRISE',
        limits: {
            maxStaff: plan === 'PREMIUM' ? 5 : (plan === 'ENTERPRISE' ? Infinity : 1), // Limite de empleados
            maxServices: plan === 'FREE' ? 5 : Infinity,
            maxPhotos: plan === 'FREE' ? 5 : Infinity,
            canReceiveBookings: plan !== 'FREE', 
            hasEmailNotifications: plan !== 'FREE' 
        }
    };
};