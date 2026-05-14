import { prisma } from "../config/prisma.js";
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { createNotification } from './notificationController.js';
import { sendNewReviewNotificationToBarber } from '../utils/email.js';


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

        // 2. Verificar estado de la cita
        const appointment = await prisma.appointment.findUnique({
            where: { id: appointmentId },
            include: {
                barber: true, 
                client: true  
            }
        });

        if (!appointment || appointment.status !== 'COMPLETED') {
            return res.status(400).json({ error: "La cita no es válida para calificar" });
        }

        // 3. Evitar duplicados
        const existingReview = await prisma.review.findUnique({
            where: { appointmentId }
        });

        if (existingReview) {
            return res.status(409).json({ error: "Ya has calificado esta cita anteriormente" });
        }

        // 4. Guardar Reseña (Con relación directa optimizada)
        const review = await prisma.review.create({
            data: {
                appointmentId,
                barberId: appointment.barberId, // <--- Guardamos el ID directo
                rating,
                comment
            }
        });

        // =========================================================
        // 5. 📊 ACTUALIZACIÓN AUTOMÁTICA DE RANKING (Bayesiano)
        // =========================================================
        
        // A. Obtenemos estadísticas usando el ID directo (Más rápido)
        const stats = await prisma.review.aggregate({
            _count: { rating: true }, 
            _avg: { rating: true },   
            where: {
                barberId: appointment.barberId // <--- Optimización aquí
            }
        });

        const v = stats._count.rating || 0;     // Cantidad de votos (reviews)
        const R = stats._avg.rating || 0;       // Promedio simple actual

        // B. Configuración del Algoritmo
        const C = 4.0; // Promedio base del sistema (para suavizar barberos nuevos)
        const m = 5;   // Peso de confianza (necesita 5 reviews para soltar el promedio base)

        // C. Fórmula Bayesiana
        // Score = (v / (v+m)) * R + (m / (v+m)) * C
        const weightedScore = (v / (v + m)) * R + (m / (v + m)) * C;
        
        // D. Redondeo
        const newScore = parseFloat(weightedScore.toFixed(2));

        // E. Guardar el nuevo score en el perfil del barbero
        await prisma.barber.update({
            where: { id: appointment.barberId },
            data: { rankingScore: newScore }
        });

        console.log(`⭐ Ranking actualizado para ${appointment.barber.fullName}: ${newScore} (Base: ${v} reseñas)`);

        // =========================================================

        // 6. Notificaciones Interna
        await createNotification(
            appointment.barberId,
            "Nueva Reseña Recibida",
            `Has recibido ${rating} estrellas de ${appointment.client.name}.`
        );

        // 7. Notificación por Email
        if (appointment.barber.email) {
            sendNewReviewNotificationToBarber(
                appointment.barber.email,
                appointment.barber.fullName,
                appointment.client.name, 
                rating,
                comment
            );
        }

        res.status(201).json({ 
            message: "¡Gracias por tu opinión!", 
            review,
            newBarberScore: newScore 
        });

    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.errors });
        }
        console.error("Error createReview:", error);
        res.status(500).json({ error: "Error al guardar reseña" });
    }
};