import { Router } from 'express';
import { protect } from '../middlewares/authMiddleware.js';
import { getAvailability } from '../controllers/availabilityController.js'; // Asumo que lo actualizarás pronto
import { createAppointment, getMyAppointments, updateAppointmentStatus } from '../controllers/appointmentController.js';

const router = Router();

// Rutas Públicas (El cliente reserva)
router.get('/availability', getAvailability);
router.post('/', createAppointment);

// Rutas Privadas (Dashboard de la Barbería)
router.use(protect);
router.get('/', getMyAppointments);
router.patch('/:id/status', updateAppointmentStatus);

export default router;