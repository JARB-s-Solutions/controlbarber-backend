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


// --- TEMPLATE BASE MEJORADO (Responsive y Moderno) ---
const getHtmlTemplate = (title, bodyContent, accentColor = '#E63946') => {
    return `
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta http-equiv="X-UA-Compatible" content="IE=edge">
        </head>
        <body style="margin: 0; padding: 0; background-color: #f5f7fa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #f5f7fa; padding: 20px 0;">
                <tr>
                    <td align="center">
                        <!-- Contenedor Principal -->
                        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); overflow: hidden;">
                            
                            <!-- Header con gradiente -->
                            <tr>
                                <td style="background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%); padding: 32px 24px; text-align: center;">
                                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                                        <tr>
                                            <td align="center">
                                                <div style="background-color: rgba(255,255,255,0.1); display: inline-block; padding: 8px 16px; border-radius: 20px; margin-bottom: 12px;">
                                                    <span style="font-size: 32px;">💈</span>
                                                </div>
                                                <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">ControlBarber</h1>
                                                <p style="color: #b0b0b0; margin: 8px 0 0 0; font-size: 13px; text-transform: uppercase; letter-spacing: 1px;">Sistema de Gestión Profesional</p>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                            
                            <!-- Barra de acento -->
                            <tr>
                                <td style="background-color: ${accentColor}; height: 4px; line-height: 4px; font-size: 0;">&nbsp;</td>
                            </tr>
                            
                            <!-- Contenido Principal -->
                            <tr>
                                <td style="padding: 40px 32px;">
                                    <h2 style="color: #1a1a1a; margin: 0 0 24px 0; font-size: 24px; font-weight: 600; line-height: 1.3;">${title}</h2>
                                    <div style="color: #4a5568; font-size: 15px; line-height: 1.6;">
                                        ${bodyContent}
                                    </div>
                                </td>
                            </tr>
                            
                            <!-- Footer -->
                            <tr>
                                <td style="background-color: #f8f9fa; padding: 28px 32px; border-top: 1px solid #e9ecef;">
                                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                                        <tr>
                                            <td align="center">
                                                <p style="margin: 0 0 12px 0; color: #6c757d; font-size: 13px; line-height: 1.5;">
                                                    <strong style="color: #495057;">ControlBarber</strong> - Tu aliado en gestión de barbería
                                                </p>
                                                <p style="margin: 0; font-size: 11px; color: #adb5bd;">
                                                    Este correo fue enviado automáticamente, por favor no responder.<br>
                                                    © ${new Date().getFullYear()} ControlBarber. Todos los derechos reservados.
                                                </p>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                            
                        </table>
                    </td>
                </tr>
            </table>
        </body>
        </html>
    `;
};

// --- FUNCIÓN PARA CREAR BOTONES CONSISTENTES ---
const createButton = (url, text, bgColor = '#1a1a1a') => {
    return `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin: 24px 0;">
            <tr>
                <td style="border-radius: 6px; background-color: ${bgColor};">
                    <a href="${url}" target="_blank" style="display: inline-block; padding: 14px 32px; font-size: 15px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 6px; line-height: 1;">
                        ${text}
                    </a>
                </td>
            </tr>
        </table>
    `;
};

// --- FUNCIÓN PARA CREAR CAJAS DE INFORMACIÓN ---
const createInfoBox = (items, bgColor = '#f8f9fa', borderColor = '#4CAF50') => {
    const itemsHtml = items.map(item => `
        <tr>
            <td style="padding: 10px 0; border-bottom: 1px solid #e9ecef;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                    <tr>
                        <td width="35%" style="color: #6c757d; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                            ${item.icon ? item.icon + ' ' : ''}${item.label}
                        </td>
                        <td style="color: #1a1a1a; font-size: 15px; font-weight: 600;">
                            ${item.value}
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    `).join('');
    
    return `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: ${bgColor}; border-left: 4px solid ${borderColor}; border-radius: 8px; margin: 20px 0; overflow: hidden;">
            <tr>
                <td style="padding: 20px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                        ${itemsHtml}
                    </table>
                </td>
            </tr>
        </table>
    `;
};

