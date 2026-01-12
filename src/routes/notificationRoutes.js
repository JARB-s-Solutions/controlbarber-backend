import { Router } from 'express';
import { getMyNotifications, markAsRead, markAllAsRead } from '../controllers/notificationController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = Router();

router.use(protect); // Todo requiere login

router.get('/', getMyNotifications);           // Ver lista y contador
router.patch('/:id/read', markAsRead);         // Marcar una como leída
router.patch('/read-all', markAllAsRead);      // Marcar todas

export default router;