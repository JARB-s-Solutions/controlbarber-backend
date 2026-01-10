import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Obtener perfil público (Nombre, Foto, Info básica)
// Soporta búsqueda por UUID o por SLUG (Alias)
export const getBarberProfile = async (req, res) => {
    try {
        const { id } = req.params; // 'id' puede ser UUID o Slug

        // Regex para verificar si es formato UUID
        const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(id);

        let whereClause = {};

        if (isUuid) {
            // Si parece UUID, buscamos por ID
            whereClause = { id: id };
        } else {
            // Si NO es UUID, asumimos que es un SLUG (Alias)
            whereClause = { slug: id };
        }

        const barber = await prisma.barber.findUnique({
            where: whereClause,
            select: {
                id: true,
                fullName: true,
                slug: true,       // Importante para la URL en frontend
                phone: true,
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