import { createTheme } from "@mui/material/styles";

const theme = createTheme({
  palette: {
    primary: {
      main: "#7C3AED",
    },
    secondary: {
      main: "#ff9800",
    },
    success: {
      main: "#10B981",
    },
    error: {
      main: "#F43F5E",
    },
    background: {
      default: "#F8FAFC",
    },
  },

  shape: {
    borderRadius: 12,
  },

  typography: {
    fontFamily: "Inter, Roboto, Arial",
  },
});

export default theme;