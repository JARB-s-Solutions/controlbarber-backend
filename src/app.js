import express from "express";
import cors from "cors";
import helmet  from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";

import authRoutes from "./routes/authRoutes.js";
import serviceRoutes from "./routes/serviceRoutes.js";
import scheduleRoutes from './routes/scheduleRoutes.js';
import blockRoutes from './routes/blockRoutes.js';
import appointmentRoutes from './routes/appointmentRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import barberRoutes from './routes/barberRoutes.js';
import galleryRoutes from './routes/galleryRoutes.js';
import clientRoutes from './routes/clientRoutes.js';
import transactionRoutes from './routes/transactionRoutes.js';
import reviewRoutes from './routes/reviewRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import webhookRoutes from './routes/webhookRoutes.js';
import { apiLimiter, strictLimiter } from "./middlewares/rateLimiter.js";
import locationRoutes from './routes/locationRoutes.js';
import { startReminderCron } from './cron/reminderJob.js';

// Inicializar la app
const app = express();

// APLICAR LÍMITE GLOBAL
app.use("/api", apiLimiter);

app.set('trust proxy', 1);

// APLICAR LÍMITE ESTRICTO A RUTAS DE AUTH Y REVIEWS
app.use('/api/auth/login', strictLimiter);
app.use('/api/reviews', strictLimiter);

app.use('/api/webhooks', webhookRoutes);

// --- Middlewares Globales ---

// Seguridad básica (Headers HTTP)
app.use(helmet());

// Logger de peticiones
app.use(morgan("dev"));
 
// Parseo del cuerpo de las peticiones (JSON y Forms)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Habilitamos la lectura de cookies
app.use(cookieParser());

// Configuración estricta de CORS para permitir Cookies (credentials)
const allowedOrigins = [
    'https://cb-front-indol.vercel.app', 
    'http://localhost:5173', // Para el dev local de tu frontend
    'http://localhost:5500', 
    'http://127.0.0.1:5500'
];

app.use(cors({
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('No permitido por CORS'));
        }
    },
    credentials: true 
}));

// Rutas de la API
app.use("/api/auth", authRoutes);
app.use("/api/services", serviceRoutes);
app.use('/api/schedule', scheduleRoutes);
app.use('/api/blocks', blockRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/barbers', barberRoutes);
app.use('/api/gallery', galleryRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/finance', transactionRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/location', locationRoutes);

// INICIAR CRON JOBS
startReminderCron();

// RUTA DE PRUEBA
app.get("/", (req, res) => {
    res.json({
        message: "ControlBarber API funcionando correctamente",
        status: "success",
        timestamp: new Date().toISOString()
    });
});

export default app;