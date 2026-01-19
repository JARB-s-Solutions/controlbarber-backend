import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();

// Validación para actualizar ubicación
const locationSchema = z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    address: z.string().optional()
});

// BARBERO: GUARDAR SU UBICACIÓN
export const updateLocation = async (req, res) => {
    try {
        const { latitude, longitude, address } = locationSchema.parse(req.body);
        const barberId = req.user.id; // Viene del token

        const updatedBarber = await prisma.barber.update({
            where: { id: barberId },
            data: {
                latitude,
                longitude,
                address
            }
        });

        res.json({ message: "Ubicación actualizada correctamente", location: { latitude, longitude, address } });

    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.errors });
        }
        res.status(500).json({ error: "Error al actualizar ubicación" });
    }
};

// CLIENTE: BUSCAR BARBEROS CERCANOS
export const searchNearbyBarbers = async (req, res) => {
    try {
        const { lat, lng, radiusKm = 5, limit = 20 } = req.query;

        if (!lat || !lng) {
            return res.status(400).json({ error: "Se requiere latitud (lat) y longitud (lng) del usuario." });
        }

        const userLat = parseFloat(lat);
        const userLng = parseFloat(lng);
        const radius = parseFloat(radiusKm);
        const take = parseInt(limit);

        const nearbyBarbers = await prisma.$queryRaw`
            SELECT 
                id, 
                "nombre_completo" as "fullName", 
                "alias_url" as slug,
                "foto_perfil" as "avatarUrl", 
                "ranking_score" as "rankingScore", 
                latitud as latitude, 
                longitud as longitude,
                "direccion_texto" as address,
                (
                    6371 * acos(
                        cos(radians(${userLat})) * cos(radians(latitud)) * cos(radians(longitud) - radians(${userLng})) + 
                        sin(radians(${userLat})) * sin(radians(latitud))
                    )
                ) AS distance
            FROM barberos
            WHERE 
                "estado_cuenta" = true
                AND latitud IS NOT NULL 
                AND longitud IS NOT NULL
                AND (
                    6371 * acos(
                        cos(radians(${userLat})) * cos(radians(latitud)) * cos(radians(longitud) - radians(${userLng})) + 
                        sin(radians(${userLat})) * sin(radians(latitud))
                    )
                ) < ${radius}
            
            -- 🔥 CAMBIO AQUÍ: Primero Ranking (DESC), luego Distancia (ASC)
            ORDER BY "ranking_score" DESC, distance ASC
            
            LIMIT ${take};
        `;

        const formatted = nearbyBarbers.map(barber => ({
            ...barber,
            rankingScore: Number(barber.rankingScore), 
            distance: Number(barber.distance).toFixed(2) + " km"
        }));

        res.json({
            count: formatted.length,
            radiusKm: radius,
            results: formatted
        });

    } catch (error) {
        console.error("Error en búsqueda geoespacial:", error);
        res.status(500).json({ error: "Error buscando barberos cercanos" });
    }
};