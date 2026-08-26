import { Outlet } from "react-router-dom";
import { Box } from "@mui/material";

import Sidebar from "./Sidebar";
import Navbar from "./Navbar";
import { Navigate } from "react-router-dom";

export default function Layout() {
  const currentUser =
    JSON.parse(
      localStorage.getItem("currentUser")
    );

  if (!currentUser) {
    return <Navigate to="/login" replace />;
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