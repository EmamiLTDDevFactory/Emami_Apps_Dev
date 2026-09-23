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
} = require("../services/emailTemplates");
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
        const payloadData =
            notification.email_payload;

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
            default:
                console.log(
                    `No template found for ${notification.event_type}`
                );

        }

        if (email && notification.email) {

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
