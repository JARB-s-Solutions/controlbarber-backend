import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();

// Esquema para validar la nota
const updateClientSchema = z.object({
    name: z.string().min(1).optional(),
    internalNotes: z.string().optional()
});

// Listar MIS Clientes (Aislamiento Total)
export const getMyClients = async (req, res) => {
    try {
        const barberId = req.user.id;

        // NUEVA LÓGICA: Filtramos directamente por la propiedad del barbero
        const clients = await prisma.client.findMany({
            where: { 
                barberId: barberId 
            },
            include: {
                // Incluimos la última cita para el historial
                appointments: {
                    orderBy: { date: 'desc' },
                    take: 1,
                    select: {
                        date: true,
                        service: { select: { name: true } }
                    }
                }
            },
            orderBy: { name: 'asc' }
        });

        // Formateamos para el frontend
        const formattedClients = clients.map(client => ({
            id: client.id,
            name: client.name,
            phone: client.phone,
            notes: client.internalNotes,
            email: client.email, // Agregamos email por si acaso
            lastVisit: client.appointments[0]?.date || null,
            lastService: client.appointments[0]?.service?.name || null
        }));

        res.json(formattedClients);

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error al obtener clientes" });
    }
};

// Editar Cliente (Validando propiedad)
export const updateClient = async (req, res) => {
    try {
        const { id } = req.params;
        const barberId = req.user.id;
        const data = updateClientSchema.parse(req.body);

        // 1. SEGURIDAD: Verificar que el cliente sea de este barbero
        const existingClient = await prisma.client.findUnique({
            where: { id }
        });

        if (!existingClient || existingClient.barberId !== barberId) {
            return res.status(404).json({ error: "Cliente no encontrado o no tienes permiso" });
        }

        // 2. Actualizamos
        const updatedClient = await prisma.client.update({
            where: { id },
            data: {
                name: data.name,
                internalNotes: data.internalNotes
            }
        });

        res.json(updatedClient);

    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.errors });
        }
        console.error(error);
        res.status(500).json({ error: "Error al actualizar cliente" });
    }
};