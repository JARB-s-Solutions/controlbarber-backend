import { Router } from 'express';
import { getMyClients, updateClient } from '../controllers/clientController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = Router();

router.use(protect); // Todo requiere login

router.get('/', getMyClients);       // Ver lista
router.patch('/:id', updateClient);  // Editar notas

export default router;