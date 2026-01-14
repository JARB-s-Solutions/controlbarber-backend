import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { createNotification } from './notificationController.js';
import { sendNewReviewNotificationToBarber } from '../utils/email.js';

const prisma = new PrismaClient();

const reviewSchema = z.object({
    token: z.string(),
    rating: z.number().min(1).max(5),
    comment: z.string().optional()
});

export const createReview = async (req, res) => {
    try {
        const { token, rating, comment } = reviewSchema.parse(req.body);

        // 1. Validar Token
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch (err) {
            return res.status(401).json({ error: "Link de reseña inválido o expirado" });
        }

        const { appointmentId } = decoded;

        // Verificar estado de la cita
        const appointment = await prisma.appointment.findUnique({
            where: { id: appointmentId },
            include: {
                barber: true, // <--- Traer al barbero para obtener su email
                client: true  // <--- Traer al cliente para saber quién escribió
            }
        });

        if (!appointment || appointment.status !== 'COMPLETED') {
            return res.status(400).json({ error: "La cita no es válida para calificar" });
        }

        // Evitar duplicados
        const existingReview = await prisma.review.findUnique({
            where: { appointmentId }
        });

        if (existingReview) {
            return res.status(409).json({ error: "Ya has calificado esta cita anteriormente" });
        }

        // Guardar Reseña (Transacción implícita)
        // Guardamos la reseña primero para que entre en el cálculo del promedio
        const review = await prisma.review.create({
            data: {
                appointmentId,
                rating,
                comment
            }
        });


        // 5. ALGORITMO DE RANKING Y ACTUALIZACIÓN 📊

        
        // Calcular el promedio actualizado incluyendo la nueva reseña
        const aggregations = await prisma.review.aggregate({
            _avg: { rating: true },
            where: {
                appointment: {
                    barberId: appointment.barberId // Filtramos todas las reviews de este barbero
                }
            }
        });

        // Procesar el resultado (Manejo de nulos y redondeo)
        const rawAvg = aggregations._avg.rating || 0;
        
        // Convertimos a 2 decimales fijos (ej: 4.666 -> "4.67" -> 4.67)
        // Esto evita errores de precisión con el tipo Decimal de la BD
        const newScore = parseFloat(rawAvg.toFixed(2));

        // Actualizar el perfil del barbero
        await prisma.barber.update({
            where: { id: appointment.barberId },
            data: { rankingScore: newScore }
        });


        // Notificar al Barbero 🔔
        await createNotification(
            appointment.barberId,
            "Nueva Reseña Recibida",
            `Has recibido ${rating} estrellas. ${comment ? '"' + comment + '"' : ''}`
        );


        // B. Notificación por Email al Barbero
        if (appointment.barber.email) {
            sendNewReviewNotificationToBarber(
                appointment.barber.email,
                appointment.barber.fullName,
                appointment.client.name, // Nombre del cliente que opinó
                rating,
                comment
            );
        }


        res.status(201).json({ 
            message: "¡Gracias por tu opinión!", 
            review,
            newBarberScore: newScore // Opcional: devolver el nuevo score
        });

    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.errors });
        }
        console.error(error);
        res.status(500).json({ error: "Error al guardar reseña" });
    }
};