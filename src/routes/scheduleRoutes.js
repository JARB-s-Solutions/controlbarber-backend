import { Router } from 'express';
import { updateSchedule, getMySchedule } from '../controllers/scheduleController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = Router();

router.use(protect); // Todas las rutas requieren autenticación

router.get('/', getMySchedule);
router.put('/', updateSchedule); // PUT porque reemplazamos configuración

export default router;