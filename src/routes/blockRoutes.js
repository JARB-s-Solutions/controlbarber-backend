import { Router } from 'express';
import { createBlock, getMyBlocks, deleteBlock, closeDay } from '../controllers/blockController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = Router();

router.use(protect); // Todas las rutas requieren autenticación

router.post('/', createBlock);
router.get('/', getMyBlocks);
router.delete('/:id', deleteBlock);
router.post('/close-day', closeDay); // Cerrar el dia completo

export default router;