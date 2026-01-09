import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Obtener perfil público (Nombre, Foto, Info básica)
export const getBarberProfile = async (req, res) => {
    try {
        const { id } = req.params; // El ID viene en la URL (ej: /api/barbers/UUID)

        const barber = await prisma.barber.findUnique({
            where: { id: id },
            select: {
                id: true,
                fullName: true,
                phone: true,      // Opcional: si quieres que el cliente vea el cel
                avatarUrl: true,
                rankingScore: true,
                isActive: true
            }
        });

        if (!barber) {
            return res.status(404).json({ error: "Barbero no encontrado" });
        }

        res.json(barber);

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error al obtener perfil del barbero" });
    }
};