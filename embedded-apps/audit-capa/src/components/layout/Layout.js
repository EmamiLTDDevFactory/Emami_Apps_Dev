import { Outlet } from "react-router-dom";
import { Box, CircularProgress, Typography, Button } from "@mui/material";
import { useEffect, useState } from "react";

import Sidebar from "./Sidebar";
import Navbar from "./Navbar";
import { apiPost } from "../../api/client";

// AsyncStorage's web backend writes straight to localStorage under this exact key, unprefixed —
// see the hub's src/context/AuthContext.tsx. Audit & CAPA runs same-origin under /apps/audit-capa
// on the hub's own domain, so it can read that same key directly.
const HUB_SESSION_TOKEN_KEY = "emami_apps_session_token";

/**
 * Audit & CAPA has no login screen of its own — every route in this app is gated here instead.
 * A user is already authenticated by signing in to the Emami Apps hub; this exchanges that hub
 * session for an Audit & CAPA session (backend/controllers/authController.js, which looks the
 * email up in audit_capa.users for access + role) the first time it's needed, then renders the
 * real app. Role-based gating (RoleGuard, Sidebar's per-role menus) is untouched — it still reads
 * the same `currentUser` localStorage entry this just populates.
 */
export default function Layout() {
  const [status, setStatus] = useState(() =>
    localStorage.getItem("currentUser") ? "ready" : "checking"
  );
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (status !== "checking") return;

    const signInFromHubSession = async () => {
      const hubToken = localStorage.getItem(HUB_SESSION_TOKEN_KEY);
      const EMAMI_APPS_URL =
        window.location.hostname.includes("dev")
          ? "https://dev.emamiapps.in/"
          : "https://www.emamiapps.in/";
      // if (!hubToken) {
      //   setErrorMessage("Please sign in to Emami Apps first.");
      //   setStatus("error");
      //   return;
      // }
      if (!hubToken) {

        window.location.replace(EMAMI_APPS_URL);
        // window.location.replace(
        //   "https://www.emamiapps.in/"
        // );
        return;
      }


      try {
        const data = await apiPost("/auth/login", { hubToken });

        localStorage.setItem("authToken", data.token);
        localStorage.setItem("currentUser", JSON.stringify(data.user));

        setStatus("ready");
      }
      // catch (error) {
      //   console.error("Sign-in via Emami Apps session failed:", error);
      //   setErrorMessage(
      //     error?.message || "Could not sign you in. Please try again from Emami Apps."
      //   );
      //   setStatus("error");
      // }
      catch (error) {

        console.error(
          "Sign-in via Emami Apps session failed:",
          error
        );

        window.location.replace(EMAMI_APPS_URL);

        // window.location.replace(
        //   "https://www.emamiapps.in/"
        // );
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
        <CircularProgress sx={{ color: "#0F5AA8" }} />
        <Typography color="text.secondary">Signing you in…</Typography>
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
        <Typography variant="h6" color="#0F2C5C" fontWeight={700}>
          Sign-in required
        </Typography>
        <Typography color="error">{errorMessage}</Typography>
        <Button
          variant="contained"
          onClick={() => { window.location.href = "https://www.emamiapps.in"; }}
          sx={{
            borderRadius: 3,
            background: "linear-gradient(135deg,#004A8D,#0077CC)",
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
