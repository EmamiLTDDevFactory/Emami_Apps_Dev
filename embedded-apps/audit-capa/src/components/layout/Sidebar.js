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

import emamiAppsLogo from "../../assets/emami-apps-logo.png";
import { EMAMI_APPS_URL } from "./emamiAppsUrl";
import { EMAMI_APPS_URL } from "./emamiAppsUrl";
import { isDepotSideUser } from "../../utils/roles";

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
        isDepotSideUser(currentUser)
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
                position: "relative",
                display: "flex",
                flexDirection: "column",
                flexShrink: 0,
                width: collapsed ? 80 : 240,
                height: "100vh",
                bgcolor: "#fff",
                color: "#1E293B",
                boxShadow: 1,
                borderRight: "1px solid #E5E7EB",
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
                        color: "#1E293B",
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

            <Box
                sx={{
                    display: "flex",
                    justifyContent: "center",
                    py: collapsed ? 1.5 : 2,
                }}
            >
                <Box
                    component="img"
                    src={emamiAppsLogo}
                    alt="Emami Apps"
                    title="Back to Emami Apps"
                    role="link"
                    tabIndex={0}
                    onClick={() => { window.location.href = EMAMI_APPS_URL; }}
                    onKeyDown={(e) => { if (e.key === "Enter") window.location.href = EMAMI_APPS_URL; }}
                    sx={{
                        width: collapsed ? 40 : 110,
                        height: collapsed ? 40 : 110,
                        objectFit: "contain",
                        cursor: "pointer",
                        transition: "all 0.3s ease",
                    }}
                />
            </Box>

            <Typography
                variant="caption"
                sx={{
                    display: "block",
                    textAlign: "center",
                    mb: 2,
                    color: "#64748B",
                }}
            >
                {collapsed
                    ? ""
                    : "AQMS"}

            </Typography>

            {/* Menu */}

            <List
                sx={{
                    flex: 1,
                    minHeight: 0,
                    overflowY: "auto",
                    overflowX: "hidden",
                }}
            >
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
                                color: "#1E293B",
                                mx: 1,
                                mb: 1,
                                borderRadius: 2,

                                justifyContent:
                                    collapsed
                                        ? "center"
                                        : "flex-start",

                                "&.Mui-selected": {
                                    backgroundColor: "#7C3AED",
                                    color: "#fff",

                                    boxShadow:
                                        "0 4px 12px rgba(124,58,237,0.35)",

                                    "&:hover": {
                                        backgroundColor: "#7C3AED",
                                    },
                                },

                                "&:hover": {
                                    backgroundColor: "#F3F0FF",

                                    transform:
                                        "translateX(4px)",

                                    transition:
                                        "all 0.25s ease",
                                },
                            }}
                        >
                            <ListItemIcon
                                sx={{
                                    color: "inherit",
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
                                    primaryTypographyProps={{
                                        noWrap: true,
                                    }}
                                />
                            )}
                        </ListItemButton>
                    </Tooltip>
                ))}
            </List>

            <Box
                sx={{
                    flexShrink: 0,
                    width: "100%",
                    px: collapsed ? 1 : 2,
                    pt: 1,
                    pb: 2.5,
                    borderTop: "1px solid #E5E7EB",
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
                        justifyContent: collapsed
                            ? "center"
                            : "flex-start",
                        gap: 1.5,
                        mb: 2,
                        minWidth: 0,
                    }}
                >
                    <Avatar sx={{ flexShrink: 0 }}>
                        {initials}
                    </Avatar>

                    {!collapsed && (
                        <Box sx={{ minWidth: 0 }}>
                            <Typography
                                variant="body2"
                                fontWeight={600}
                                noWrap
                                title={currentUser?.userId || ""}
                                sx={{ color: "#1E293B" }}
                            >
                                {(currentUser?.userId || "")
                                    .split("@")[0]}
                            </Typography>
                            <Typography
                                variant="caption"
                                noWrap
                                sx={{
                                    display: "block",
                                    color: "#64748B",
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

                        window.location.href = EMAMI_APPS_URL;
                    }}
                    sx={{
                        color: "#1E293B",
                        borderRadius: 1,
                        justifyContent: collapsed
                            ? "center"
                            : "flex-start",

                        "&:hover": {
                            backgroundColor: "#F3F0FF",
                        },
                    }}
                >
                    <ListItemIcon
                        sx={{
                            color: "inherit",
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