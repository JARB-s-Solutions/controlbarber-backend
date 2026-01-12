import nodemailer from 'nodemailer';
import jwt from 'jsonwebtoken';

// 1. Configuración del transporter de nodemailer
const transporter = nodemailer.createTransport({
    service: 'gmail', // <--- Simplemente 'gmail'
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS 
    }
});

// 2. Función para enviar la solicitud de reseña
export const sendReviewRequest = async (clientEmail, clientName, barberName, appointmentId, serviceName) => {
    try {
        if (!clientEmail) return; // Si no tiene email, no hacemos nada

        // Generamos un TOKEN seguro para que SOLO él pueda calificar esa cita específica
        // El token expira en 7 días
        const reviewToken = jwt.sign(
            { appointmentId }, 
            process.env.JWT_SECRET, 
            { expiresIn: '7d' }
        );

        // Link al Frontend (cuando lo tengas)
        // Ejemplo: controlbarber.app/review?token=...
        const reviewLink = `${process.env.FRONTEND_URL}?token=${reviewToken}`;

        const mailOptions = {
            from: '"ControlBarber App" <no-reply@controlbarber.app>',
            to: clientEmail,
            subject: `💈 ¿Qué tal tu corte con ${barberName}?`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2>¡Hola ${clientName}!</h2>
                    <p>Gracias por visitarnos hoy.</p>
                    <p>Esperamos que te haya gustado tu <strong>${serviceName}</strong> con <strong>${barberName}</strong>.</p>
                    <br>
                    <p>Nos ayudaría mucho si nos dejas una breve reseña (toma 10 segundos):</p>
                    <a href="${reviewLink}" style="background-color: #000; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 5px;">⭐⭐⭐⭐⭐ Calificar Servicio</a>
                    <br><br>
                    <small>Si el botón no funciona, copia este link: ${reviewLink}</small>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        console.log(`📧 Correo de reseña enviado a ${clientEmail}`);

    } catch (error) {
        console.error("Error enviando email:", error);
    }
};