import { Router } from 'express';
import { createReview } from '../controllers/reviewController.js';

const router = Router();

// POST Público (validado por token en body)
router.post('/', createReview);

export default router;