import { Outlet } from "react-router-dom";
import { Box, CircularProgress, Typography, Button } from "@mui/material";
import { useEffect, useState } from "react";

import Sidebar from "./Sidebar";
import Navbar from "./Navbar";
import { apiPost } from "../../api/client";
import { EMAMI_APPS_URL, IS_LOCAL_HOST } from "./emamiAppsUrl";

// AsyncStorage's web backend writes straight to localStorage under this exact key, unprefixed —
// see the hub's src/context/AuthContext.tsx. Audit & CAPA runs same-origin under /apps/audit-capa
// on the hub's own domain, so it can read that same key directly.
const HUB_SESSION_TOKEN_KEY = "emami_apps_session_token";

/**
 * Audit & CAPA has no login screen of its own — every route in this app is gated here instead.
 * A user is already authenticated by signing in to the Emami Apps hub; this exchanges that hub
 * session for an Audit & CAPA session (backend/controllers/authController.js, which looks the
 * email up in audit_capa.users for access + role) every time this component mounts (a fresh page
 * load), then renders the real app. Role-based gating (RoleGuard, Sidebar's per-role menus) is
 * untouched — it still reads the same `currentUser` localStorage entry this just populates.
 *
 * Deliberately does NOT short-circuit to "ready" just because a `currentUser` is already cached in
 * localStorage from an earlier visit — access/role/depot can change server-side (Manage Access) at
 * any time, and re-running this exchange on every load is what makes a freshly-granted (or
 * freshly-revoked) access take effect immediately, instead of only after signing out of the hub
 * itself and back in.
 */
export default function Layout() {
  const [status, setStatus] = useState("checking");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (status !== "checking") return;

    const signInFromHubSession = async () => {
      const hubToken = localStorage.getItem(HUB_SESSION_TOKEN_KEY);

      if (!hubToken) {
        if (IS_LOCAL_HOST) {
          setErrorMessage(
            "No Emami Apps session found. Sign in to Emami Apps in another tab, then reload this page."
          );
          setStatus("error");
          return;
        }

        window.location.replace(EMAMI_APPS_URL);
        return;
      }


      try {
        const data = await apiPost("/auth/login", { hubToken });

        localStorage.setItem("authToken", data.token);
        localStorage.setItem("currentUser", JSON.stringify(data.user));

        setStatus("ready");
      }
      catch (error) {

        console.error(
          "Sign-in via Emami Apps session failed:",
          error
        );

        // 403 means the hub session itself is fine, but this person has no Audit & CAPA access
        // (backend/controllers/authController.js) — show it in place instead of bouncing back to
        // the hub, so it reads as "you're not authorized here" rather than a random redirect.
        if (error?.status === 403) {
          localStorage.removeItem("authToken");
          localStorage.removeItem("currentUser");
          setErrorMessage(error?.message || "You do not have authorization to use this application.");
          setStatus("unauthorized");
          return;
        }

        if (IS_LOCAL_HOST) {
          setErrorMessage(
            error?.message || "Could not sign you in. Please try again from Emami Apps."
          );
          setStatus("error");
          return;
        }

        window.location.replace(EMAMI_APPS_URL);
      }
    };

    signInFromHubSession();
  }, [status]);

  if (status === "checking") {
    return (
      <Box
        sx={{
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 2,
          bgcolor: "#F8FAFC",
        }}
      >
        <CircularProgress sx={{ color: "#7C3AED" }} />
        <Typography color="text.secondary">loading...</Typography>
      </Box>
    );
  }

  if (status === "error") {
    return (
      <Box
        sx={{
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 2,
          bgcolor: "#F8FAFC",
          textAlign: "center",
          px: 3,
        }}
      >
        <Typography variant="h6" color="#3730A3" fontWeight={700}>
          Sign-in required
        </Typography>
        <Typography color="error">{errorMessage}</Typography>
        <Button
          variant="contained"
          onClick={() => { window.location.href = EMAMI_APPS_URL; }}
          sx={{
            borderRadius: 3,
            background: "linear-gradient(135deg,#3730A3,#7C3AED)",
            fontWeight: 700,
          }}
        >
          Go to Emami Apps
        </Button>
      </Box>
    );
  }

  if (status === "unauthorized") {
    return (
      <Box
        sx={{
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 2,
          bgcolor: "#F8FAFC",
          textAlign: "center",
          px: 3,
        }}
      >
        <Typography variant="h6" color="#3730A3" fontWeight={700}>
          Access Denied
        </Typography>
        <Typography color="error">{errorMessage}</Typography>
        <Button
          variant="contained"
          onClick={() => { window.location.href = EMAMI_APPS_URL; }}
          sx={{
            borderRadius: 3,
            background: "linear-gradient(135deg,#3730A3,#7C3AED)",
            fontWeight: 700,
          }}
        >
          Go to Emami Apps
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ display: "flex", height: "100vh" }}>
      <Sidebar />

      <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <Navbar />

        <Box
          component="main"
          sx={{
            flex: 1,
            minWidth: 0,
            bgcolor: "#F8FAFC",
            p: 3,
            overflow: "auto",
          }}
        >
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}
