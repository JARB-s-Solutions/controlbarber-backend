import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { hashPassword } from "../utils/password.js";
import { comparePassword } from "../utils/password.js";
import { generateToken } from "../utils/jwt.js";
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { randomBytes, createHash } from 'node:crypto'; 
import bcrypt from 'bcryptjs';
import { sendPasswordResetEmail } from "../utils/email.js"

const prisma = new PrismaClient();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Opciones centrales para inyectar la Cookie de forma segura
const getCookieOptions = () => ({
    httpOnly: true, // Invisible para JavaScript (Evita ataques XSS)
    secure: process.env.NODE_ENV === 'production', // Solo HTTPS en producción (Vercel)
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', // Cross-domain
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 días (Igual que el vencimiento de tu JWT)
});

// SOLICITAR RECUPERACIÓN (Forgot Password)
export const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;

        // Buscar usuario
        const barber = await prisma.barber.findUnique({ where: { email } });
        if (!barber) {
            return res.status(200).json({ message: "Si el correo existe, recibirás un enlace de recuperación." });
        }

        // Generar token aleatorio
        const resetToken = randomBytes(32).toString('hex');

        // Ahora debe ser: createHash(...)
        const hashedToken = createHash('sha256') 
            .update(resetToken)
            .digest('hex');
        // -----------------------

        // Guardar en BD con expiración (10 minutos)
        await prisma.barber.update({
            where: { email },
            data: {
                passwordResetToken: hashedToken,
                passwordResetExpires: new Date(Date.now() + 10 * 60 * 1000) // 10 min
            }
        });

        // Enviar Email
        await sendPasswordResetEmail(email, barber.fullName, resetToken);

        res.status(200).json({ message: "Correo enviado" });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error en el servidor" });
    }
};

// RESTABLECER CONTRASEÑA (Reset Password)
export const resetPassword = async (req, res) => {
    try {
        const { token } = req.params; // Viene de la URL
        const { password } = req.body; // Nueva contraseña

        if (!password || password.length < 6) {
            return res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres" });
        }

        // Hashear el token que recibimos para compararlo con el de la BD
        const hashedToken = createHash('sha256')
            .update(token)
            .digest('hex');

        // Buscar usuario con ese token Y que no haya expirado
        const barber = await prisma.barber.findFirst({
            where: {
                passwordResetToken: hashedToken,
                passwordResetExpires: { gt: new Date() } // gt = Greater Than (Mayor que ahora)
            }
        });

        if (!barber) {
            return res.status(400).json({ error: "El enlace es inválido o ha expirado" });
        }

        // Encriptar la nueva contraseña
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        // Actualizar usuario y limpiar los tokens
        await prisma.barber.update({
            where: { id: barber.id },
            data: {
                passwordHash: passwordHash, // Si antes era null (Google), ahora ya tiene password
                passwordResetToken: null,
                passwordResetExpires: null
            }
        });
        
        res.status(200).json({ message: "Contraseña actualizada correctamente. Ahora puedes iniciar sesión." });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error al restablecer contraseña" });
    }
};

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

    if (!user) {
      return res.status(401).json({ error: "Credenciales inválidas" });
    }

    if(!user.passwordHash) {
        return res.status(400).json({
            error: "Este correo está registrado con Google. Por favor usa el botón de 'Iniciar con Google'."
        })
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

    // Ahora enviamos el token también como Cookie
    res.cookie('token', token, getCookieOptions()).json({
      message: "Bienvenido de nuevo",
      token: token, // Lo mantenemos en el JSON por si acaso
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
        expiresIn: process.env.JWT_EXPIRES_IN || '7d'
    });
};

export const googleLogin = async (req, res) => {
    try {
        const { googleToken } = req.body;
        console.log("1. Intentando verificar token de Google...");

        // Verificar el token con Google
        const ticket = await googleClient.verifyIdToken({
            idToken: googleToken,
            audience: process.env.GOOGLE_CLIENT_ID, 
        });
        
        const { name, email, picture, sub: googleId } = ticket.getPayload();
        console.log("2. Token verificado. Usuario:", email);

        // Buscar si el barbero ya existe
        let barber = await prisma.barber.findUnique({
            where: { email }
        });

        if (barber) {
            console.log("3. El usuario ya existe en BD.");
            // Si no tenía googleId vinculado, lo actualizamos
            if (!barber.googleId) {
                barber = await prisma.barber.update({
                    where: { email },
                    data: { 
                        googleId: googleId,
                        avatarUrl: barber.avatarUrl || picture
                    }
                });
            }
        } else {
            console.log("3. Usuario nuevo. Creando registro en BD...");
            const baseSlug = name.toLowerCase().replace(/\s+/g, '-');
            const uniqueSlug = `${baseSlug}-${Math.floor(Math.random() * 1000)}`;

            barber = await prisma.barber.create({
                data: {
                    email,
                    fullName: name,
                    googleId: googleId,
                    avatarUrl: picture,
                    slug: uniqueSlug,
                    passwordHash: null,
                    phone: "0000000000", // Teléfono genérico para evitar error de Prisma
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
            console.log("4. Usuario creado exitosamente.");
        }

        // Generar JWT del sistema
        const token = signToken(barber.id);

        // Inyectamos el token en la Cookie HttpOnly
        res.cookie('token', token, getCookieOptions()).json({
            status: 'success',
            token, // Lo mantenemos en el JSON por compatibilidad
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
        console.error(" ERROR REAL EN GOOGLE AUTH:", error);
        
        res.status(500).json({ 
            error: "Fallo en el proceso de autenticación", 
            detalle: error.message || "Error desconocido"
        });
    }
};

// Función para destruir la cookie y cerrar sesión
export const logout = (req, res) => {
    res.clearCookie('token', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
    }).json({ message: "Sesión cerrada exitosamente" });
};