// const { readDatabase, writeDatabase } = require("../db");

// const getAllNotifications = (role) => {
//   const notifications = readDatabase().notifications;

//   if (!role) {
//     return notifications;
//   }

//   return notifications.filter(
//     (notification) => notification.role === role
//   );
// };

// const createNotification = (notification) => {
//   const database = readDatabase();
//   const newNotification = {
//     id: notification.id ?? Date.now(),
//     createdOn:
//       notification.createdOn ?? new Date().toLocaleString(),
//     read: notification.read ?? false,
//     ...notification,
//   };

//   database.notifications.unshift(newNotification);
//   writeDatabase(database);

//   return newNotification;
// };

// const markAsRead = (id) => {
//   const database = readDatabase();
//   const index = database.notifications.findIndex(
//     (notification) => String(notification.id) === String(id)
//   );

//   if (index === -1) {
//     return null;
//   }

//   database.notifications[index] = {
//     ...database.notifications[index],
//     read: true,
//   };

//   writeDatabase(database);
//   return database.notifications[index];
// };

// module.exports = {
//   getAllNotifications,
//   createNotification,
//   markAsRead,
// };



const pool = require("../config/db");

// Depot notifications go to EVERY active Depot user of the audit's depot (one
// row each, so each sees it in their feed and gets the email) — a depot can have
// several Depot logins. CQA notifications stay a shared, role-wide feed; for the
// ones that send an email, the audit's auditor is set as the recipient.
const resolveDepotRecipients = async (auditId) => {

  if (!auditId) {
    return [];
  }

  const result = await pool.query(
    `
    SELECT u.id
    FROM audit_capa.audits a
    JOIN audit_capa.users u
        ON u.depot = a.depot
        AND u.role = 'Depot'
        AND u.is_active = TRUE
    WHERE a.id = $1
    ORDER BY u.id
    `,
    [auditId]
  );

  return result.rows.map((row) => row.id);
};

const resolveAuditorRecipient = async (auditId) => {

  if (!auditId) {
    return null;
  }

  const result = await pool.query(
    `
    SELECT u.id
    FROM audit_capa.audits a
    JOIN audit_capa.users u
        ON u.name = a.auditor
        AND u.role = 'CQA'
        AND u.is_active = TRUE
    WHERE a.id = $1
    ORDER BY u.id
    LIMIT 1
    `,
    [auditId]
  );

  return result.rows[0]?.id ?? null;
};

const insertNotification = async (notification, recipientUserId) => {

  const result =
    await pool.query(
      `
        INSERT INTO audit_capa.notifications
(
    role,
    user_id,
    recipient_user_id,
    audit_id,
    title,
    message,
    link,
    event_type,
    email_payload,
    type,
    capa_id
)
VALUES
(
    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11
)
RETURNING *
        `,
      [
        notification.role,
        notification.userId,
        recipientUserId !== null && recipientUserId !== undefined
          ? String(recipientUserId)
          : null,
        notification.auditId,
        notification.title,
        notification.message,
        notification.link,
        notification.eventType ?? null,
        notification.emailPayload ?? null,
        notification.type ?? null,
        notification.capaId ?? null,
      ]
    );

  return result.rows[0];
};

const createNotification =
  async (notification) => {

    let recipients =
      notification.recipientUserId !== null &&
        notification.recipientUserId !== undefined
        ? [notification.recipientUserId]
        : [];

    if (recipients.length === 0 && notification.role === "Depot") {
      recipients = await resolveDepotRecipients(notification.auditId);
    }

    if (
      recipients.length === 0 &&
      notification.role === "CQA" &&
      notification.eventType
    ) {
      const auditor = await resolveAuditorRecipient(notification.auditId);
      if (auditor !== null) recipients = [auditor];
    }

    if (recipients.length === 0) {
      recipients = [null];
    }

    const created = [];

    for (const recipient of recipients) {
      created.push(await insertNotification(notification, recipient));
    }

    return created[0];
  };

const getAllNotifications =
  async (role, recipientUserId) => {

    // Depot's feed is per-user; CQA stays a shared, role-wide feed.
    const scopeToRecipient = role === "Depot" && recipientUserId;

    const result =
      await pool.query(
        scopeToRecipient
          ? `
            SELECT *
            FROM audit_capa.notifications
            WHERE role = $1 AND recipient_user_id = $2
            ORDER BY created_at DESC
            `
          : `
            SELECT *
            FROM audit_capa.notifications
            WHERE role = $1
            ORDER BY created_at DESC
            `,
        scopeToRecipient ? [role, String(recipientUserId)] : [role]
      );

    // return result.rows;
    return result.rows.map((row) => ({
      id: row.id,
      role: row.role,
      auditId: row.audit_id,
      title: row.title,
      message: row.message,
      link: row.link,
      read: row.is_read,
      createdOn: row.created_at,
      type: row.type,
      capaId: row.capa_id,
    }));
  };

const markAsRead =
  async (id) => {

    const result =
      await pool.query(
        `
        UPDATE audit_capa.notifications
        SET
            is_read = TRUE,
            read_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *
        `,
        [id]
      );

    return result.rows[0];
  };

const markAllAsRead =
  async (role, recipientUserId) => {

    const scopeToRecipient = role === "Depot" && recipientUserId;

    const result =
      await pool.query(
        scopeToRecipient
          ? `
            UPDATE audit_capa.notifications
            SET
                is_read = TRUE,
                read_at = CURRENT_TIMESTAMP
            WHERE role = $1 AND recipient_user_id = $2 AND is_read = FALSE
            RETURNING id
            `
          : `
            UPDATE audit_capa.notifications
            SET
                is_read = TRUE,
                read_at = CURRENT_TIMESTAMP
            WHERE role = $1 AND is_read = FALSE
            RETURNING id
            `,
        scopeToRecipient ? [role, String(recipientUserId)] : [role]
      );

    return result.rowCount;
  };

const getNotificationWithEmail =
  async (notificationId) => {

    const result = await pool.query(
      `
      SELECT
          n.*,
          u.email
      FROM audit_capa.notifications n
      -- recipient_user_id holds users.id (users.user_id no longer exists; it
      -- was renamed to email), so the old join failed for every notification.
      JOIN audit_capa.users u
          ON u.id::text = n.recipient_user_id
      WHERE n.id = $1
      `,
      [notificationId]
    );

    return result.rows[0];
  };


module.exports = {
  getAllNotifications,
  createNotification,
  markAsRead,
  markAllAsRead,
  getNotificationWithEmail
};