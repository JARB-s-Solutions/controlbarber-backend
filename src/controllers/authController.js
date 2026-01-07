import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { hashPassword } from "../utils/password.js";
import { comparePassword } from "../utils/password.js";
import { generateToken } from "../utils/jwt.js";

const prisma = new PrismaClient();

// Esquema de validación para Registro
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

// Esquema de validación para Login
const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "La contraseña es obligatoria")
});



export const login = async (req, res) => {
  try {
    // Validar datos
    const data = loginSchema.parse(req.body);

    // Buscar usuario por email
    const user = await prisma.barber.findUnique({
      where: { email: data.email }
    });

    if (!user) {
      return res.status(401).json({ error: "Credenciales inválidas" });
    }

    // Verificar contraseña
    const isValid = await comparePassword(data.password, user.passwordHash);

    if (!isValid) {
      return res.status(401).json({ error: "Credenciales inválidas" });
    }

    // Verificar si la cuenta está activa
    if (!user.isActive) {
      return res.status(403).json({ error: "Tu cuenta ha sido suspendida. Contacta soporte." });
    }

    // Generar Token JWT
    const token = generateToken({ 
      id: user.id, 
      role: user.role 
    });

    // 6. Responder
    res.json({
      message: "Bienvenido de nuevo",
      token: token,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role
      }
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Datos inválidos" });
    }
    console.error(error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
};


// Esquema de validación para Perfil
export const getProfile = async (req, res) => {
    // El token ya se valido en el middleware y ya se sabe quien es el usuario
    const userId = req.user.id;

    try {
        const user = await prisma.barber.findUnique({
            where: { id: userId },
            select: {
                id: true,
                fullName: true,
                email: true,
                phone: true,
                role: true,
                subscription: true
            }
        });

        res.json(user);
    } catch (error) {
        res.status(500).json({ error: "Error al obtener el perfil del usuario" });
    }
};