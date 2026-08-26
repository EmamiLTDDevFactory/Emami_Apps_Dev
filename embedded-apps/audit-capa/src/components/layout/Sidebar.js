import { useState } from "react";
import {
    Box,
    List,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    Typography,
    IconButton,
    Tooltip,
    Button,
} from "@mui/material";

import DashboardIcon from "@mui/icons-material/Dashboard";
import AssignmentIcon from "@mui/icons-material/Assignment";
import AddCircleIcon from "@mui/icons-material/AddCircle";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import AssessmentIcon from "@mui/icons-material/Assessment";
import MenuIcon from "@mui/icons-material/Menu";
import NotificationsIcon
    from "@mui/icons-material/Notifications";
import { Link, useLocation } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import {
    Avatar,
    Divider,
} from "@mui/material";

import LogoutIcon from "@mui/icons-material/Logout";

export default function Sidebar() {
    const location = useLocation();
    const navigate = useNavigate();

    const [collapsed, setCollapsed] =
        useState(false);
    const currentUser =
        JSON.parse(
            localStorage.getItem(
                "currentUser"
            )
        );

    const getInitials = (name) => {
        if (!name) return "U";

        if (name.includes("@")) {
            const userPart =
                name.split("@")[0];

            return userPart
                .split(".")
                .map((part) => part[0])
                .join("")
                .toUpperCase();
        }

        return name
            .split(" ")
            .map((part) => part[0])
            .join("")
            .toUpperCase();
    };

    const initials =
        getInitials(
            currentUser?.name ||
            currentUser?.userId
        );

    const cqaMenus = [
        {
            text: "Dashboard",
            icon: <DashboardIcon />,
            path: "/",
        },
        // {
        //     text: "Create Audit",
        //     icon: <AddCircleIcon />,
        //     path: "/create-audit",
        // },
        {
            text: "Audit Management",
            icon: <AssignmentIcon />,
            path: "/audits",
        },
        // {
        //     text: "CAPA Management",
        //     icon: <WarningAmberIcon />,
        //     path: "/capa",
        // },
        {
            text: "Reports",
            icon: <AssessmentIcon />,
            path: "/reports",
        },
        {
            text: "Notifications",
            icon: <NotificationsIcon />,
            path: "/notifications",
        },
    ];

    const depotMenus = [
        {
            text: "My Audits",
            icon: <AssignmentIcon />,
            path: "/audits",
        },
        // {
        //     text: "CAPA",
        //     icon: <WarningAmberIcon />,
        //     path: "/capa",
        // },
        {
            text: "Notifications",
            icon: <NotificationsIcon />,
            path: "/notifications",
        },
    ];

    const menuItems =
        currentUser?.role ===
            "Depot"
            ? depotMenus
            : cqaMenus;


    // const menuItems = [
    //     {
    //         text: "Dashboard",
    //         icon: <DashboardIcon />,
    //         path: "/",
    //     },
    //     {
    //         text: "Audits",
    //         icon: <AssignmentIcon />,
    //         path: "/audits",
    //     },
    //     {
    //         text: "Create Audit",
    //         icon: <AddCircleIcon />,
    //         path: "/audits/create",
    //     },
    //     {
    //         text: "CAPA",
    //         icon: <WarningAmberIcon />,
    //         path: "/capa/1",
    //     },
    //     {
    //         text: "Reports",
    //         icon: <AssessmentIcon />,
    //         path: "/reports",
    //     },
    // ];

    return (
        <Box
            sx={{
                width: collapsed ? 80 : 240,
                height: "100vh",
                // bgcolor: "#1565c0",
                bgcolor: "#0F172A",
                color: "white",
                boxShadow: 4,
                borderRight: "1px solid rgba(255,255,255,0.08)",
                transition: "all 0.3s ease",
                overflow: "hidden",
            }}
        >
            {/* Toggle */}

            <Box
                sx={{
                    display: "flex",
                    justifyContent: collapsed
                        ? "center"
                        : "flex-end",
                    p: 1,
                }}
            >
                <IconButton
                    onClick={() => {
                        setCollapsed(!collapsed);

                        setTimeout(() => {
                            window.dispatchEvent(
                                new Event("resize")
                            );
                        }, 350);
                    }}
                    sx={{
                        color: "white",
                    }}
                >
                    <MenuIcon />
                </IconButton>
            </Box>

            {/* Logo */}

            {/* <Typography
                variant="h5"
                sx={{
                    fontWeight: 700,
                    textAlign: "center",
                    mb: 3,
                    px: 1,
                    transition: "all 0.3s ease",
                    fontSize: collapsed
                        ? "1.2rem"
                        : "1.8rem",
                }}
            >
                {collapsed
                    ? "A&C"
                    : "Audit & CAPA Digitisation"}
            </Typography> */}

            <Typography
                variant="h5"
                sx={{
                    p: 3,
                    fontWeight: 700,
                    textAlign: "center",
                    letterSpacing: 1,
                }}
            >
                {collapsed
                    ? "A&C"
                    : "AUDIT & CAPA"}

            </Typography>

            <Typography
                variant="caption"
                sx={{
                    display: "block",
                    textAlign: "center",
                    mb: 2,
                    color:
                        "rgba(255,255,255,0.7)",
                }}
            >
                {collapsed
                    ? ""
                    : "AQMS"}

            </Typography>

            {/* Menu */}

            <List>
                {menuItems.map((item) => (
                    <Tooltip
                        key={item.text}
                        title={
                            collapsed
                                ? item.text
                                : ""
                        }
                        placement="right"
                    >
                        <ListItemButton
                            component={Link}
                            to={item.path}
                            selected={
                                location.pathname ===
                                item.path
                            }
                            sx={{
                                color: "white",
                                mx: 1,
                                mb: 1,
                                borderRadius: 2,

                                justifyContent:
                                    collapsed
                                        ? "center"
                                        : "flex-start",

                                // "&.Mui-selected":
                                // {
                                //     backgroundColor:
                                //         "rgba(255,255,255,0.2)",
                                // },
                                "&.Mui-selected": {
                                    backgroundColor:
                                        "#3e57a9",

                                    boxShadow:
                                        "0 4px 12px rgba(0,0,0,0.2)",
                                },

                                "&:hover": {
                                    backgroundColor:
                                        "rgba(59,130,246,0.15)",

                                    transform:
                                        "translateX(4px)",

                                    transition:
                                        "all 0.25s ease",
                                },

                                // "&:hover": {
                                //   backgroundColor:
                                //     "rgba(255,255,255,0.1)",
                                // },
                            }}
                        >
                            <ListItemIcon
                                sx={{
                                    color: "white",
                                    minWidth:
                                        collapsed
                                            ? 0
                                            : 40,
                                }}
                            >
                                {item.icon}
                            </ListItemIcon>

                            {!collapsed && (
                                <ListItemText
                                    primary={
                                        item.text
                                    }
                                />
                            )}
                        </ListItemButton>
                    </Tooltip>
                ))}
            </List>

            <Box
                sx={{
                    position: "absolute",
                    bottom: 20,
                    left: 0,
                    width: "100%",
                    px: 2,
                }}
            >
                {/* <Divider
                    sx={{
                        bgcolor:
                            "rgba(255,255,255,0.15)",
                        mb: 2,
                    }}
                /> */}
                {/* <Box
  sx={{
    bgcolor: "rgba(255,255,255,0.08)",
    borderRadius: 2,
    p: 2,
  }}
></Box> */}

                <Box
                    sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1.5,
                        mb: 2,
                    }}
                >
                    <Avatar>
                        {initials}
                    </Avatar>

                    {!collapsed && (
                        <Box>
                            <Typography
                                variant="body2"
                                fontWeight={600}
                            >
                                {(currentUser?.userId || "")
                                    .split("@")[0]}
                            </Typography>
                            {/* <Typography
                                variant="caption"
                                sx={{
                                    color:
                                        "rgba(255,255,255,0.7)",
                                }}
                            >
                                Auditor
                            </Typography> */}
                            <Typography
                                variant="caption"
                                sx={{
                                    color:
                                        "rgba(255,255,255,0.7)",
                                }}
                            >
                                {currentUser?.role}
                            </Typography>

                        </Box>
                    )}
                </Box>

                <ListItemButton
                    onClick={() => {
                        // No local logout to speak of any more — Audit & CAPA's own session is
                        // just a reflection of the still-live Emami Apps hub session (see
                        // Layout.js). Clearing it here only forces a fresh sign-in exchange next
                        // time; actually signing out means leaving the hub itself.
                        localStorage.removeItem(
                            "currentUser"
                        );
                        localStorage.removeItem(
                            "authToken"
                        );

                        window.location.href = "/";
                    }}
                    sx={{
                        color: "white",
                        borderRadius: 1,

                        "&:hover": {
                            backgroundColor:
                                "rgba(255,255,255,0.1)",

                        },
                    }}
                >
                    <ListItemIcon
                        sx={{
                            color: "white",
                            minWidth:
                                collapsed ? 0 : 40,
                        }}
                    >
                        <LogoutIcon />
                    </ListItemIcon>

                    {!collapsed && (
                        <ListItemText
                            primary="Logout"
                        />
                    )}
                </ListItemButton>
            </Box>


            {/* <Button
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
        </Box>
    );
}