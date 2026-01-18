import rateLimit from 'express-rate-limit';

// Limite General (Para rutas normales como ver perfiles, citas)
// Permite 50 peticiones cada 15 minutos por IP
export const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 50, 
    standardHeaders: true, 
    legacyHeaders: false,
    message: {
        error: "Demasiadas peticiones desde esta IP, por favor intenta de nuevo en 15 minutos."
    }
});

// Limite Estricto (Para Login, Registro, Recuperar Password, Reviews)
// Permite 5 intentos por hora para evitar fuerza bruta y spam
export const strictLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, 
    max: 5, 
    standardHeaders: true, 
    legacyHeaders: false,
    message: {
        error: "Has excedido el límite de intentos de seguridad. Espera una hora."
    }
});