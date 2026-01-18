import { PrismaClient } from '@prisma/client';
import Stripe from 'stripe';

const prisma = new PrismaClient();
// Inicializamos Stripe con la clave secreta
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const createCheckoutSession = async (req, res) => {
    try {
        const barberId = req.user.id;

        // Buscar al barbero y su suscripción actual
        const barber = await prisma.barber.findUnique({
            where: { id: barberId },
            include: { subscription: true }
        });

        if (!barber) return res.status(404).json({ error: "Barbero no encontrado" });

        // Verificar si ya tiene un Stripe Customer ID guardado
        let customerId = barber.subscription?.stripeCustomerId;

        // Si no tiene, lo creamos en Stripe (Solo la primera vez)
        if (!customerId) {
            const customer = await stripe.customers.create({
                email: barber.email,
                name: barber.fullName,
                metadata: {
                    barberId: barberId // Guardamos referencia interna
                }
            });
            customerId = customer.id;

            // Guardamos ese ID en nuestra BD (aunque sea una suscripción FREE o vacía por ahora)
            // Usamos upsert por si no tiene registro en tabla Subscription
            await prisma.subscription.upsert({
                where: { barberId: barberId },
                update: { stripeCustomerId: customerId },
                create: {
                    barberId: barberId,
                    stripeCustomerId: customerId,
                    type: 'FREE',
                    startDate: new Date(),
                    endDate: new Date()
                }
            });
        }

        // Crear la Sesión de Checkout
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'], // Aceptamos tarjeta
            mode: 'subscription',           // Es un pago recurrente
            customer: customerId,           // Vinculamos al cliente que encontramos/creamos
            line_items: [
                {
                    price: process.env.STRIPE_PRICE_ID_PREMIUM, 
                    quantity: 1,
                },
            ],
            // A donde redirige si paga bien:
            success_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
            // A donde redirige si cancela:
            cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/payment/cancel`,
            
            // Un metadato extra para identificarlo fácil luego
            metadata: {
                barberId: barberId
            }
        });

        // Devolvemos la URL al frontend
        res.json({ url: session.url });

    } catch (error) {
        console.error("Error creando sesión de pago:", error);
        res.status(500).json({ error: "Error al iniciar el pago" });
    }
};