// --- CORREO DE RECORDATORIO DE CITA ---
export const sendAppointmentReminderEmail = async (email, clientName, barberName, date, serviceName) => {
    if (!email) return;
    
    try {
        const formattedDate = dayjs(date).format('DD/MM/YYYY');
        const formattedTime = dayjs(date).format('HH:mm');

        const infoItems = [
            { label: 'Barbero', value: barberName, icon: '👨‍💼' },
            { label: 'Servicio', value: serviceName, icon: '✂️' },
            { label: 'Fecha', value: formattedDate, icon: '📅' },
            { label: 'Hora', value: formattedTime, icon: '🕐' }
        ];

        const html = getHtmlTemplate(
            '🔔 Recordatorio de Cita',
            `
            <p style="margin: 0 0 16px 0;">Hola <strong style="color: #1a1a1a;">${clientName}</strong>,</p>
            <p style="margin: 0 0 24px 0;">Este es un recordatorio amigable de tu cita programada para <strong>mañana</strong>.</p>
            
            ${createInfoBox(infoItems, '#fff8e1', '#FFC107')}
            
            <div style="background-color: #e3f2fd; border-radius: 8px; padding: 16px; margin: 24px 0; border-left: 4px solid #2196F3;">
                <p style="margin: 0; font-size: 14px; color: #1565c0;">
                    <strong>💡 Consejo:</strong> Te recomendamos llegar 5 minutos antes de tu cita.
                </p>
            </div>
            
            <p style="margin: 24px 0 0 0; font-size: 13px; color: #6c757d; line-height: 1.5;">
                Si necesitas cancelar o reagendar, por favor contacta al barbero lo antes posible para liberar el espacio.
            </p>
            `,
            '#FFC107'
        );

        await transporter.sendMail({
            from: '"ControlBarber Recordatorios" <no-reply@controlbarber.app>',
            to: email,
            subject: `🔔 Recordatorio: Tu cita mañana con ${barberName}`,
            html: html
        });
        
        console.log(`📧 Recordatorio enviado a ${email}`);
    } catch (error) {
        console.error("Error enviando email de recordatorio:", error);
    }
};


// --- DISPARADOR 1: CONFIRMACIÓN DE CITA ---
export const sendAppointmentConfirmation = async (clientEmail, clientName, barberName, serviceName, date) => {
    if (!clientEmail) return;

    try {
        const formattedDate = dayjs(date).format('DD/MM/YYYY');
        const formattedTime = dayjs(date).format('HH:mm');
        const dayName = dayjs(date).format('dddd');

        const infoItems = [
            { label: 'Barbero', value: barberName, icon: '👨‍💼' },
            { label: 'Servicio', value: serviceName, icon: '✂️' },
            { label: 'Fecha', value: `${dayName}, ${formattedDate}`, icon: '📅' },
            { label: 'Hora', value: formattedTime, icon: '🕐' }
        ];

        const html = getHtmlTemplate(
            '✅ ¡Tu cita está confirmada!',
            `
            <p style="margin: 0 0 16px 0;">Hola <strong style="color: #1a1a1a;">${clientName}</strong>,</p>
            <p style="margin: 0 0 24px 0;">¡Excelente noticia! Tu reserva ha sido agendada con éxito. Aquí tienes los detalles de tu cita:</p>
            
            ${createInfoBox(infoItems, '#f1f8f4', '#4CAF50')}
            
            <div style="background-color: #fff3e0; border-radius: 8px; padding: 16px; margin: 24px 0; border-left: 4px solid #FF9800;">
                <p style="margin: 0; font-size: 14px; color: #e65100;">
                    <strong>📌 Importante:</strong> Por favor llega puntual para aprovechar al máximo tu tiempo.
                </p>
            </div>
            
            <p style="margin: 24px 0 0 0; text-align: center; font-size: 16px; color: #4CAF50; font-weight: 600;">
                ¡Te esperamos! 💈
            </p>
            `,
            '#4CAF50'
        );

        await transporter.sendMail({
            from: '"ControlBarber" <no-reply@controlbarber.app>',
            to: clientEmail,
            subject: `✅ Confirmación de Cita con ${barberName}`,
            html: html
        });
        console.log(`📧 Confirmación enviada a ${clientEmail}`);
    } catch (error) {
        console.error("Error enviando confirmación:", error);
    }
};


