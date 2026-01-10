import { PrismaClient } from '@prisma/client';
import cloudinary from '../config/cloudinary.js';
import streamifier from 'streamifier';

const prisma = new PrismaClient();

// Helper para subir buffer a Cloudinary (Promesa)
const streamUpload = (buffer) => {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            {
                folder: "controlbarber_gallery", // Carpeta en la nube
                transformation: [{ width: 1000, crop: "limit" }] // Optimización automática
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

// Subir Imagen
export const uploadImage = async (req, res) => {
    try {
        const barberId = req.user.id;
        
        // Validar que venga un archivo
        if (!req.file) {
            return res.status(400).json({ error: "No se ha seleccionado ninguna imagen" });
        }
        // Validar límite según suscripción
        // Obtenemos la suscripción y contamos cuántas fotos tiene
        const [subscription, photoCount] = await Promise.all([
            prisma.subscription.findUnique({ where: { barberId } }),
            prisma.galleryImage.count({ where: { barberId } })
        ]);

        // REGLA: Si es FREE, máximo 5 fotos. Si es BASIC, 20. PREMIUM ilimitado.
        const planType = subscription?.type || 'FREE';
        let limit = 5;
        if (planType === 'BASIC') limit = 20;
        if (planType === 'PREMIUM') limit = 1000;

        if (photoCount >= limit) {
            return res.status(403).json({ 
                error: `Has alcanzado el límite de fotos de tu plan ${planType}. Actualiza tu suscripción.` 
            });
        }

        // Subir a Cloudinary
        const result = await streamUpload(req.file.buffer);

        // Guardar referencia en Base de Datos
        const newImage = await prisma.galleryImage.create({
            data: {
                barberId,
                imageUrl: result.secure_url,
                serviceId: req.body.serviceId ? parseInt(req.body.serviceId) : null
            }
        });

        res.status(201).json(newImage);

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error al subir la imagen" });
    }
};

// Obtener Galería (Público)
export const getBarberGallery = async (req, res) => {
    try {
        const { barberId } = req.params;

        const images = await prisma.galleryImage.findMany({
            where: { barberId },
            orderBy: { createdAt: 'desc' },
            include: {
                service: {
                    select: { name: true, price: true } // Mostramos qué servicio es
                }
            }
        });

        res.json(images);

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error al obtener la galería" });
    }
};

// Eliminar Imagen
export const deleteImage = async (req, res) => {
    try {
        const { id } = req.params;
        const barberId = req.user.id;

        // Verificar que la imagen exista y sea del barbero
        const image = await prisma.galleryImage.findFirst({
            where: { id: parseInt(id), barberId }
        });

        if (!image) {
            return res.status(404).json({ error: "Imagen no encontrada" });
        }

        // Eliminar de Cloudinary
        // Extraer el public_id de la URL: .../controlbarber_gallery/xyz123.jpg
        const publicIdMatch = image.imageUrl.match(/controlbarber_gallery\/[^.]+/);
        if (publicIdMatch) {
            await cloudinary.uploader.destroy(publicIdMatch[0]);
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