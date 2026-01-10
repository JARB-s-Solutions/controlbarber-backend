import { Router } from 'express';
import multer from 'multer';
import { uploadImage, getBarberGallery, deleteImage } from '../controllers/galleryController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = Router();

// Configuración de Multer (Almacenar en memoria RAM temporalmente)
const storage = multer.memoryStorage();
const upload = multer({ 
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // Límite 5MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Solo se permiten imágenes (JPG, PNG, WEBP)'), false);
        }
    }
});

// Rutas

// GET Pública (Para que el cliente vea las fotos en el perfil)
router.get('/:barberId', getBarberGallery);

// POST Privada (El barbero sube foto)
// 'image' es el nombre del campo en el FormData
router.use(protect);
router.post('/', upload.single('image'), uploadImage);

// DELETE Privada
router.delete('/:id', deleteImage);

export default router;