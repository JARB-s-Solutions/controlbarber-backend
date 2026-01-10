import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();

// Esquema para validar la nota
const updateClientSchema = z.object({
    name: z.string().min(1).optional(),
    internalNotes: z.string().optional()
});

// Listar MIS Clientes
export const getMyClients = async (req, res) => {
    try {
        const barberId = req.user.id;

        // Buscamos clientes que tengan AL MENOS una cita con este barbero
        const clients = await prisma.client.findMany({
            where: {
                appointments: {
                    some: {
                        barberId: barberId
                    }
                }
            },
            include: {
                // Incluimos solo la última cita para saber cuándo vino
                appointments: {
                    where: { barberId: barberId },
                    orderBy: { date: 'desc' },
                    take: 1,
                    select: {
                        date: true,
                        service: { select: { name: true } }
                    }
                }
            }
        });

        // Formateamos para que sea fácil de leer en frontend
        const formattedClients = clients.map(client => ({
            id: client.id,
            name: client.name,
            phone: client.phone,
            notes: client.internalNotes,
            lastVisit: client.appointments[0]?.date || null,
            lastService: client.appointments[0]?.service?.name || null
        }));

        res.json(formattedClients);

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error al obtener clientes" });
    }
};

// Editar Cliente (Notas y Nombre)
export const updateClient = async (req, res) => {
    try {
        const { id } = req.params;
        const data = updateClientSchema.parse(req.body);

        // Actualizamos
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