// --- DISPARADOR 2: CANCELACIÓN DE CITA ---
export const sendAppointmentCancellation = async (email, clientName, barberName, date, reason = "Imprevistos del barbero") => {
    if (!email) return;
    
    try {
        const formattedDate = dayjs(date).format('DD/MM/YYYY');
        const formattedTime = dayjs(date).format('HH:mm');
        
        const html = getHtmlTemplate(
            '⚠️ Cita Cancelada',
            `
            <p style="margin: 0 0 16px 0;">Hola <strong style="color: #1a1a1a;">${clientName}</strong>,</p>
            <p style="margin: 0 0 24px 0;">Lamentamos informarte que tu cita con <strong>${barberName}</strong> ha sido cancelada.</p>
            
            <div style="background-color: #fff3e0; border-radius: 8px; padding: 20px; margin: 24px 0; border-left: 4px solid #FF9800;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                    <tr>
                        <td style="padding-bottom: 12px;">
                            <strong style="color: #e65100; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">📅 Detalles de la cita cancelada:</strong>
                        </td>
                    </tr>
                    <tr>
                        <td style="color: #6c757d; font-size: 14px; line-height: 1.6;">
                            <strong>Fecha:</strong> ${formattedDate} a las ${formattedTime}<br>
                            <strong>Servicio programado:</strong> Con ${barberName}
                        </td>
                    </tr>
                </table>
            </div>
            
            <div style="background-color: #ffebee; border-radius: 8px; padding: 16px; margin: 24px 0; border-left: 4px solid #f44336;">
                <p style="margin: 0; font-size: 14px; color: #c62828;">
                    <strong>📝 Motivo:</strong> ${reason}
                </p>
            </div>

            <p style="margin: 24px 0; font-size: 15px; color: #4a5568; text-align: center;">
                No te preocupes, puedes agendar una nueva cita cuando lo desees.
            </p>
            
            ${createButton(process.env.FRONTEND_URL || '#', '📅 Agendar Nueva Cita', '#1a1a1a')}
            `,
            '#FF9800'
        );

        await transporter.sendMail({
            from: '"ControlBarber" <no-reply@controlbarber.app>',
            to: email,
            subject: `⚠️ Cita Cancelada - ${barberName}`,
            html: html
        });
        console.log(`📧 Cancelación enviada a ${email}`);
    } catch (error) {
        console.error("Error enviando cancelación:", error);
    }
};



// --- DISPARADOR 3: SOLICITUD DE RESEÑA ---
export const sendReviewRequest = async (clientEmail, clientName, barberName, appointmentId, serviceName) => {
    if (!clientEmail) return;

    try {
        const reviewToken = jwt.sign({ appointmentId }, process.env.JWT_SECRET, { expiresIn: '7d' });
        const reviewLink = `${process.env.FRONTEND_URL}?token=${reviewToken}`; 

        const html = getHtmlTemplate(
            '⭐ ¿Qué tal tu experiencia?',
            `
            <p style="margin: 0 0 16px 0;">Hola <strong style="color: #1a1a1a;">${clientName}</strong>,</p>
            <p style="margin: 0 0 8px 0;">¡Gracias por visitarnos! Esperamos que hayas disfrutado de tu <strong>${serviceName}</strong> con <strong>${barberName}</strong>.</p>
            <p style="margin: 0 0 32px 0;">Tu opinión es muy valiosa para nosotros y ayuda a otros clientes a tomar la mejor decisión.</p>
            
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;">
                <p style="margin: 0 0 8px 0; color: #ffffff; font-size: 18px; font-weight: 600;">Califica tu experiencia</p>
                <div style="font-size: 32px; margin: 12px 0;">
                    ⭐⭐⭐⭐⭐
                </div>
                <p style="margin: 8px 0 0 0; color: rgba(255,255,255,0.9); font-size: 13px;">
                    Solo te tomará 30 segundos
                </p>
            </div>
            
            ${createButton(reviewLink, '✍️ Dejar mi Opinión', '#667eea')}
            
            <p style="margin: 24px 0 0 0; font-size: 12px; color: #adb5bd; text-align: center; line-height: 1.5;">
                Este enlace expira en 7 días. Si tienes problemas con el botón,<br>
                copia y pega este enlace: <a href="${reviewLink}" style="color: #667eea;">${reviewLink}</a>
            </p>
            `,
            '#667eea'
        );

        await transporter.sendMail({
            from: '"ControlBarber" <no-reply@controlbarber.app>',
            to: clientEmail,
            subject: `⭐ ${clientName}, cuéntanos sobre tu experiencia con ${barberName}`,
            html: html
        });
        
        console.log(`📧 Solicitud de reseña enviada a ${clientEmail}`);
        console.log("🔗 LINK GENERADO:", reviewLink); 

    } catch (error) {
        console.error("Error enviando solicitud reseña:", error);
    }
};


