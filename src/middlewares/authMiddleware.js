import jwt from 'jsonwebtoken';

export const protect = async (req, res, next) => {
    // Intentamos buscar el token en las cookies primero
    let token = req.cookies?.token;

    // Mantenemos la lectura por Header (Authorization) para que tus 
    // pruebas actuales en Postman no se rompan de golpe. No quita seguridad, suma flexibilidad.
    if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
        return res.status(401).json({ error: "No autorizado, no hay sesión activa o falta el token" });
    }

    try {
        // Verificar la firma del token
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
        return res.status(401).json({ error: "No autorizado, token inválido o expirado" });
    }
};