import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { hashPassword } from "../utils/password.js";

const prisma = new PrismaClient();

//Esquema de validación para Registro
const registerSchema = z.object({
    fullName: z.string().min(3, "El nombre completo debe tener al menos 3 caracteres"),
    email: z.string().email("Correo electrónico inválido"),
    password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
    phone: z.string().min(10, "El número de teléfono debe tener al menos 10 dígitos")
});

export const register = async (req, res) => {
    
    try {
        // Validar los datos de entrada
        const validation = registerSchema.safeParse(req.body);
        
        if (!validation.success) {
            return res.status(400).json({
                error: "Datos inválidos",
                details: validation.error.errors.map(e => ({ 
                    field: e.path[0], 
                    message: e.message 
                }))
            });
        }
        
        const data = validation.data;

        // Verificar si el email ya existe
        const existingUser = await prisma.barber.findUnique({
            where: { email: data.email }
        });

        if(existingUser) {
            return res.status(400).json({
                error: "El correo electrónico ya está en registrado"
            });
        }

        // Encriptar la contraseña
        const hashedPassword = await hashPassword(data.password);

        // Crear usuario en la Base de Datos
        // Creamos el barbero y automaticamente su subscripción GRATUITA inicial
        const newBarber = await prisma.barber.create({
            data: {
                fullName: data.fullName,
                email: data.email,
                passwordHash: hashedPassword,
                phone: data.phone,
                // Crear subscripción por defecto
                subscription: {
                    create: {
                        type: "FREE",
                        startDate: new Date(),
                        //Infinita por ahora
                        endDate: new Date(new Date().setFullYear(new Date().getFullYear() + 100)),
                        status: "ACTIVE"
                    }
                }
            },
            // Selecionamos que campos devolver
            select: {
                id: true,
                fullName: true,
                email: true,
                createdAt: true
            }
        });

        // Responder con exito 201 y datos del nuevo barbero
        res.status(201).json({
            message: "Usuario registrado exitosamente",
            user: newBarber
        });

    } catch (error) {
        // Manejo de errores de validación (Zod)
        if( error instanceof z.ZodError ) {
            return res.status(400).json({
                error: "Datos invalidos",
                details: error.errors.map(e => ({ field: e.path[0], message: e.message }))
            });
        }

        console.error(error);
        res.status(500).json({ error: "Error interno del servidor" });
    }

};