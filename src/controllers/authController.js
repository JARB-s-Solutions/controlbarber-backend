import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { hashPassword, comparePassword } from "../utils/password.js";
import { generateToken } from "../utils/jwt.js";
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { randomBytes, createHash } from 'node:crypto'; 
import bcrypt from 'bcryptjs';
import { sendPasswordResetEmail } from "../utils/email.js";

const prisma = new PrismaClient();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// 1. REGISTRO (Crea Barbershop + Barbero OWNER)
const registerSchema = z.object({
    shopName: z.string().min(2, "El nombre de la sucursal debe tener al menos 2 caracteres"),
    fullName: z.string().min(3, "Tu nombre debe tener al menos 3 caracteres"),
    email: z.string().email("Correo electrónico inválido"),
    password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
    phone: z.string().min(10, "El número de teléfono debe tener al menos 10 dígitos")
});

export const register = async (req, res) => {
    try {
        const validation = registerSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({
                error: "Datos inválidos",
                details: validation.error.errors.map(e => ({ field: e.path[0], message: e.message }))
            });
        }
        
        const data = validation.data;

        // Verificar si el email ya existe
        const existingEmail = await prisma.barber.findUnique({ where: { email: data.email } });
        if(existingEmail) return res.status(400).json({ error: "El correo electrónico ya está registrado" });

        // Generar Slug seguro para la barbería
        const baseSlug = data.shopName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
        const shopSlug = `${baseSlug}-${randomBytes(2).toString('hex')}`;

        const hashedPassword = await hashPassword(data.password);

        // TRANSACCIÓN ATÓMICA: Sucursal + Barbero + Suscripción
        const result = await prisma.$transaction(async (tx) => {
            const barbershop = await tx.barbershop.create({
                data: {
                    name: data.shopName,
                    slug: shopSlug,
                    // timeZone ya toma "America/Merida" por defecto gracias a tu esquema Prisma
                }
            });

            const owner = await tx.barber.create({
                data: {
                    barbershopId: barbershop.id,
                    fullName: data.fullName,
                    email: data.email,
                    passwordHash: hashedPassword,
                    phone: data.phone,
                    role: 'OWNER' 
                }
            });

            await tx.subscription.create({
                data: {
                    barbershopId: barbershop.id,
                    type: "FREE",
                    startDate: new Date(),
                    endDate: new Date(new Date().setFullYear(new Date().getFullYear() + 100)),
                    status: "ACTIVE"
                }
            });

            return { barbershop, owner };
        });

        // El JWT ahora inyecta el Tenant
        const token = generateToken({ 
            id: result.owner.id, 
            role: result.owner.role,
            barbershopId: result.barbershop.id 
        });

        res.status(201).json({
            message: "Sucursal y cuenta creadas exitosamente",
            token,
            barbershop: { id: result.barbershop.id, name: result.barbershop.name, slug: result.barbershop.slug },
            user: { id: result.owner.id, fullName: result.owner.fullName, role: result.owner.role }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error interno del servidor al crear la sucursal" });
    }
};

// 2. LOGIN
const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "La contraseña es obligatoria")
});

export const login = async (req, res) => {
  try {
    const data = loginSchema.parse(req.body);

    const user = await prisma.barber.findUnique({
      where: { email: data.email },
      include: { barbershop: { select: { name: true, slug: true, timeZone: true } } }
    });

    if(!user) return res.status(401).json({ error: "Credenciales inválidas" });
    if(!user.passwordHash) return res.status(400).json({ error: "Usa el botón de 'Iniciar con Google'." });
    
    const isValid = await comparePassword(data.password, user.passwordHash);
    if (!isValid) return res.status(401).json({ error: "Credenciales inválidas" });
    if (!user.isActive) return res.status(403).json({ error: "Cuenta suspendida. Contacta soporte." });

    // Inyectar el Tenant
    const token = generateToken({ 
      id: user.id, 
      role: user.role,
      barbershopId: user.barbershopId
    });

    res.json({
      message: "Bienvenido de nuevo",
      token,
      barbershop: user.barbershop,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        avatar: user.avatarUrl
      }
    });
  } catch (error) {
    res.status(500).json({ error: "Error interno del servidor" });
  }
};

