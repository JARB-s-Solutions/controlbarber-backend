import { Router } from 'express';
import { getBarberProfile } from '../controllers/barberController.js';

const router = Router();

// GET /api/barbers/:id -> Público
router.get('/:id', getBarberProfile);

export default router;