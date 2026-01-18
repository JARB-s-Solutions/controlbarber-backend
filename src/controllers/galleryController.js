import { PrismaClient } from '@prisma/client';
import cloudinary from '../config/cloudinary.js';
import streamifier from 'streamifier';
import { checkPlanLimits } from "../utils/permissions.js"

const prisma = new PrismaClient();

// Helper para subir buffer a Cloudinary (Promesa)
const streamUpload = (buffer) => {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            {
                folder: "controlbarber_gallery", // Carpeta en tu Cloudinary
                transformation: [{ width: 1000, crop: "limit" }] // Optimización
            },
            (error, result) => {
                if (result) {
                    resolve(result);
                } else {
                    reject(error);
                }
            }
        );
        streamifier.createReadStream(buffer).pipe(stream);
    });
};

// 1. Subir Imagen
export const uploadImage = async (req, res) => {
    try {
        const barberId = req.user.id;
        
        // Validar que Multer haya procesado el archivo
        if (!req.file) {
            return res.status(400).json({ error: "No se ha seleccionado ninguna imagen" });
        }

        // CHEQUEO DE PLAN
        const { limits } = await checkPlanLimits(barberId);
        const currentCount = await prisma.galleryImage.count({
            where: { barberId }
        });

        if( currentCount >= limits.maxPhotos ) {
            return res.status(403).json({
                error: `Has alcanzado el límite de imágenes para tu plan actual (${limits.maxPhotos} imágenes). Por favor, actualiza tu plan a Premium para subir más imágenes.`
            });
        }

        // Subir a Cloudinary
        const result = await streamUpload(req.file.buffer);

        // Guardar en BD
        const newImage = await prisma.galleryImage.create({
            data: {
                barberId,
                imageUrl: result.secure_url,
                // Si envían serviceId, lo convertimos a Int, si no, null
                serviceId: req.body.serviceId ? parseInt(req.body.serviceId) : null
            }
        });

        res.status(201).json(newImage);

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error al subir la imagen" });
    }
};

// 2. Obtener Galería (Público)
export const getBarberGallery = async (req, res) => {
    try {
        const { barberId } = req.params; // Puede ser ID o Slug (manejado en ruta anterior, aquí asumimos ID por simplificación o ajustamos lógica)
        
        // NOTA: Si usas slugs en la URL pública, primero deberías resolver el ID del barbero
        // Pero para este endpoint directo, asumiremos que el frontend ya tiene el UUID del barbero.
        
        const images = await prisma.galleryImage.findMany({
            where: { barberId },
            orderBy: { createdAt: 'desc' },
            include: {
                service: {
                    select: { name: true, price: true }
                }
            }
        });

        res.json(images);

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error al obtener la galería" });
    }
};

// 3. Eliminar Imagen
export const deleteImage = async (req, res) => {
    try {
        const { id } = req.params;
        const barberId = req.user.id;

        // Verificar propiedad
        const image = await prisma.galleryImage.findFirst({
            where: { id: parseInt(id), barberId }
        });

        if (!image) {
            return res.status(404).json({ error: "Imagen no encontrada" });
        }

        // Eliminar de Cloudinary
        try {
            const urlParts = image.imageUrl.split('/');
            const filename = urlParts.pop().split('.')[0]; // foto123 (sin .jpg)
            const folder = "controlbarber_gallery"; // Debe coincidir con el upload
            const publicId = `${folder}/${filename}`;

            await cloudinary.uploader.destroy(publicId);
        } catch (cloudError) {
            console.error("Error borrando de Cloudinary (se borrará de BD):", cloudError);
        }

        // Eliminar de Base de Datos
        await prisma.galleryImage.delete({
            where: { id: parseInt(id) }
        });

        res.json({ message: "Imagen eliminada correctamente" });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error al eliminar imagen" });
    }
};