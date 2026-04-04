import jwt from 'jsonwebtoken';

export const protect = async (req, res, next) => {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            token = req.headers.authorization.split(' ')[1];

            const verify = jwt.verify || (jwt.default && jwt.default.verify);
            if (!verify) {
                 throw new Error("La librería JWT no se cargó correctamente");
            }

            const decoded = verify(token, process.env.JWT_SECRET);

            // MULTI-TENANT: Inyectamos el ID de la Sucursal y el Rol
            req.user = {
                id: decoded.id,
                role: decoded.role,
                barbershopId: decoded.barbershopId 
            }; 

            return next();

        } catch (error) {
            console.error("Error de token:", error.message);
            return res.status(401).json({ error: "No autorizado, token inválido o expirado" });
        }
    }

    if (!token) {
        return res.status(401).json({ error: "No autorizado, no hay token" });
    }
};

// Validador de Jerarquía
export const requireRole = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.user || !allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ 
                error: "Acceso denegado. No tienes permisos para realizar esta acción." 
            });
        }
        next();
    };
};