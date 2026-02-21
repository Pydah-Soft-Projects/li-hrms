const nodemailer = require('nodemailer');
require('dotenv').config();

const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
const GMAIL_SENDER_NAME = process.env.GMAIL_SENDER_NAME || 'HRMS Support';

if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    console.warn(
        '[NodeMailerEmail] Missing GMAIL_USER or GMAIL_APP_PASSWORD. Email sending via Gmail will fail until these environment variables are set.'
    );
}

// Create reusable transporter
let transporter = null;

const getTransporter = () => {
    if (transporter) {
        return transporter;
    }

    if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
        throw new Error('Gmail credentials are not configured');
    }

    transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: GMAIL_USER,
            pass: GMAIL_APP_PASSWORD,
        },
    });

    return transporter;
};

const sendEmailViaNodeMailer = async ({
    to,
    subject,
    htmlContent,
    textContent,
    replyTo,
    from,
    fromName,
}) => {
    if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
        throw new Error('Gmail credentials are not configured');
    }

    if (!to || (!Array.isArray(to) && !to.trim())) {
        throw new Error('Recipient email is required');
    }

    if (!subject || !subject.trim()) {
        throw new Error('Email subject is required');
    }

    if (!htmlContent && !textContent) {
        throw new Error('Email content (HTML or text) is required');
    }

    // Normalize recipients to array
    const recipients = Array.isArray(to) ? to : [to];

    const mailOptions = {
        from: from
            ? `${fromName || GMAIL_SENDER_NAME} <${from}>`
            : `${GMAIL_SENDER_NAME} <${GMAIL_USER}>`,
        to: recipients.join(', '),
        subject: subject.trim(),
        html: htmlContent || textContent,
        ...(textContent && { text: textContent }),
        ...(replyTo && {
            replyTo: replyTo.email
                ? `${replyTo.name || GMAIL_SENDER_NAME} <${replyTo.email}>`
                : replyTo.email || GMAIL_USER,
        }),
    };

    try {
        const transport = getTransporter();
        console.log(`[NodeMailerEmail] Sending email to ${recipients.join(', ')}...`);
        const info = await transport.sendMail(mailOptions);

        console.log(`[NodeMailerEmail] Response: ${info.response}`);
        return {
            success: true,
            messageId: info.messageId,
            response: {
                accepted: info.accepted,
                rejected: info.rejected,
                response: info.response,
            },
        };
    } catch (error) {
        console.error('[NodeMailerEmail] Error sending email:', error.message);
        throw new Error(error.message || 'Failed to send email via NodeMailer');
    }
};

const verifyGmailConnection = async () => {
    try {
        if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
            return false;
        }

        const transport = getTransporter();
        await transport.verify();
        return true;
    } catch (error) {
        console.error('[NodeMailerEmail] Connection verification failed:', error.message);
        return false;
    }
};

module.exports = {
    sendEmailViaNodeMailer,
    verifyGmailConnection,
};
