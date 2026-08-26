import { createTheme } from "@mui/material/styles";

const theme = createTheme({
  palette: {
    primary: {
      main: "#1565c0",
    },
    secondary: {
      main: "#ff9800",
    },
    success: {
      main: "#2e7d32",
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