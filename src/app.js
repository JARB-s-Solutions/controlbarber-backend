import express from "express";
import cors from "cors";
import helmet  from "helmet";
import morgan from "morgan";
import authRoutes from "./routes/authRoutes.js";
import serviceRoutes from "./routes/serviceRoutes.js";
import scheduleRoutes from './routes/scheduleRoutes.js';
import blockRoutes from './routes/blockRoutes.js';
import appointmentRoutes from './routes/appointmentRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import barberRoutes from './routes/barberRoutes.js';
import galleryRoutes from './routes/galleryRoutes.js';

// Inicializar la app

const app = express();

// --- Middlewares Globales ---

// Seguridad básica (Headers HTTP)
app.use(helmet());

// Logger de peticiones
app.use(morgan("dev"));

// Parseo del cuerpo de las peticiones (JSON y Forms)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS
app.use(cors());

// Rutas de la API
app.use("/api/auth", authRoutes);
app.use("/api/services", serviceRoutes);
app.use('/api/schedule', scheduleRoutes);
app.use('/api/blocks', blockRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/barbers', barberRoutes);
app.use('/api/gallery', galleryRoutes);

// RUTA DE PRUEBA
app.get("/", (req, res) => {
    res.json({
        message: "ControlBarber API funcionando correctamente",
        status: "success",
        timestamp: new Date().toISOString()
    });
});

export default app;