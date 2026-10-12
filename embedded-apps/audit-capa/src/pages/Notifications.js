import {
  useEffect,
  useState,
} from "react";

import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
} from "@mui/material";
import NotificationsIcon from "@mui/icons-material/Notifications";
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
} from "../utils/notifications";

import { getAudits, getCAPAs } from "../utils/storage";
import { getFindingNo } from "../utils/findingUtils";

import { useNavigate } from "react-router-dom";
import CheckCircleIcon
  from "@mui/icons-material/CheckCircle";

import ErrorIcon
  from "@mui/icons-material/Error";

import AssignmentIcon
  from "@mui/icons-material/Assignment";
import AccessAlarmIcon
  from "@mui/icons-material/AccessAlarm";

export default function Notifications() {

  const navigate =
    useNavigate();

  const currentUser = JSON.parse(
    localStorage.getItem("currentUser")
  );

  const [notifications, setNotifications] = useState([]);

  // Audit No / Finding No shown on each CAPA notification. Looked up from the
  // audit and CAPA records, so notifications sent before this existed show it too.
  const [audits, setAudits] = useState([]);
  const [capas, setCapas] = useState([]);

  useEffect(() => {
    getAudits()
      .then((rows) => setAudits(Array.isArray(rows) ? rows : []))
      .catch((error) => console.error("Unable to load audits:", error));

    getCAPAs()
      .then((rows) => setCapas(Array.isArray(rows) ? rows : []))
      .catch((error) => console.error("Unable to load CAPAs:", error));
  }, []);

  const getReferenceNos = (notification) => {
    const auditNo =
      audits.find((audit) => String(audit.id) === String(notification.auditId))
        ?.auditNo || "";

    // The CAPA: by its id when the notification stores one, otherwise by the
    // CAPA No. in the message (e.g. "CAPA CAPA/F02/10/26/0002 has been ...").
    const capaNo =
      /CAPA\/F\d+\/[\w/]+/.exec(notification.message || "")?.[0] || "";

    const capa =
      capas.find((c) => notification.capaId && String(c.id) === String(notification.capaId)) ||
      capas.find(
        (c) =>
          capaNo &&
          c.capaNo === capaNo &&
          String(c.auditId) === String(notification.auditId)
      );

    const findingNo = capaNo || capa
      ? getFindingNo(capa || { capaNo }, auditNo)
      : "";

    return { auditNo, findingNo };
  };

  useEffect(() => {
    // Opening this page is the "read" moment — mark everything read first so
    // the list below reflects that, then load it.
    markAllAsRead(currentUser?.role, currentUser?.id)
      .catch((error) => console.error("Unable to mark notifications as read:", error))
      .finally(() => {
        getNotifications(currentUser?.role, currentUser?.id)
          .then(setNotifications)
          .catch((error) => console.error("Unable to load notifications:", error));
      });
  }, [currentUser?.role, currentUser?.id]);

  // const notifications =
  //   getNotifications();

  const getNotificationIcon = (
    title
  ) => {

    if (
      title.includes(
        "Reminder"
      )
    ) {
      return (
        <AccessAlarmIcon
          color="warning"
        />
      );
    }

    if (
      title.includes(
        "Accepted"
      )
    ) {
      return (
        <CheckCircleIcon
          color="success"
        />
      );
    }

    if (
      title.includes(
        "Sent Back"
      )
    ) {
      return (
        <ErrorIcon
          color="error"
        />
      );
    }

    return (
      <AssignmentIcon
        color="primary"
      />
    );
  };



  return (
    <Box>

      <Card
        sx={{
          mb: 3,
          background: "linear-gradient(135deg,#3730A3,#7C3AED)",
          color: "white",
          borderRadius: 2,
        }}
      >
        <CardContent>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 3,
            }}
          >
            <Box
              sx={{
                width: 110,
                height: 90,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "#fff",
                borderRadius: 2,
                p: 1,
                boxShadow:
                  "0px 4px 12px rgba(0,0,0,0.15)",
              }}
            >
              <NotificationsIcon sx={{ fontSize: 44, color: "#7C3AED" }} />
            </Box>
            <Box>

              <Typography
                variant="h4"
              // sx={{}}
              >
                Notifications
              </Typography>
              <Typography
                variant="body1"
                sx={{
                  mt: 1,
                  opacity: 0.95,
                }}
              >
                Manage and track audits, CAPA findings, and
                compliance performance
              </Typography>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* {notifications.map( */}
      {(Array.isArray(notifications)
        ? notifications
        : []
      ).map(
        (notification) => (

          <Card
            key={
              notification.id
            }
            sx={{
              mb: 2,
              borderLeft:
                notification.read
                  ? "4px solid #CBD5E1"
                  : "4px solid #7C3AED",
            }}
          >
            <CardContent>

              {/* <Typography
                variant="h6"
                fontWeight={700}
                color="text.secondary"
              >
                {
                  notification.title
                }
              </Typography> */}
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  mb: 1,
                }}
              >
                {getNotificationIcon(
                  notification.title
                )}

                <Typography
                  variant="h6"
                  fontWeight={700}
                >
                  {notification.title}
                </Typography>
              </Box>

              {(() => {
                const { auditNo, findingNo } = getReferenceNos(notification);

                return (auditNo || findingNo) && (
                  <Typography
                    variant="body2"
                    fontWeight={600}
                    sx={{ mb: 0.5, color: "#4338CA" }}
                  >
                    {auditNo && `Audit No: ${auditNo}`}
                    {auditNo && findingNo && "  ·  "}
                    {findingNo && `Finding No: ${findingNo}`}
                  </Typography>
                );
              })()}

              <Typography color="text.secondary">
                {
                  notification.message
                }
              </Typography>

              <Typography
                variant="caption"
              >
                {
                  notification.createdOn
                }
              </Typography>

              <Box
                sx={{
                  mt: 2,
                }}
              >
                <Button
                  variant="contained"
                  onClick={() => {

                    markAsRead(notification.id)
                      .then((updated) => {
                        setNotifications((previous) =>
                          previous.map((item) =>
                            item.id === updated.id ? updated : item
                          )
                        );
                      })
                      .catch((error) => console.error(error));

                    navigate(
                      notification.link
                    );
                  }}
                >
                  Open
                </Button>
              </Box>

            </CardContent>
          </Card>
        )
      )}

    </Box>
  );
}