// --- DISPARADOR 4: AVISO DE NUEVA CITA (PARA EL BARBERO) ---
export const sendNewAppointmentNotificationToBarber = async (barberEmail, barberName, clientName, serviceName, date) => {
    if (!barberEmail) return;

    try {
        const formattedDate = dayjs(date).format('DD/MM/YYYY');
        const formattedTime = dayjs(date).format('HH:mm');
        const dayName = dayjs(date).format('dddd');

        const infoItems = [
            { label: 'Cliente', value: clientName, icon: '👤' },
            { label: 'Servicio', value: serviceName, icon: '✂️' },
            { label: 'Fecha', value: `${dayName}, ${formattedDate}`, icon: '📅' },
            { label: 'Hora', value: formattedTime, icon: '🕐' }
        ];

        const html = getHtmlTemplate(
            '🎉 ¡Nueva Cita Agendada!',
            `
            <p style="margin: 0 0 16px 0;">Hola <strong style="color: #1a1a1a;">${barberName}</strong>,</p>
            <p style="margin: 0 0 24px 0;">¡Excelentes noticias! Tienes una nueva reserva confirmada en tu agenda.</p>
            
            ${createInfoBox(infoItems, '#e3f2fd', '#2196F3')}
            
            <div style="background-color: #f1f8f4; border-radius: 8px; padding: 16px; margin: 24px 0; border-left: 4px solid #4CAF50;">
                <p style="margin: 0; font-size: 14px; color: #2e7d32;">
                    <strong>💡 Tip:</strong> Recuerda revisar tu inventario y confirmar disponibilidad de productos para este servicio.
                </p>
            </div>
            
            ${createButton(process.env.FRONTEND_URL || '#', '📊 Ver en Dashboard', '#2196F3')}
            
            <p style="margin: 24px 0 0 0; font-size: 13px; color: #6c757d; text-align: center;">
                Mantén tu agenda actualizada para ofrecer el mejor servicio.
            </p>
            `,
            '#2196F3'
        );

        await transporter.sendMail({
            from: '"ControlBarber Sistema" <no-reply@controlbarber.app>',
            to: barberEmail,
            subject: `📅 Nueva Reserva: ${clientName} - ${formattedDate} ${formattedTime}`,
            html: html
        });
        console.log(`📧 Notificación de cita enviada al barbero (${barberEmail})`);

    } catch (error) {
        console.error("Error enviando email al barbero:", error);
    }
};



