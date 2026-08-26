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

function App() {

  useEffect(() => {

    generateDueDateReminders().catch((error) =>
      console.error("Unable to generate reminders:", error)
    );

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
