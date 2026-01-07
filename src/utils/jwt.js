import jwt from "jsonwebtoken";

export const generateToken = (payload) => {
    // Expira en 7 dias
    return jwt.sign(payload, process.env.JWT_SECRET, {
        expiresIn: "7d"
    });
};