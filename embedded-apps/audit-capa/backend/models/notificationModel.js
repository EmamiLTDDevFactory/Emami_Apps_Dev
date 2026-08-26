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

const createNotification =
  async (notification) => {

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
    email_payload
)
VALUES
(
    $1,$2,$3,$4,$5,$6,$7,$8,$9
)
RETURNING *
        `,
        [
          notification.role,
          notification.userId,
          notification.recipientUserId,
          notification.auditId,
          notification.title,
          notification.message,
          notification.link,
          notification.eventType,
          notification.emailPayload
          // JSON.stringify(notification.emailPayload)
        ]
      );

    return result.rows[0];
  };

const getAllNotifications =
  async (role) => {

    const result =
      await pool.query(
        `
        SELECT *
        FROM audit_capa.notifications
        WHERE role = $1
        ORDER BY created_at DESC
        `,
        [role]
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

const getNotificationWithEmail =
  async (notificationId) => {

    const result = await pool.query(
      `
      SELECT
          n.*,
          u.email
      FROM audit_capa.notifications n
      JOIN audit_capa.users u
          ON u.user_id = n.recipient_user_id
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
  getNotificationWithEmail
};