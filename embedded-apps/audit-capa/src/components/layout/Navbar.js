import {
    AppBar,
    Toolbar,
    Typography,
    IconButton,
    Badge,
} from "@mui/material";
// import { Box } from "@mui/system";
import { useNavigate } from "react-router-dom";

import NotificationsIcon
    from "@mui/icons-material/Notifications";
import {
    getNotifications,
    markAllAsRead,
} from "../../utils/notifications";

import { useState, useEffect } from "react";

export default function Navbar() {

    const navigate = useNavigate();
    const currentUser =
        JSON.parse(
            localStorage.getItem(
                "currentUser"
            )
        );
    const [unreadCount, setUnreadCount] =
        useState(0);

    useEffect(() => {

        const updateCount = async () => {
            try {
                const notifications = await getNotifications(currentUser?.role, currentUser?.id);
                const count = notifications.filter((n) => !n.read).length;
                setUnreadCount(count);
            } catch (error) {
                console.error("Unable to load notification count:", error);
            }
        };

        updateCount();

        const interval = setInterval(updateCount, 30000);

        return () => {
            clearInterval(interval);
        };

    }, []);

    // const initials =
    //     currentUser?.name
    //         ?.split(" ")
    //         .map((n) => n[0])
    //         .join("")
    //         .toUpperCase() || "U";

    // const currentUser = JSON.parse(
    //   localStorage.getItem("currentUser")
    // );

    // const getInitials = (name) => {
    //   if (!name) return "U";

    //   // Handle email IDs
    //   if (name.includes("@")) {
    //     const userPart = name.split("@")[0];

    //     return userPart
    //       .split(".")
    //       .map((part) => part[0])
    //       .join("")
    //       .toUpperCase();
    //   }

    //   // Handle normal names
    //   return name
    //     .split(" ")
    //     .map((part) => part[0])
    //     .join("")
    //     .toUpperCase();
    // };

    // const initials = getInitials(
    //   currentUser?.name || currentUser?.userId
    // );

    return (
        <AppBar
            position="static"
            elevation={1}
            sx={{
                background: "#FFFFFF",
                color: "#353535",

            }}
        >

            <Toolbar>
                <Typography
                    variant="h5"
                    sx={{
                        flexGrow: 1,
                        fontWeight: 600,
                    }}
                >
                    QUALITY MANAGEMENT SYSTEM
                </Typography>

                <IconButton
                    color="inherit"
                    onClick={() => {
                        setUnreadCount(0);

                        markAllAsRead(currentUser?.role, currentUser?.id).catch(
                            (error) => console.error("Unable to mark notifications as read:", error)
                        );

                        navigate("/notifications");
                    }}
                >
                    {/* <Badge
                        // badgeContent={
                        //     getNotifications()
                        //         .filter(
                        //             n => !n.read
                        //         ).length
                        // }
                        badgeContent={
                            JSON.parse(
                                localStorage.getItem(
                                    "notifications"
                                ) || "[]"
                            ).filter(
                                (n) => !n.read
                            ).length
                        }
                        color="error"
                    >
                        <NotificationsIcon />
                    </Badge> */}
                    <Badge
                        badgeContent={unreadCount}
                        color="error"
                        invisible={unreadCount === 0}
                    >
                        <NotificationsIcon />
                    </Badge>
                </IconButton>

                {/* <Box
                    sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 2,
                    }}
                >
                    <Typography>
                        {currentUser?.name}
                    </Typography>

                    <Avatar>
                        {initials}
                    </Avatar>
                </Box>
                <Button
                    color="inherit"
                    onClick={() => {

                        localStorage.removeItem(
                            "currentUser"
                        );

                        navigate("/login");
                    }}
                >
                    Logout
                </Button> */}



                {/* <Avatar>
          {initials}
        </Avatar> */}
            </Toolbar>
        </AppBar>
    );
}