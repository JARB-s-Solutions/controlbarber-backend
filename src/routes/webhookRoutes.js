import { Router } from 'express';
import express from 'express';
import { handleStripeWebhook } from '../controllers/webhookController.js';

const router = Router();

// Esta ruta NO usa express.json(), usa express.raw()
router.post('/', express.raw({ type: 'application/json' }), handleStripeWebhook);

export default router;