import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { hashPassword } from "../utils/password.js";
import { comparePassword } from "../utils/password.js";
import { generateToken } from "../utils/jwt.js";
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';

const prisma = new PrismaClient();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Esquema de validación para Registro
const registerSchema = z.object({
    fullName: z.string().min(3, "El nombre completo debe tener al menos 3 caracteres"),
    // VALIDACIÓN DEL USERNAME (Para la URL)
    username: z.string()
        .min(3, "El usuario debe tener al menos 3 caracteres")
        .max(30, "El usuario no puede exceder 30 caracteres")
        .regex(/^[a-zA-Z0-9-_]+$/, "El usuario solo puede contener letras, números, guiones y guiones bajos"),
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
        const existingEmail = await prisma.barber.findUnique({
            where: { email: data.email }
        });

        if(existingEmail) {
            return res.status(400).json({
                error: "El correo electrónico ya está registrado"
            });
        }

        // Verificar si el USERNAME (Slug) ya existe
        // Convertimos a minúsculas para asegurar unicidad (JuanPerez = juanperez)
        const desiredSlug = data.username.toLowerCase();

        const existingSlug = await prisma.barber.findUnique({
            where: { slug: desiredSlug }
        });

        if(existingSlug) {
            return res.status(400).json({
                error: `El nombre de usuario '${data.username}' ya está en uso. Por favor elige otro.`
            });
        }

        // Encriptar la contraseña
        const hashedPassword = await hashPassword(data.password);

        // Crear usuario en la Base de Datos
        const newBarber = await prisma.barber.create({
            data: {
                fullName: data.fullName,
                email: data.email,
                passwordHash: hashedPassword,
                phone: data.phone,
                slug: desiredSlug, // <--- Guardamos el username como slug
                
                // Crear subscripción por defecto
                subscription: {
                    create: {
                        type: "FREE",
                        startDate: new Date(),
                        endDate: new Date(new Date().setFullYear(new Date().getFullYear() + 100)),
                        status: "ACTIVE"
                    }
                }
            },
            select: {
                id: true,
                fullName: true,
                slug: true, // Confirmamos su usuario
                email: true,
                createdAt: true
            }
        });

        res.status(201).json({
            message: "Usuario registrado exitosamente",
            user: newBarber
        });

    } catch (error) {
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
    const data = loginSchema.parse(req.body);

    const user = await prisma.barber.findUnique({
      where: { email: data.email }
    });

    if(!user.passwordHash) {
        return res.status(400).json({
            error: "Este correo está registrado con Google. Por favor usa el botón de 'Iniciar con Google'."
        })
    }

    if (!user) {
      return res.status(401).json({ error: "Credenciales inválidas" });
    }

    const isValid = await comparePassword(data.password, user.passwordHash);

    if (!isValid) {
      return res.status(401).json({ error: "Credenciales inválidas" });
    }

    if (!user.isActive) {
      return res.status(403).json({ error: "Tu cuenta ha sido suspendida. Contacta soporte." });
    }

    const token = generateToken({ 
      id: user.id, 
      role: user.role 
    });

    res.json({
      message: "Bienvenido de nuevo",
      token: token,
      user: {
        id: user.id,
        fullName: user.fullName,
        username: user.slug, // Devolvemos 'username' al front (que es el slug)
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

export const getProfile = async (req, res) => {
    const userId = req.user.id;

    try {
        const user = await prisma.barber.findUnique({
            where: { id: userId },
            select: {
                id: true,
                fullName: true,
                slug: true, 
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

// Función auxiliar para generar token JWT
const signToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN
    });
};

export const googleLogin = async (req, res) => {
    try {
        const { googleToken } = req.body;

        // Verificar el token con Google (Seguridad crítica)
        const ticket = await googleClient.verifyIdToken({
            idToken: googleToken,
            audience: process.env.GOOGLE_CLIENT_ID, 
        });
        
        const { name, email, picture, sub: googleId } = ticket.getPayload();

        // Buscar si el barbero ya existe en nuestra BD
        let barber = await prisma.barber.findUnique({
            where: { email }
        });

        if (barber) {
            // CASO A: El usuario YA existe
            // Si no tenía googleId vinculado, lo actualizamos para la próxima
            if (!barber.googleId) {
                barber = await prisma.barber.update({
                    where: { email },
                    data: { 
                        googleId: googleId,
                        avatarUrl: barber.avatarUrl || picture // Si no tiene foto, usamos la de Google
                    }
                });
            }
        } else {
            // CASO B: Es un usuario NUEVO (Registro automático)
            // Generamos un "slug" básico basado en el nombre
            const baseSlug = name.toLowerCase().replace(/\s+/g, '-');
            const uniqueSlug = `${baseSlug}-${Math.floor(Math.random() * 1000)}`;

            barber = await prisma.barber.create({
                data: {
                    email,
                    fullName: name,
                    googleId: googleId,
                    avatarUrl: picture,
                    slug: uniqueSlug,
                    passwordHash: null, // No tiene contraseña
                    // Creamos su suscripción FREE por defecto
                    subscription: {
                        create: {
                            type: 'FREE',
                            status: 'ACTIVE',
                            startDate: new Date(),
                            endDate: new Date(new Date().setFullYear(new Date().getFullYear() + 100))
                        }
                    }
                }
            });
        }

        // 3. Generar NUESTRO token JWT (El sistema sigue funcionando igual)
        const token = signToken(barber.id);

        // 4. Responder
        res.json({
            status: 'success',
            token,
            data: {
                barber: {
                    id: barber.id,
                    name: barber.fullName,
                    email: barber.email,
                    avatar: barber.avatarUrl,
                    role: 'barber'
                }
            }
        });

    } catch (error) {
        console.error("Error en Google Auth:", error);
        res.status(401).json({ error: "Token de Google inválido o expirado" });
    }
};