// --- DISPARADOR 5: AVISO DE NUEVA RESEÑA (PARA EL BARBERO) ---
export const sendNewReviewNotificationToBarber = async (barberEmail, barberName, clientName, rating, comment) => {
    if (!barberEmail) return;

    try {
        const stars = '⭐'.repeat(rating);
        const emptyStars = '☆'.repeat(5 - rating);
        const ratingColor = rating >= 4 ? '#4CAF50' : rating >= 3 ? '#FF9800' : '#f44336';
        const ratingText = rating >= 4 ? 'Excelente' : rating >= 3 ? 'Buena' : 'Necesita mejorar';

        const html = getHtmlTemplate(
            '🌟 ¡Nueva Reseña Recibida!',
            `
            <p style="margin: 0 0 16px 0;">Hola <strong style="color: #1a1a1a;">${barberName}</strong>,</p>
            <p style="margin: 0 0 24px 0;">¡Tienes retroalimentación nueva! El cliente <strong>${clientName}</strong> acaba de calificar su experiencia.</p>
            
            <div style="background-color: #f8f9fa; border-radius: 12px; padding: 24px; margin: 24px 0; text-align: center;">
                <p style="margin: 0 0 8px 0; color: #6c757d; font-size: 13px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">
                    Calificación Recibida
                </p>
                <div style="font-size: 40px; margin: 12px 0; line-height: 1;">
                    ${stars}${emptyStars}
                </div>
                <p style="margin: 8px 0 0 0; font-size: 18px; font-weight: 600; color: ${ratingColor};">
                    ${rating}/5 - ${ratingText}
                </p>
            </div>
            
            ${comment ? `
            <div style="background-color: #fff8e1; border-radius: 8px; padding: 20px; margin: 24px 0; border-left: 4px solid #FFC107;">
                <p style="margin: 0 0 8px 0; font-size: 13px; color: #f57c00; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                    💬 Comentario del cliente:
                </p>
                <p style="margin: 0; font-size: 15px; color: #5d4037; font-style: italic; line-height: 1.6;">
                    "${comment}"
                </p>
            </div>
            ` : ''}
            
            <div style="background-color: ${rating >= 4 ? '#f1f8f4' : '#fff3e0'}; border-radius: 8px; padding: 16px; margin: 24px 0; border-left: 4px solid ${rating >= 4 ? '#4CAF50' : '#FF9800'};">
                <p style="margin: 0; font-size: 14px; color: ${rating >= 4 ? '#2e7d32' : '#e65100'};">
                    <strong>💡 ${rating >= 4 ? 'Felicidades!' : 'Oportunidad de mejora:'}</strong> ${rating >= 4 ? 'Sigue brindando este excelente servicio.' : 'Analiza esta retroalimentación para mejorar tu servicio.'}
                </p>
            </div>
            
            ${createButton(process.env.FRONTEND_URL || '#', '📊 Ver Todas las Reseñas', '#667eea')}
            `,
            ratingColor
        );

        await transporter.sendMail({
            from: '"ControlBarber Sistema" <no-reply@controlbarber.app>',
            to: barberEmail,
            subject: `${stars} Nueva Reseña de ${clientName} (${rating}/5)`,
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
        const resetUrl = `${process.env.FRONTEND_URL}/auth/reset-password?token=${resetToken}`;
        const expirationMinutes = 10;

        const html = getHtmlTemplate(
            '🔐 Restablece tu Contraseña',
            `
            <p style="margin: 0 0 16px 0;">Hola <strong style="color: #1a1a1a;">${name}</strong>,</p>
            <p style="margin: 0 0 8px 0;">Hemos recibido una solicitud para restablecer la contraseña de tu cuenta en ControlBarber.</p>
            <p style="margin: 0 0 24px 0;">Si fuiste tú quien lo solicitó, haz clic en el botón de abajo para crear una nueva contraseña.</p>
            
            <div style="background-color: #fff3e0; border-radius: 8px; padding: 16px; margin: 24px 0; border-left: 4px solid #FF9800;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                    <tr>
                        <td>
                            <p style="margin: 0; font-size: 14px; color: #e65100;">
                                <strong>⏰ Importante:</strong> Este enlace expira en <strong>${expirationMinutes} minutos</strong> por seguridad.
                            </p>
                        </td>
                    </tr>
                </table>
            </div>
            
            ${createButton(resetUrl, '🔑 Restablecer Contraseña', '#E63946')}
            
            <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; margin: 24px 0; border: 1px solid #e9ecef;">
                <p style="margin: 0 0 12px 0; font-size: 14px; color: #495057; font-weight: 600;">
                    🛡️ Consejos de seguridad:
                </p>
                <ul style="margin: 0; padding-left: 20px; color: #6c757d; font-size: 13px; line-height: 1.6;">
                    <li>Usa al menos 8 caracteres</li>
                    <li>Combina letras, números y símbolos</li>
                    <li>No reutilices contraseñas de otras cuentas</li>
                </ul>
            </div>
            
            <div style="background-color: #e3f2fd; border-radius: 8px; padding: 16px; margin: 24px 0; border-left: 4px solid #2196F3;">
                <p style="margin: 0; font-size: 13px; color: #1565c0;">
                    <strong>❓ ¿No solicitaste este cambio?</strong><br>
                    Si no fuiste tú, ignora este correo. Tu contraseña actual permanecerá sin cambios y tu cuenta estará segura.
                </p>
            </div>
            
            <p style="margin: 24px 0 0 0; font-size: 12px; color: #adb5bd; text-align: center; line-height: 1.5;">
                Si el botón no funciona, copia y pega este enlace en tu navegador:<br>
                <a href="${resetUrl}" style="color: #E63946; word-break: break-all;">${resetUrl}</a>
            </p>
            `,
            '#E63946'
        );

        await transporter.sendMail({
            from: '"Seguridad ControlBarber" <no-reply@controlbarber.app>',
            to: email,
            subject: '🔐 Solicitud de Restablecimiento de Contraseña',
            html: html
        });
        
        console.log(`📧 Email de recuperación enviado a ${email}`);

    } catch (error) {
        console.error("Error enviando email de recuperación:", error);
    }
};