// 3. LOGIN CON GOOGLE
export const googleLogin = async (req, res) => {
    try {
        const { googleToken } = req.body;
        const ticket = await googleClient.verifyIdToken({ idToken: googleToken, audience: process.env.GOOGLE_CLIENT_ID });
        const { name, email, picture, sub: googleId } = ticket.getPayload();

        let barber = await prisma.barber.findUnique({ 
            where: { email },
            include: { barbershop: true }
        });

        if (barber) {
            if (!barber.googleId) {
                barber = await prisma.barber.update({
                    where: { email },
                    data: { googleId, avatarUrl: barber.avatarUrl || picture },
                    include: { barbershop: true }
                });
            }
        } else {
            // Usuario Nuevo vía Google -> Crea su propia sucursal
            const shopSlug = `barberia-de-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${randomBytes(2).toString('hex')}`;
            
            const result = await prisma.$transaction(async (tx) => {
                const shop = await tx.barbershop.create({
                    data: { name: `Barbería de ${name}`, slug: shopSlug }
                });

                const newOwner = await tx.barber.create({
                    data: {
                        barbershopId: shop.id, email, fullName: name, googleId, avatarUrl: picture,
                        role: 'OWNER'
                    }
                });

                await tx.subscription.create({
                    data: { barbershopId: shop.id, type: 'FREE', startDate: new Date(), endDate: new Date(new Date().setFullYear(new Date().getFullYear() + 10)), status: 'ACTIVE' }
                });
                return { newOwner, shop };
            });
            barber = { ...result.newOwner, barbershop: result.shop };
        }

        const token = generateToken({ id: barber.id, role: barber.role, barbershopId: barber.barbershopId });

        res.json({
            status: 'success', token,
            data: {
                barbershop: barber.barbershop,
                user: { id: barber.id, name: barber.fullName, email: barber.email, avatar: barber.avatarUrl, role: barber.role }
            }
        });
    } catch (error) {
        res.status(401).json({ error: "Token de Google inválido" });
    }
};

// 4. PERFIL
export const getProfile = async (req, res) => {
    try {
        const user = await prisma.barber.findUnique({
            where: { id: req.user.id },
            select: {
                id: true, fullName: true, email: true, phone: true, role: true,
                barbershop: { select: { id: true, name: true, slug: true, timeZone: true, subscription: true } }
            }
        });
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: "Error al obtener perfil" });
    }
};

// 5. RECUPERACIÓN DE CONTRASEÑA 
export const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        const barber = await prisma.barber.findUnique({ where: { email } });
        if (!barber) return res.status(200).json({ message: "Si el correo existe, recibirás un enlace." });

        const resetToken = randomBytes(32).toString('hex');
        const hashedToken = createHash('sha256').update(resetToken).digest('hex');

        await prisma.barber.update({
            where: { email },
            data: { passwordResetToken: hashedToken, passwordResetExpires: new Date(Date.now() + 10 * 60 * 1000) }
        });

        await sendPasswordResetEmail(email, barber.fullName, resetToken);
        res.status(200).json({ message: "Correo enviado" });
    } catch (error) { res.status(500).json({ error: "Error en el servidor" }); }
};

export const resetPassword = async (req, res) => {
    try {
        const { token } = req.params; 
        const { password } = req.body; 
        if (!password || password.length < 6) return res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres" });

        const hashedToken = createHash('sha256').update(token).digest('hex');
        const barber = await prisma.barber.findFirst({
            where: { passwordResetToken: hashedToken, passwordResetExpires: { gt: new Date() } }
        });

        if (!barber) return res.status(400).json({ error: "Enlace inválido o expirado" });

        const passwordHash = await hashPassword(password);
        await prisma.barber.update({
            where: { id: barber.id },
            data: { passwordHash, passwordResetToken: null, passwordResetExpires: null }
        });
        
        res.status(200).json({ message: "Contraseña actualizada. Ahora puedes iniciar sesión." });
    } catch (error) { res.status(500).json({ error: "Error al restablecer contraseña" }); }
};