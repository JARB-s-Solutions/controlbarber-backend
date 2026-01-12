import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Úsalo en otros controladores: await createNotification(barberId, "Nueva Cita", "Juan reservó a las 5pm");
export const createNotification = async (barberId, title, message) => {
    try {
        await prisma.notification.create({
            data: {
                barberId,
                title,
                message
            }
        });
    } catch (error) {
        console.error("Error creando notificación interna:", error);
    }
};

// --- ENDPOINTS ---

// Obtener mis notificaciones
export const getMyNotifications = async (req, res) => {
    try {
        const barberId = req.user.id;
        
        // Obtenemos las últimas 20 (para no saturar)
        const notifications = await prisma.notification.findMany({
            where: { barberId },
            orderBy: { createdAt: 'desc' },
            take: 20
        });

        // Contamos cuántas hay sin leer
        const unreadCount = await prisma.notification.count({
            where: { barberId, isRead: false }
        });

        res.json({
            unreadCount,
            notifications
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error al obtener notificaciones" });
    }
};

// Marcar una como leída
export const markAsRead = async (req, res) => {
    try {
        const { id } = req.params;
        const barberId = req.user.id;

        // Verificar propiedad
        const notification = await prisma.notification.findFirst({
            where: { id: parseInt(id), barberId }
        });

        if (!notification) {
            return res.status(404).json({ error: "Notificación no encontrada" });
        }

        const updated = await prisma.notification.update({
            where: { id: parseInt(id) },
            data: { isRead: true }
        });

        res.json(updated);

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error al actualizar notificación" });
    }
};

// Marcar TODAS como leídas (Botón "Marcar todo como leído")
export const markAllAsRead = async (req, res) => {
    try {
        const barberId = req.user.id;

        await prisma.notification.updateMany({
            where: { barberId, isRead: false },
            data: { isRead: true }
        });

        res.json({ message: "Todas las notificaciones marcadas como leídas" });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error al actualizar notificaciones" });
    }
};