import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();

const reviewSchema = z.object({
    token: z.string(), // El token que venía en el link
    rating: z.number().min(1).max(5),
    comment: z.string().optional()
});

export const createReview = async (req, res) => {
    try {
        const { token, rating, comment } = reviewSchema.parse(req.body);

        // 1. Validar y Decodificar Token
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch (err) {
            return res.status(401).json({ error: "Link de reseña inválido o expirado" });
        }

        const { appointmentId } = decoded;

        // 2. Verificar que la cita exista y esté completada
        const appointment = await prisma.appointment.findUnique({
            where: { id: appointmentId }
        });

        if (!appointment || appointment.status !== 'COMPLETED') {
            return res.status(400).json({ error: "La cita no es válida para calificar" });
        }

        // 3. Verificar si ya existe reseña (Evitar duplicados)
        const existingReview = await prisma.review.findUnique({
            where: { appointmentId }
        });

        if (existingReview) {
            return res.status(409).json({ error: "Ya has calificado esta cita anteriormente" });
        }

        // 4. Guardar Reseña
        const review = await prisma.review.create({
            data: {
                appointmentId,
                rating,
                comment
            }
        });

        // 5. ACTUALIZAR PROMEDIO DEL BARBERO (Ranking)
        // Calculamos el nuevo promedio automáticamente
        const aggregations = await prisma.review.aggregate({
            _avg: { rating: true },
            where: {
                appointment: {
                    barberId: appointment.barberId // Filtramos por barbero
                }
            }
        });

        const newScore = aggregations._avg.rating || 0;

        // Guardamos el nuevo score en el perfil del barbero
        await prisma.barber.update({
            where: { id: appointment.barberId },
            data: { rankingScore: newScore }
        });

        res.status(201).json({ message: "¡Gracias por tu opinión!", review });

    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.errors });
        }
        console.error(error);
        res.status(500).json({ error: "Error al guardar reseña" });
    }
};