import { Router } from 'express';
import { getDashboardStats } from '../controllers/dashboardController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = Router();

// Todas las rutas de dashboard son privadas
router.use(protect);

router.get('/stats', getDashboardStats);

export default router;