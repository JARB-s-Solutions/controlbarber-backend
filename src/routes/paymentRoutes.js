import { Router } from 'express';
import { createCheckoutSession } from '../controllers/paymentController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = Router();

router.use(protect); // Solo usuarios logueados pueden pagar

// POST /api/payments/create-checkout-session
router.post('/create-checkout-session', createCheckoutSession);

export default router;