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
import emamiLogo from '../assets/emami-logo.jpg';
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
} from "../utils/notifications";

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
              component="img"
              src={emamiLogo}
              alt="Emami Logo"
              sx={{
                width: 110,
                height: 90,
                objectFit: "contain",
                background: "#fff",
                borderRadius: 2,
                p: 1,
                boxShadow:
                  "0px 4px 12px rgba(0,0,0,0.15)",
              }}
            />
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