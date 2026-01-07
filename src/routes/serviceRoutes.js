import { Router } from 'express';
import { createService, getMyServices, updateService, deleteService } from '../controllers/serviceController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = Router();

// Todas estas rutas requieren Token
router.use(protect);

router.post('/', createService);       // Crear
router.get('/', getMyServices);        // Listar
router.put('/:id', updateService);     // Editar (ID en URL)
router.delete('/:id', deleteService);  // Borrar (ID en URL)

export default router;