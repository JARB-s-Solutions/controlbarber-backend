import { Router } from 'express';
import { register, login, getProfile } from '../controllers/authController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = Router();

// Rutas Publicas
router.post('/register', register);
router.post('/login', login);

// Rutas Privadas (Autenticadas)
router.get('/profile', protect, getProfile);

export default router;