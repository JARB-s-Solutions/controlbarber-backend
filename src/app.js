import express from "express";
import cors from "cors";
import helmet  from "helmet";
import morgan from "morgan";

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

// RUTA DE PRUEBA
app.get("/", (req, res) => {
    res.json({
        message: "ControlBarber API funcionando correctamente",
        status: "success",
        timestamp: new Date().toISOString()
    });
});

export default app;