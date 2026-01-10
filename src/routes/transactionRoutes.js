import { Router } from 'express';
import { createTransaction, getDailySummary, performDailyClose, undoDailyClose, getFinancialHistory, getDailyCloseHistory} from '../controllers/transactionController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = Router();

router.use(protect);

router.post('/', createTransaction);           // Registrar venta manual
router.get('/summary', getDailySummary);       // Ver cómo vamos hoy
router.post('/close', performDailyClose);      // Cerrar el día

router.delete('/close', undoDailyClose); // DELETE para borrar el cierre (Reabrir)
router.get('/history', getFinancialHistory); // GET para ver la lista completa
router.get('/closes', getDailyCloseHistory);

export default router;