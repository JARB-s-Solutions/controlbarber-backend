import { Router } from 'express';
import { 
        register,
        login,
        getProfile,
        googleLogin,
        forgotPassword,
        resetPassword 
    } from '../controllers/authController.js';
import { protect } from '../middlewares/authMiddleware.js';


const router = Router();

// Rutas Publicas
router.post('/register', register);
router.post('/login', login);
router.post('/google', googleLogin);

// Recuperación de Contraseña
router.post('/forgot-password', forgotPassword);
router.post('/reset-password/:token', resetPassword);

// Rutas Privadas (Autenticadas)
router.use(protect);
router.get('/profile', getProfile);

export default router;