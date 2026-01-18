import nodemailer from 'nodemailer';
import jwt from 'jsonwebtoken';
import dayjs from 'dayjs';

// Configuración del Transporte (Gmail o SMTP)
const transporter = nodemailer.createTransport({
    service: 'gmail', 
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS 
    }
});


// --- TEMPLATE BASE (Para que todos los correos se vean igual) ---
const getHtmlTemplate = (title, bodyContent) => {
    return `
        <div style="font-family: 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f4; padding: 40px 0;">
            <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                <div style="background-color: #1a1a1a; padding: 20px; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 24px;">💈 ControlBarber</h1>
                </div>
                <div style="padding: 30px;">
                    <h2 style="color: #333333; margin-top: 0;">${title}</h2>
                    ${bodyContent}
                </div>
                <div style="background-color: #eeeeee; padding: 15px; text-align: center; font-size: 12px; color: #777777;">
                    <p>Gestionado por ControlBarber App</p>
                </div>
            </div>
        </div>
    `;
};


// --- DISPARADOR 1: CONFIRMACIÓN DE CITA ---
export const sendAppointmentConfirmation = async (clientEmail, clientName, barberName, serviceName, date) => {
    if (!clientEmail) return;

    try {
        const formattedDate = dayjs(date).format('DD/MM/YYYY');
        const formattedTime = dayjs(date).format('HH:mm');

        const html = getHtmlTemplate(
            `¡Tu cita está confirmada! ✅`,
            `
            <p>Hola <strong>${clientName}</strong>,</p>
            <p>Tu reserva ha sido agendada con éxito. Aquí tienes los detalles:</p>
            <div style="background-color: #f9f9f9; padding: 15px; border-left: 4px solid #4CAF50; margin: 20px 0;">
                <p style="margin: 5px 0;"><strong>Barbero:</strong> ${barberName}</p>
                <p style="margin: 5px 0;"><strong>Servicio:</strong> ${serviceName}</p>
                <p style="margin: 5px 0;"><strong>Fecha:</strong> ${formattedDate}</p>
                <p style="margin: 5px 0;"><strong>Hora:</strong> ${formattedTime}</p>
            </div>
            <p>Te esperamos. ¡No llegues tarde!</p>
            `
        );

        await transporter.sendMail({
            from: '"ControlBarber" <no-reply@controlbarber.app>',
            to: clientEmail,
            subject: '✅ Confirmación de Cita - ControlBarber',
            html: html
        });
        console.log(`📧 Confirmación enviada a ${clientEmail}`);
    } catch (error) {
        console.error("Error enviando confirmación:", error);
    }
};


// --- DISPARADOR 2: CANCELACIÓN DE CITA ---
// ...
export const sendAppointmentCancellation = async (email, clientName, barberName, date, reason = "Imprevistos del barbero") => {
    try {
        const formattedDate = dayjs(date).format('DD/MM/YYYY HH:mm');
        
        const html = getHtmlTemplate(
            'Cita Cancelada ❌',
            `
            <p>Hola <strong>${clientName}</strong>,</p>
            <p>Lamentamos informarte que tu cita con <strong>${barberName}</strong> programada para el <strong>${formattedDate}</strong> ha sido cancelada.</p>
            
            <div style="background-color: #fff3cd; border: 1px solid #ffeeba; padding: 15px; border-radius: 5px; margin: 20px 0; color: #856404;">
                <strong>Motivo de la cancelación:</strong><br>
                ${reason}
            </div>

            <p>Por favor, visita nuevamente nuestro perfil para reagendar en un horario disponible.</p>
            <div style="text-align: center; margin-top: 20px;">
                <a href="${process.env.FRONTEND_URL}" style="background-color: #333; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Reagendar Cita</a>
            </div>
            `
        );

        await transporter.sendMail({
            from: '"ControlBarber" <no-reply@controlbarber.app>',
            to: email,
            subject: '⚠️ Importante: Tu cita ha sido cancelada',
            html: html
        });
    } catch (error) {
        console.error("Error enviando cancelación:", error);
    }
};



// --- DISPARADOR 3: SOLICITUD DE RESEÑA (Función para enviar la solicitud de reseña) ---
export const sendReviewRequest = async (clientEmail, clientName, barberName, appointmentId, serviceName) => {
    if (!clientEmail) return;

    try {
        const reviewToken = jwt.sign({ appointmentId }, process.env.JWT_SECRET, { expiresIn: '7d' });
        // OJO: Ajusta esto cuando tengas dominio real. Ahora apunta a tu HTML temporal o Localhost
        const reviewLink = `${process.env.FRONTEND_URL}?token=${reviewToken}`; 

        const html = getHtmlTemplate(
            `¿Qué tal tu corte? ⭐`,
            `
            <p>Hola <strong>${clientName}</strong>,</p>
            <p>Gracias por visitarnos hoy. Esperamos que te haya gustado tu <strong>${serviceName}</strong> con <strong>${barberName}</strong>.</p>
            <p>Nos ayudaría mucho si nos dejas una breve calificación:</p>
            <div style="text-align: center; margin: 30px 0;">
                <a href="${reviewLink}" style="background-color: #000; color: #fff; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">⭐⭐⭐⭐⭐ Calificar Servicio</a>
            </div>
            <small style="display: block; text-align: center;">Si el botón no funciona: <a href="${reviewLink}">${reviewLink}</a></small>
            `
        );

        await transporter.sendMail({
            from: '"ControlBarber" <no-reply@controlbarber.app>',
            to: clientEmail,
            subject: `💈 ¿Qué tal tu corte con ${barberName}?`,
            html: html
        });
        
        console.log(`📧 Solicitud de reseña enviada a ${clientEmail}`);
        console.log("🔗 LINK GENERADO:", reviewLink); 

    } catch (error) {
        console.error("Error enviando solicitud reseña:", error);
    }
};


