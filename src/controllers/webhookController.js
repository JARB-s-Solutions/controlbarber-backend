import { prisma } from "../config/prisma.js";
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);


export const handleStripeWebhook = async (req, res) => {

    // Esta clave cambia. En desarrollo (CLI) te la da la terminal.
    // En producción (Dashboard) te la da la web de Stripe.
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    // Validación de seguridad extra:
    if (!endpointSecret) {
        console.error("❌ Error: STRIPE_WEBHOOK_SECRET no está definido en el .env");
        return res.status(500).send("Server configuration error");
    }

    const sig = req.headers['stripe-signature'];
    let event;

    try {
        // Verificar que el evento viene realmente de Stripe (Seguridad)
        // req.body aquí DEBE ser un buffer (raw), no un objeto JSON
        event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) {
        console.error(`⚠️  Webhook Signature Error: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Manejar los eventos que nos interesan
    switch (event.type) {
        
        // PAGO DE SUSCRIPCIÓN EXITOSO (O primera compra)
        // Ocurre cuando se cobra la factura mensual correctamente
        case 'invoice.payment_succeeded':
            const invoice = event.data.object;
            await handleSubscriptionPaid(invoice);
            break;

        // PAGO FALLIDO (Tarjeta rechazada, sin fondos)
        case 'invoice.payment_failed':
            const invoiceFailed = event.data.object;
            await handleSubscriptionFailed(invoiceFailed);
            break;

        // SUSCRIPCIÓN ELIMINADA (Canceló o dejó de pagar mucho tiempo)
        case 'customer.subscription.deleted':
            const subscription = event.data.object;
            await handleSubscriptionDeleted(subscription);
            break;

        default:
            console.log(` Evento no manejado: ${event.type}`);
    }

    // Responder rápido a Stripe para que sepa que recibimos el mensaje
    res.json({ received: true });
};

// --- FUNCIONES AUXILIARES DE LÓGICA DE BASE DE DATOS ---

async function handleSubscriptionPaid(invoice) {
    const customerId = invoice.customer; 

    // 1. OBTENCIÓN ROBUSTA DE FECHAS 🛡️
    // Stripe a veces cambia dónde pone las fechas dependiendo de la versión de la API.
    // Intentamos buscar en la línea de suscripción primero, si no, usamos la de la factura.
    
    let startTimestamp = invoice.lines?.data?.[0]?.period?.start || 
                         invoice.lines?.data?.[0]?.period_start || 
                         invoice.period_start;

    let endTimestamp = invoice.lines?.data?.[0]?.period?.end || 
                       invoice.lines?.data?.[0]?.period_end || 
                       invoice.period_end;

    // Validación de seguridad: Si por alguna razón siguen siendo null, usamos fecha actual
    if (!startTimestamp) startTimestamp = Math.floor(Date.now() / 1000);
    if (!endTimestamp) endTimestamp = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60); // +30 días aprox

    // Convertimos de segundos (Stripe) a Milisegundos (JS/Prisma)
    const startDate = new Date(startTimestamp * 1000);
    const endDate = new Date(endTimestamp * 1000);

    console.log(`💰 Pago recibido de Cliente ${customerId}`);
    console.log(`📅 Periodo: ${startDate.toISOString()} - ${endDate.toISOString()}`);

    try {
        // Buscar qué barbero tiene este customerId y actualizarlo
        // Usamos updateMany por seguridad si el campo no fuera único, aunque debería serlo.
        await prisma.subscription.update({
            where: { stripeCustomerId: customerId },
            data: {
                status: 'ACTIVE',
                type: 'PREMIUM',
                startDate: startDate,
                endDate: endDate
            }
        });
        console.log("✅ Suscripción actualizada en BD");
    } catch (error) {
        console.error("❌ Error actualizando BD en Webhook:", error);
        // No lanzamos error para que Stripe no reintente infinitamente si es un error de lógica nuestra
    }
}

async function handleSubscriptionFailed(invoice) {
    const customerId = invoice.customer;
    console.log(` Pago fallido de Cliente ${customerId}`);

    // Podríamos marcarla como PENDING o EXPIRED hasta que pague
    await prisma.subscription.update({
        where: { stripeCustomerId: customerId },
        data: { status: 'PENDING' } // O 'EXPIRED' según prefieras
    });
}

async function handleSubscriptionDeleted(subscription) {
    const customerId = subscription.customer;
    console.log(` Suscripción cancelada de Cliente ${customerId}`);

    await prisma.subscription.update({
        where: { stripeCustomerId: customerId },
        data: { 
            status: 'CANCELLED',
            type: 'FREE' // Lo regresamos al plan gratuito
        }
    });
}