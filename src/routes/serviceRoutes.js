import { Router } from 'express';
import { createService, getMyServices, updateService, deleteService } from '../controllers/serviceController.js';
import { protect, requireRole } from '../middlewares/authMiddleware.js';

const router = Router();

// Todas requieren Token
router.use(protect);

// Todos en la tienda pueden VER el menú
router.get('/', getMyServices);

//  Solo OWNER y ADMIN pueden MODIFICAR el menú
router.post('/', requireRole('OWNER', 'ADMIN'), createService);
router.put('/:id', requireRole('OWNER', 'ADMIN'), updateService);
router.delete('/:id', requireRole('OWNER', 'ADMIN'), deleteService);

export default router;