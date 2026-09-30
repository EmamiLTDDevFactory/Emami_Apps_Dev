const { Client } = require("pg");
// const pool = require("../config/db");
const notificationModel =
    require("../models/notificationModel");
const { sendEmail } =
    require("../services/emailService");

const {
    capaSubmittedTemplate,
    capaAcceptedTemplate,
    capaSentBackTemplate,
    capaAssignedTemplate,
} = require("../services/emailTemplates");

// Links in the payload are app-relative ("/capa/12"); emails need a full URL.
// APP_BASE_URL can override; default is the first CLIENT_URL + the app path.
const APP_BASE_URL =
    process.env.APP_BASE_URL ||
    `${(process.env.CLIENT_URL || "").split(",")[0].trim().replace(/\/$/, "")}/apps/audit-capa`;

const toAbsoluteLink = (link) =>
    link && link.startsWith("/") ? `${APP_BASE_URL}${link}` : link;
const client = new Client({
    connectionString: process.env.DATABASE_URL,
});

// Without this, a dropped connection (network blip, DB restart) emits an
// unhandled 'error' on the client, which Node treats as an uncaught
// exception and crashes the whole backend process, not just this listener.
client.on("error", (error) => {
    console.error(
        "Notification listener connection error:",
        error
    );
});

// client.connect();

// client.query("LISTEN notification_channel");
(async () => {
    try {

        await client.connect();

        await client.query(
            "LISTEN notification_channel"
        );

        console.log(
            "Listening on notification_channel"
        );

    } catch (error) {

        console.error(
            "Listener startup failed:",
            error
        );

    }
})();

client.on("notification", async (msg) => {
    try {
        const payload = JSON.parse(msg.payload);

        const notificationId = payload.notification_id;

        const notification =
            await notificationModel.getNotificationWithEmail(
                notificationId
            );
        const eventType =
            payload.event_type;
        if (!notification) {
            console.log(
                `Notification ${notificationId} not found`
            );
            return;
        }

        console.log(
            "Notification received:",
            notification
        );
        // email_payload may come back as parsed JSON or as a JSON string.
        let payloadData =
            notification.email_payload || {};

        if (typeof payloadData === "string") {
            try {
                payloadData = JSON.parse(payloadData);
            } catch (_) {
                payloadData = {};
            }
        }

        payloadData = {
            ...payloadData,
            link: toAbsoluteLink(payloadData.link),
        };

        let email;

        switch (notification.event_type) {

            case "CAPA_SUBMITTED":
                email =
                    capaSubmittedTemplate(payloadData);
                break;

            case "CAPA_ACCEPTED":
                email =
                    capaAcceptedTemplate(payloadData);
                break;

            case "CAPA_SENT_BACK":
                email =
                    capaSentBackTemplate(payloadData);
                break;

            case "CAPA_ASSIGNED":
                email =
                    capaAssignedTemplate(payloadData);
                break;
            default:
                console.log(
                    `No template found for ${notification.event_type}`
                );

        }

        // Some logins are shared test accounts without a real address ("delhi").
        if (email && notification.email && notification.email.includes("@")) {

            await sendEmail({
                to: notification.email,
                subject: email.subject,
                html: email.html,
            });

        }

        //     const result = await pool.query(
        //         `
        //   SELECT
        //       n.*,
        //       u.email
        //   FROM audit_capa.notifications n
        //   JOIN audit_capa.users u
        //       ON u.user_id = n.recipient_user_id
        //   WHERE n.id = $1
        //   `,
        //         [notificationId]
        //     );

        //     const notification = result.rows[0];

        //     console.log(notification);

    } catch (error) {
        console.error("Listener error:", error);
    }
});
