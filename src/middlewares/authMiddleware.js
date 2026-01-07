// src/middlewares/authMiddleware.js
import jwt from 'jsonwebtoken';

export const protect = async (req, res, next) => {
    let token;

    // Verificar si existe el header "Authorization" y empieza con "Bearer"
    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer')
    ) {
        try {
            // Extraer el token (quitar la palabra "Bearer ")
            token = req.headers.authorization.split(' ')[1];

            // Verificar la firma del token
            // A veces jwt viene como objeto default o directo, validamos ambos casos
            const verify = jwt.verify || (jwt.default && jwt.default.verify);
            
            if (!verify) {
                 throw new Error("La librería JWT no se cargó correctamente");
            }

            const decoded = verify(token, process.env.JWT_SECRET);

            // Agregar la info del usuario a la request
            req.user = decoded; 

            // Dejar pasar
            return next();

        } catch (error) {
            console.error("Error de token:", error.message);
            return res.status(401).json({ error: "No autorizado, token inválido" });
        }
    }

    if (!token) {
        return res.status(401).json({ error: "No autorizado, no hay token" });
    }
};