// --- DISPARADOR 4: AVISO DE NUEVA CITA (PARA EL BARBERO)
export const sendNewAppointmentNotificationToBarber = async (barberEmail, barberName, clientName, serviceName, date) => {
    if (!barberEmail) return;

    try {
        const formattedDate = dayjs(date).format('DD/MM/YYYY HH:mm');

        const html = getHtmlTemplate(
            `📅 Nueva Cita Agendada`,
            `
            <p>Hola <strong>${barberName}</strong>,</p>
            <p>¡Buenas noticias! Tienes una nueva reserva confirmada.</p>
            <div style="background-color: #e3f2fd; padding: 15px; border-left: 4px solid #2196F3; margin: 20px 0;">
                <p style="margin: 5px 0;"><strong>Cliente:</strong> ${clientName}</p>
                <p style="margin: 5px 0;"><strong>Servicio:</strong> ${serviceName}</p>
                <p style="margin: 5px 0;"><strong>Fecha y Hora:</strong> ${formattedDate}</p>
            </div>
            <p>Ingresa a tu dashboard para ver más detalles.</p>
            `
        );

        await transporter.sendMail({
            from: '"ControlBarber System" <no-reply@controlbarber.app>',
            to: barberEmail,
            subject: `📅 Nueva Cita: ${clientName} - ${formattedDate}`,
            html: html
        });
        console.log(`📧 Notificación de cita enviada al barbero (${barberEmail})`);

    } catch (error) {
        console.error("Error enviando email al barbero:", error);
    }
};



// --- DISPARADOR 5: AVISO DE NUEVA RESEÑA (PARA EL BARBERO)
export const sendNewReviewNotificationToBarber = async (barberEmail, barberName, clientName, rating, comment) => {
    if (!barberEmail) return;

    try {
        const stars = '⭐'.repeat(rating); // Ej: ⭐⭐⭐⭐⭐

        const html = getHtmlTemplate(
            `¡Nueva Reseña Recibida!`,
            `
            <p>Hola <strong>${barberName}</strong>,</p>
            <p>El cliente <strong>${clientName}</strong> acaba de calificar su visita.</p>
            <div style="text-align: center; font-size: 24px; margin: 20px 0;">
                ${stars}
            </div>
            ${comment ? `
            <div style="background-color: #fff3e0; padding: 15px; border-radius: 5px; font-style: italic; color: #555;">
                "${comment}"
            </div>` : ''}
            <br>
            <p>¡Sigue así!</p>
            `
        );

        await transporter.sendMail({
            from: '"ControlBarber System" <no-reply@controlbarber.app>',
            to: barberEmail,
            subject: `⭐ Nueva Reseña de ${rating} Estrellas`,
            html: html
        });
        console.log(`📧 Notificación de reseña enviada al barbero (${barberEmail})`);

    } catch (error) {
        console.error("Error enviando email de reseña al barbero:", error);
    }
};


// --- DISPARADOR 6: RECUPERACIÓN DE CONTRASEÑA 🔒 ---
export const sendPasswordResetEmail = async (email, name, resetToken) => {
    if (!email) return;

    try {
        // En producción, esto debe apuntar a tu Frontend real (React/Next/Vue)
        // Ejemplo: https://micontrolbarber.com/reset-password?token=...
        const resetUrl = `${process.env.FRONTEND_URL}/auth/reset-password?token=${resetToken}`;

        const html = getHtmlTemplate(
            `Restablecer Contraseña 🔑`,
            `
            <p>Hola <strong>${name}</strong>,</p>
            <p>Hemos recibido una solicitud para restablecer tu contraseña en ControlBarber.</p>
            <p>Haz clic en el siguiente botón para crear una nueva contraseña. Este enlace expira en 10 minutos.</p>
            
            <div style="text-align: center; margin: 30px 0;">
                <a href="${resetUrl}" style="background-color: #E63946; color: #fff; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">Restablecer Contraseña</a>
            </div>

            <p style="font-size: 12px; color: #666;">Si tú no pediste este cambio, ignora este correo y tu contraseña seguirá siendo la misma.</p>
            <p style="font-size: 12px; color: #888;">O copia este enlace: <br> <a href="${resetUrl}">${resetUrl}</a></p>
            `
        );

        await transporter.sendMail({
            from: '"Seguridad ControlBarber" <no-reply@controlbarber.app>',
            to: email,
            subject: '🔑 Restablecer tu contraseña',
            html: html
        });
        
        console.log(`📧 Email de recuperación enviado a ${email}`);

    } catch (error) {
        console.error("Error enviando email de recuperación:", error);
    }
};