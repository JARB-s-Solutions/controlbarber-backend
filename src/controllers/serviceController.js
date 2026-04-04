import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { checkPlanLimits } from "../utils/permissions.js";

const prisma = new PrismaClient();

const serviceSchema = z.object({
    name: z.string().min(1, "El nombre es obligatorio"),
    price: z.number().min(0, "El precio no puede ser negativo"),
    durationMin: z.number().int().min(5, "La duración mínima es de 5 minutos")
});

export const createService = async (req, res) => {
    try {
        const data = serviceSchema.parse(req.body);
        const barbershopId = req.user.barbershopId; 

        // CHEQUEO DE PLAN (Basado en la sucursal)
        const { limits } = await checkPlanLimits(barbershopId);

        const currentCount = await prisma.service.count({ 
            where: { barbershopId, isActive: true } 
        });

        if (currentCount >= limits.maxServices) {
            return res.status(403).json({ 
                error: `Plan limitado a ${limits.maxServices} servicios. Sube a Premium para ilimitados.` 
            });
        }

        const newService = await prisma.service.create({
            data: { ...data, barbershopId }
        });

        res.status(201).json(newService);

    } catch (error) {
        if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
        console.error("Error creating service:", error);
        res.status(500).json({ error: "Error al crear el servicio" });
    }
};

export const getMyServices = async (req, res) => {
    try {
        // Todos los empleados pueden ver los servicios de su sucursal
        const services = await prisma.service.findMany({
            where: { barbershopId: req.user.barbershopId, isActive: true }
        });
        res.json(services);
    } catch (error) {
        res.status(500).json({ error: "Error al obtener servicios" });
    }
};

export const updateService = async (req, res) => {
    try {
        const { id } = req.params;
        const data = serviceSchema.partial().parse(req.body);

        // Seguridad: Exige coincidencia de ID y BarbershopId
        const result = await prisma.service.updateMany({
            where: { id: parseInt(id), barbershopId: req.user.barbershopId },
            data
        });

        if (result.count === 0) return res.status(404).json({ error: "Servicio no encontrado o acceso denegado" });
        res.json({ message: "Servicio actualizado correctamente" });

    } catch (error) {
        res.status(500).json({ error: "Error al actualizar servicio" });
    }
};

export const deleteService = async (req, res) => {
    try {
        const { id } = req.params;

        const result = await prisma.service.updateMany({
            where: { id: parseInt(id), barbershopId: req.user.barbershopId },
            data: { isActive: false }
        });

        if (result.count === 0) return res.status(404).json({ error: "Servicio no encontrado o acceso denegado" });
        res.json({ message: "Servicio eliminado correctamente" });

    } catch (error) {
        res.status(500).json({ error: "Error al eliminar servicio" });
    }
};