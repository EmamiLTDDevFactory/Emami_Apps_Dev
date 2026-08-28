// import logo from './logo.svg';
import './App.css';
import { BrowserRouter } from "react-router-dom";
// import Sidebar from "./components/layout/Sidebar";
// import Navbar from "./components/layout/Navbar";
import AppRoutes from "./routes/AppRoutes";
// import { Box } from "@mui/material";
// import Login from "./pages/Login";

import {
  useEffect,
} from "react";

import {
  generateDueDateReminders,
} from "./utils/reminders";
// import { useEffect } from "react";
import axios from "axios";

function App() {

  useEffect(() => {

    generateDueDateReminders().catch((error) =>
      console.error("Unable to generate reminders:", error)
    );

  }, []);

  useEffect(() => {

    const autoLogin = async () => {

      const hubToken =
        localStorage.getItem("emami_apps_session_token");

      if (!hubToken) {
        return;
      }

      try {

        const response =
          await axios.post(
            "/api/auth/login",
            {
              hubToken
            }
          );

        localStorage.setItem(
          "currentUser",
          JSON.stringify(
            response.data.user
          )
        );

        localStorage.setItem(
          "auditToken",
          response.data.token
        );

      } catch (error) {

        console.error(
          "Auto login failed",
          error
        );
      }
    };

    autoLogin();

  }, []);
  return (
    <BrowserRouter basename={process.env.PUBLIC_URL}>

      {/* { !Login && ( */}
      {/* <Box
        sx={{
          display: "flex",
          height: "100vh",
        }}
      > */}
      {/* <Sidebar /> */}

      {/* <Box
          sx={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            bgcolor: "#F8FAFC",
          }}
        > */}
      {/* <Navbar /> */}



      {/* <Box
            sx={{
              p: 3,
              overflow: "auto",
            }}
          > */}
      <AppRoutes />
      {/* </Box> */}
      {/* </Box> */}
      {/* </Box> */}
    </BrowserRouter>

  );
}

export default App;

//       <header className="App-header">
//         <img src={logo} className="App-logo" alt="logo" />
//         <p>
//           Edit <code>src/App.js</code> and save to reload.
//         </p>
//         <a
//           className="App-link"
//           href="https://reactjs.org"
//           target="_blank"
//           rel="noopener noreferrer"
//         >
//           Learn React
//         </a>
//       </header>
//     </div>
//   );
// }

// export default App;
