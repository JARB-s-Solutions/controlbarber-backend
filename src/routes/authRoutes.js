import { Router } from 'express';
import { register, login, getProfile, googleLogin } from '../controllers/authController.js';
import { protect } from '../middlewares/authMiddleware.js';


const router = Router();

// Rutas Publicas
router.post('/register', register);
router.post('/login', login);
router.post('/google', googleLogin);

// Rutas Privadas (Autenticadas)
router.use(protect);
router.get('/profile', getProfile);

export default router;