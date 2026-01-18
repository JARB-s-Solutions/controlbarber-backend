import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { checkPlanLimits } from "../utils/permissions.js"

const prisma = new PrismaClient();

// Esquema de validación
const serviceSchema = z.object({
    name: z.string().min(1, "El nombre es obligatorio"),
    price: z.number().min(0, "El precio no puede ser negativo"),
    durationMin: z.number().int().min(5, "La duración mínima es de 5 minutos")
});

// Crear un servicio
export const createService = async (req, res) => {
    try {

        console.log("Request body:", req.body);
        console.log("User ID:", req.user.id);

        const data = serviceSchema.parse(req.body);
        const barberId = req.user.id; // Viene del token

        console.log("Datos validados:", data);
        console.log("Barber ID:", barberId);

        // CHEQUEO DE PLAN
        const { limits } = await checkPlanLimits(barberId);

        const currentCount = await prisma.service.count({ 
            where: { 
                barberId, 
                isActive: true
            } 
        });

        if (currentCount >= limits.maxServices) {
            return res.status(403).json({ 
                error: `Plan Gratuito limitado a ${limits.maxServices} servicios. Pásate a Premium para ilimitados.` 
            });
        }

        const newService = await prisma.service.create({
            data: {
                ...data,
                barberId: barberId
            }
        });

        res.status(201).json(newService);

    } catch (error) {

        console.error("Error creating service:", error);
        console.error("Stack trace:", error.stack);

        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.errors });
        }
        res.status(500).json({ error: "Error al crear el servicio" });
    }
};

// Obtener mis servicios (Solo los activos)
export const getMyServices = async (req, res) => {
    try {
        const services = await prisma.service.findMany({
            where: {
                barberId: req.user.id,
                isActive: true // Solo traemos los visibles
            }
        });
        res.json(services);
    } catch (error) {
        res.status(500).json({ error: "Error al obtener servicios" });
    }
};

// Actualizar servicio
export const updateService = async (req, res) => {
    const { id } = req.params; // ID del servicio a editar
    
    try {
        const data = serviceSchema.partial().parse(req.body); // .partial() hace que los campos sean opcionales

        // Solo actualiza SI el ID coincide Y el barberId es el dueño.
        const result = await prisma.service.updateMany({
            where: {
                id: parseInt(id),
                barberId: req.user.id 
            },
            data: data
        });

        if (result.count === 0) {
            return res.status(404).json({ error: "Servicio no encontrado o no te pertenece" });
        }

        res.json({ message: "Servicio actualizado correctamente" });

    } catch (error) {
        res.status(500).json({ error: "Error al actualizar servicio" });
    }
};

// Eliminar servicio (Soft Delete)
export const deleteService = async (req, res) => {
    const { id } = req.params;

    try {
        // Marcamos isActive = false en lugar de borrar
        const result = await prisma.service.updateMany({
            where: {
                id: parseInt(id),
                barberId: req.user.id
            },
            data: {
                isActive: false
            }
        });

        if (result.count === 0) {
            return res.status(404).json({ error: "Servicio no encontrado o no te pertenece" });
        }

        res.json({ message: "Servicio eliminado correctamente" });

    } catch (error) {
        res.status(500).json({ error: "Error al eliminar servicio" });
    }
};