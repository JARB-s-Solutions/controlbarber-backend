import { Router } from 'express';
import { updateLocation, searchNearbyBarbers } from '../controllers/locationController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = Router();

router.get('/search', searchNearbyBarbers);

// Rutas Privadas (Solo el barbero puede actualizar SU ubicación)
router.put('/', protect, updateLocation);

export default router;