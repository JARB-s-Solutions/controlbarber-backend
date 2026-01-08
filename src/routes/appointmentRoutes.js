import { Router } from 'express';
import { protect } from '../middlewares/authMiddleware.js';
import { getAvailability } from '../controllers/availabilityController.js';
import { createAppointment } from '../controllers/appointmentController.js';
import { getMyAppointments } from '../controllers/appointmentController.js';


const router = Router();

// Rutas Públicas
// GET /api/appointments/availability?date=2026-01-20&serviceId=1&barberId=
router.get('/availability', getAvailability);
router.post('/', createAppointment);


// Rutas Privadas (Barbero)
router.get('/', protect, getMyAppointments);

export default router;