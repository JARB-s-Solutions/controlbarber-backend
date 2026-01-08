// src/routes/appointmentRoutes.js
import { Router } from 'express';
import { getAvailability } from '../controllers/availabilityController.js';

const router = Router();

// GET /api/appointments/availability?date=2026-01-20&serviceId=1&barberId=
router.get('/availability', getAvailability);

export default router;