import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();

// Esquema de validación
const blockSchema = z.object({
    startDate: z.string().datetime({ message: "Formato de fecha inválido (Use ISO 8601)" }),
    endDate: z.string().datetime({ message: "Formato de fecha inválido (Use ISO 8601)" }),
    reason: z.string().optional()
}).refine(data => new Date(data.endDate) > new Date(data.startDate), {
    message: "La fecha de fin debe ser posterior a la de inicio",
    path: ["endDate"]
});

// Crear un bloqueo
export const createBlock = async (req, res) => {
    try {
        const data = blockSchema.parse(req.body);
        
        const newBlock = await prisma.scheduleBlock.create({
            data: {
                barberId: req.user.id,
                startDate: data.startDate,
                endDate: data.endDate,
                reason: data.reason || "No disponible"
            }
        });

        res.status(201).json({ message: "Bloqueo creado", block: newBlock });

    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.errors });
        }
        res.status(500).json({ error: "Error al crear bloqueo" });
    }
};

// Listar mis bloqueos (Solo futuros)
export const getMyBlocks = async (req, res) => {
    try {
        const blocks = await prisma.scheduleBlock.findMany({
            where: {
                barberId: req.user.id,
                endDate: { gte: new Date() } // Solo traer bloqueos que no han terminado
            },
            orderBy: { startDate: 'asc' }
        });
        res.json(blocks);
    } catch (error) {
        res.status(500).json({ error: "Error al obtener bloqueos" });
    }
};

// Eliminar bloqueo (Por si se cancelan las vacaciones)
export const deleteBlock = async (req, res) => {
    const { id } = req.params;
    try {
        const result = await prisma.scheduleBlock.deleteMany({
            where: {
                id: parseInt(id),
                barberId: req.user.id // Seguridad: Solo el dueño puede borrarlo
            }
        });

        if (result.count === 0) {
            return res.status(404).json({ error: "Bloqueo no encontrado" });
        }

        res.json({ message: "Bloqueo eliminado correctamente" });
    } catch (error) {
        res.status(500).json({ error: "Error al eliminar bloqueo" });
    }
};