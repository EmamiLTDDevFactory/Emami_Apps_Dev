// services/emailService.js

const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
    },
});

const sendEmail = async ({
    to,
    subject,
    html,
}) => {

    if (!to) {
        console.warn("No recipient email provided.");
        return;
    }

    // Nothing to send through until IT provides the SMTP settings in .env.
    if (!process.env.SMTP_HOST) {
        console.warn(`SMTP not configured (SMTP_HOST missing) - email to ${to} skipped: ${subject}`);
        return;
    }

    await transporter.sendMail({
        from: process.env.SMTP_FROM,
        to,
        subject,
        html,
    });

    console.log(`Email sent to ${to}`);
};

module.exports = {
    sendEmail,
};