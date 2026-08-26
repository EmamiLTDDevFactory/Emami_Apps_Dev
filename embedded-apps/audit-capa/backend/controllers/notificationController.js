// // const notificationModel = require("../models/notificationModel");

// // const getNotifications = (req, res) => {
// //   try {
// //     res.json(notificationModel.getAllNotifications(req.query.role));
// //   } catch (error) {
// //     console.error(error);
// //     res.status(500).json({ message: "Error fetching notifications" });
// //   }
// // };

// // const createNotification = (req, res) => {
// //   try {
// //     const notification = notificationModel.createNotification(req.body || {});
// //     res.status(201).json(notification);
// //   } catch (error) {
// //     console.error(error);
// //     res.status(500).json({ message: "Error creating notification" });
// //   }
// // };

// // const markNotificationAsRead = (req, res) => {
// //   try {
// //     const notification = notificationModel.markAsRead(req.params.id);

// //     if (!notification) {
// //       return res.status(404).json({ message: "Notification not found" });
// //     }

// //     res.json(notification);
// //   } catch (error) {
// //     console.error(error);
// //     res.status(500).json({ message: "Error updating notification" });
// //   }
// // };

// // module.exports = {
// //   getNotifications,
// //   createNotification,
// //   markNotificationAsRead,
// // };

// const notificationModel =
//   require("../models/notificationModel");

// const getNotifications = async (req, res) => {

//   try {

//     const notifications =
//       await notificationModel.getAllNotifications(
//         req.query.role
//       );

//     res.json(notifications);

//   } catch (error) {

//     console.error(error);

//     res.status(500).json({
//       message: "Error fetching notifications"
//     });
//   }
// };

// // const createNotification = async (req, res) => {

// //   try {

// //     const notification =
// //       await notificationModel.createNotification(
// //         req.body || {}
// //       );

// //     res.status(201).json(notification);

// //   } catch (error) {

// //     console.error(error);

// //     res.status(500).json({
// //       message: "Error creating notification"
// //     });
// //   }
// // };

// // const notificationModel =
// //   require("../models/notificationModel");

// // const {
// //   sendEmail
// // } = require("../services/emailService");

// // const {
// //   capaSubmittedTemplate,
// //   capaAcceptedTemplate,
// //   capaSentBackTemplate,
// // } = require("../services/emailTemplates");


// // const createNotification = async (req, res) => {

// //   try {

// //     const data = req.body || {};

// //     // 1. Create in-app notification
// //     const notification =
// //       await notificationModel.createNotification(data);


// //     // 2. Send email
// //     try {

// //       if (data.email) {

// //         let email;

// //         switch (data.eventType) {

// //           case "CAPA_SUBMITTED":

// //             email =
// //               capaSubmittedTemplate(data);

// //             break;


// //           case "CAPA_ACCEPTED":

// //             email =
// //               capaAcceptedTemplate(data);

// //             break;


// //           case "CAPA_SENT_BACK":

// //             email =
// //               capaSentBackTemplate(data);

// //             break;


// //           default:

// //             console.log(
// //               "No email template for:",
// //               data.eventType
// //             );

// //         }


// //         if (email) {

// //           await sendEmail({
// //             to: data.email,
// //             subject: email.subject,
// //             html: email.html,
// //           });

// //         }

// //       }

// //     } catch (emailError) {

// //       // Important:
// //       // Don't fail the notification if email fails.

// //       console.error(
// //         "Email sending failed:",
// //         emailError
// //       );

// //     }


// // 3. Return notification
// //     res.status(201).json(notification);

// //   } catch (error) {

// //     console.error(error);

// //     res.status(500).json({
// //       message: "Error creating notification"
// //     });
// //   }
// // };


// const createNotification = async (req, res) => {
//   try {

//     const notification =
//       await notificationModel.createNotification(
//         req.body
//       );

//     res.status(201).json(notification);

//   } catch (error) {

//     console.error(error);

//     res.status(500).json({
//       message: "Error creating notification"
//     });

//   }
// };


// const markNotificationAsRead = async (req, res) => {

//   try {

//     const notification =
//       await notificationModel.markAsRead(
//         req.params.id
//       );

//     if (!notification) {
//       return res.status(404).json({
//         message: "Notification not found"
//       });
//     }

//     res.json(notification);

//   } catch (error) {

//     console.error(error);

//     res.status(500).json({
//       message: "Error updating notification"
//     });
//   }
// };

// module.exports = {
//   getNotifications,
//   createNotification,
//   markNotificationAsRead,
// };


const notificationModel =
  require("../models/notificationModel");

const getNotifications = async (req, res) => {
  try {

    const notifications =
      await notificationModel.getAllNotifications(
        req.query.role
      );

    res.json(notifications);

  } catch (error) {

    console.error(error);

    res.status(500).json({
      message: "Error fetching notifications"
    });

  }
};

const createNotification = async (req, res) => {
  try {

    const notification =
      await notificationModel.createNotification(
        req.body
      );

    res.status(201).json(notification);

  } catch (error) {

    console.error(error);

    res.status(500).json({
      message: "Error creating notification"
    });

  }
};

const markNotificationAsRead = async (req, res) => {
  try {

    const notification =
      await notificationModel.markAsRead(
        req.params.id
      );

    if (!notification) {
      return res.status(404).json({
        message: "Notification not found"
      });
    }

    res.json(notification);

  } catch (error) {

    console.error(error);

    res.status(500).json({
      message: "Error updating notification"
    });

  }
};

module.exports = {
  getNotifications,
  createNotification,
  markNotificationAsRead,
};
