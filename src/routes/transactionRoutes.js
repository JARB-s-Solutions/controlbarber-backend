import { Router } from 'express';
import { 
        openDay,
        createTransaction, 
        chargeAppointment,
        getDailySummary, 
        performDailyClose, 
        undoDailyClose, 
        getFinancialHistory, 
        getDailyCloseHistory
    } from '../controllers/transactionController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = Router();

router.use(protect);

// --- OPERACIONES DIARIAS ---
router.post('/open-day', openDay);
router.post('/charge', chargeAppointment);      // Cobrar una cita específica
router.post('/', createTransaction);           // Registrar venta manual      // Ver cómo vamos hoy

// --- REPORTES Y CIERRES ---
router.get('/summary', getDailySummary); 
router.get('/history', getFinancialHistory); // GET para ver la lista completa
router.get('/closes', getDailyCloseHistory);

router.delete('/close', undoDailyClose); // DELETE para borrar el cierre (Reabrir)
router.post('/close', performDailyClose);      // Cerrar el día


export default router;