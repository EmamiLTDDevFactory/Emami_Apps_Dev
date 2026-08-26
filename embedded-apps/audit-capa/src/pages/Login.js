import {
    Box,
    Card,
    CardContent,
    Typography,
    TextField,
    Button,
    Stack,
} from "@mui/material";

import { useState } from "react";
import { useNavigate } from "react-router-dom";
// import users from "../data/users";
import emamiLogo from '../assets/emami-logo.jpg';
import { apiPost } from "../api/client";

export default function Login() {
    const navigate = useNavigate();

    const [userId, setUserId] =
        useState("");

    const [password, setPassword] =
        useState("");

    const [userError, setUserError] =
        useState(false);

    const [passwordError, setPasswordError] =
        useState(false);

    const [loginError, setLoginError] =
        useState(false);

    const handleLogin = async () => {
        let valid = true;

        if (!userId.trim()) {
            setUserError(true);
            valid = false;
        } else {
            setUserError(false);
        }

        if (!password.trim()) {
            setPasswordError(true);
            valid = false;
        } else {
            setPasswordError(false);
        }

        if (!valid) return;

        try {
            const data = await apiPost("/auth/login", {
                userId: userId.trim(),
                password: password,
            });

            setLoginError(false);

            // Store JWT token
            localStorage.setItem(
                "authToken",
                data.token
            );

            // Store logged-in user
            localStorage.setItem(
                "currentUser",
                JSON.stringify(data.user)
            );

            // Navigate to dashboard
            navigate("/");

        } catch (error) {
            console.error("Login API error:", error);
            setLoginError(true);
        }
    };

    // const handleLogin = () => {
    //     let valid = true;

    //     if (!userId.trim()) {
    //         setUserError(true);
    //         valid = false;
    //     } else {
    //         setUserError(false);
    //     }

    //     if (!password.trim()) {
    //         setPasswordError(true);
    //         valid = false;
    //     } else {
    //         setPasswordError(false);
    //     }

    //     if (!valid) return;

    //     // const user = {
    //     //     userId,
    //     //     name: userId,
    //     //     role: "Auditor",
    //     // };
    //     const matchedUser =
    //         users.find(
    //             (u) =>
    //                 u.userId.toLowerCase() ===
    //                 userId.toLowerCase() &&
    //                 u.password === password
    //         );

    //     if (!matchedUser) {

    //         setLoginError(true);

    //         return;
    //     }

    //     setLoginError(false);

    //     localStorage.setItem(
    //         "currentUser",
    //         JSON.stringify(matchedUser)
    //     );

    //     navigate("/");

    //     // localStorage.setItem(
    //     //     "currentUser",
    //     //     JSON.stringify(user)
    //     // );

    //     // navigate("/");
    // };

    const handleCancel = () => {
        setUserId("");
        setPassword("");

        setUserError(false);
        setPasswordError(false);
    };

    return (
        <Box
            sx={{
                height: "100vh",
                overflow: "hidden",
                position: "relative",
                // background:
                //     "linear-gradient(135deg,#111827,#312E81,#6366F1)",
                //                 background:
                //   "linear-gradient(135deg,#0F2C5C,#1B4F9C,#4A90E2)",
                background:
                    "linear-gradient(135deg,#002B5B,#00509E,#0077CC)",
                // background:"linear-gradient(135deg,#0F4C81,#2563EB,#60A5FA)",
                // background:"linear-gradient(135deg,#0F4C81,#1976D2)",
                // background:
                //     "linear-gradient(135deg,#1565c0,#42a5f5)",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                p: 0,
            }}
        >
            {/* <Card
                sx={{
                    width: 520,
                    // maxWidth: "95vw",
                    minHeight: 450,
                    borderRadius: 1,
                    boxShadow:
                        "0px 20px 40px rgba(0,0,0,0.25)",
                }}
            > */}

            {/* Top-left logo: place your image at public/emami-logo.png */}

            <Box
                sx={{
                    width: "40%",
                    color: "white",
                    px: 8,
                }}
            >
                <Typography
                    variant="h2"
                    fontWeight={800}
                    sx={{
                        lineHeight: 1.1,
                        mb: 3,
                    }}
                >
                    AUDIT &
                    <br />
                    CAPA
                    <br />
                    DIGITISATION
                </Typography>

                <Typography
                    variant="h5"
                    sx={{
                        opacity: 0.9,
                    }}
                >
                    Quality Management System
                </Typography>

                <Typography
                    sx={{
                        mt: 2,
                        opacity: 0.7,
                    }}
                >
                    Emami Group Internal Audit Platform
                </Typography>
            </Box>
            <Box
                component="img"
                src={emamiLogo}
                alt="Emami"

                sx={{
                    position: "absolute",
                    top: 16,
                    left: 16,
                    width: 140,

                    height: 140,
                    background: "#fff",
                    zIndex: 10,
                    padding: 1,
                    // border: 6,
                    borderRadius: 3,
                    boxShadow: "0px 10px 30px rgba(0,0,0,0.2)",

                }}
            />

            <Card
                sx={{
                    width: 500,
                    minHeight: 450,

                    // background:
                    //     "rgba(255,255,255,0.96)",

                    background: "rgba(255,255,255,0.90)",
                    backdropFilter: "blur(20px)",
                    border: "1px solid rgba(255,255,255,0.4)",

                    boxShadow:
                        "0px 25px 60px rgba(0,0,0,0.18)",
                    // backdropFilter:
                    //     "blur(12px)",

                    // border:
                    //     "1px solid rgba(255,255,255,0.2)",

                    // boxShadow:
                    //     "0px 25px 60px rgba(0,0,0,0.2)",

                    borderRadius: 2,
                }}
            >
                {/* <CardContent sx={{ p: 2 }}> */}

                {/* <Typography
                        variant="h4"
                        align="center"
                        fontWeight={700}
                    >
                        Audit & CAPA Digitisation
                    </Typography>

                    <Typography
                        align="center"
                        color="text.secondary"
                        sx={{ mb: 5 }}
                    >
                        Quality Management System
                    </Typography> */}

                {/* <Typography
                        variant="h5"
                        fontWeight={700}
                        color="#002B5B"
                    >
                        Login In
                    </Typography> */}

                {/* <Typography
                        variant="h4"
                        fontWeight={700}
                        color="#0F2C5C"
                    >
                        Welcome Back
                    </Typography>

                    <Typography
                        variant="body1"
                        color="text.secondary"
                        sx={{ mt: 1 }}
                    >
                        Sign in to continue
                    </Typography> */}




                <CardContent sx={{ p: 4 }}>

                    <Box
                        sx={{
                            width: 60,
                            height: 5,
                            bgcolor: "#0F5AA8",
                            borderRadius: 10,
                            mb: 2,
                        }}
                    />

                    <Box
                        sx={{
                            display: "flex",
                            justifyContent: "center",
                            mb: 3,
                            color: "#0F5AA8",
                            fontSize: 48,
                            fontWeight: 700,
                        }}
                    >
                        🔐
                    </Box>

                    <Typography
                        variant="h4"
                        fontWeight={700}
                        color="#0F2C5C"
                    >
                        Welcome Back!
                    </Typography>

                    <Typography
                        variant="body1"
                        color="text.secondary"
                        sx={{ mt: 1 }}
                    >
                        Login to continue
                    </Typography>

                    <Typography
                        color="text.secondary"
                        sx={{ mb: 4 }}
                    >
                        Enter your SAP / Non-SAP credentials
                    </Typography>



                    {/* <Typography
                        variant="h4"
                        align="center"
                        fontWeight={700}
                        gutterBottom
                    >
                        Audit & CAPA Digitisation
                    </Typography>

                    <Typography
                        align="center"
                        color="text.secondary"
                        sx={{ mb: 5 }}
                    >
                        Quality Management System
                    </Typography> */}

                    <TextField
                        fullWidth
                        label="SAP / Non-SAP ID"
                        value={userId}
                        error={userError}
                        helperText={
                            userError
                                ? "Please enter User ID"
                                : ""
                        }
                        onChange={(e) => {
                            setUserId(
                                e.target.value
                            );
                            setLoginError(false);

                            // if (
                            //     e.target.value.trim()
                            // ) {
                            //     setUserError(
                            //         false
                            //     );
                            // }
                        }}
                        // sx={{ mb: 3 }}
                        // sx={{
                        //     mb: 3,

                        //     "& .MuiOutlinedInput-root": {
                        //         borderRadius: 3,
                        //         bgcolor: "#F8FAFC",
                        //     },
                        // }}

                        sx={{
                            mb: 3,

                            "& .MuiOutlinedInput-root": {
                                borderRadius: 4,
                                // bgcolor: "#F8FAFC",
                                bgcolor: "#FFFFFF",
                                boxShadow: "0px 2px 8px rgba(0,0,0,0.05)",

                                "& fieldset": {
                                    borderColor: "#CBD5E1",
                                },

                                "&:hover fieldset": {
                                    borderColor: "#94A3B8",
                                },

                                "&.Mui-focused fieldset": {
                                    borderColor: "#6366F1",
                                    borderWidth: "2px",
                                },
                            },
                        }}
                    />

                    <TextField
                        fullWidth
                        type="password"
                        label="Password"
                        value={password}
                        error={passwordError}
                        helperText={
                            passwordError
                                ? "Please enter Password"
                                : ""
                        }
                        onChange={(e) => {
                            setPassword(
                                e.target.value
                            );

                            setLoginError(false);


                            // if (
                            //     e.target.value.trim()
                            // ) {
                            //     setPasswordError(
                            //         false
                            //     );
                            // }
                        }}
                        // sx={{ mb: 4 }}
                        // sx={{
                        //     mb: 3,

                        //     "& .MuiOutlinedInput-root": {
                        //         borderRadius: 3,
                        //         bgcolor: "#F8FAFC",
                        //     },
                        // }}
                        sx={{
                            mb: 3,

                            "& .MuiOutlinedInput-root": {
                                borderRadius: 4,
                                // bgcolor: "#F8FAFC",
                                bgcolor: "#FFFFFF",
                                boxShadow: "0px 2px 8px rgba(0,0,0,0.05)",

                                "& fieldset": {
                                    borderColor: "#CBD5E1",
                                },

                                "&:hover fieldset": {
                                    borderColor: "#94A3B8",
                                },

                                "&.Mui-focused fieldset": {
                                    borderColor: "#6366F1",
                                    borderWidth: "2px",
                                },
                            },
                        }}
                    />

                    {loginError && (
                        <Typography
                            color="error"
                            sx={{
                                mb: 2,
                            }}
                        >
                            Invalid User ID or Password
                        </Typography>
                    )}

                    <Stack
                        direction="row"
                        spacing={2}
                    >
                        <Button
                            fullWidth
                            variant="contained"
                            size="large"
                            onClick={handleLogin}
                            // sx={{
                            //     borderRadius: 3,
                            //     // background:
                            //     //     "linear-gradient(135deg,#4F46E5,#6366F1)",
                            //     background:
                            //         "linear-gradient(135deg,#00509E,#0077CC)",
                            //     boxShadow:
                            //         "0px 8px 20px rgba(79,70,229,0.3)",
                            // }}
                            sx={{
                                borderRadius: 3,
                                background:
                                    "linear-gradient(135deg,#004A8D,#0077CC)",
                                fontWeight: 700,
                                letterSpacing: 1,
                                boxShadow:
                                    "0px 10px 24px rgba(0,119,204,0.35)",

                                "&:hover": {
                                    background:
                                        "linear-gradient(135deg,#003B70,#0066B3)",
                                    transform: "translateY(-2px)",
                                },
                            }}
                        >
                            Login
                        </Button>

                        {/* <Button
                            fullWidth
                            variant="contained"
                            size="large"
                            onClick={
                                handleLogin
                            }
                        >
                            Login
                        </Button> */}

                        <Button
                            fullWidth
                            variant="outlined"
                            // variant="text"

                            sx={{
                                borderRadius: 3,
                                borderColor: "#00509E",
                                color: "#00509E",
                                // color: "#64748B",
                                fontWeight: 600,
                                "&:hover": {
                                    color: "#00509E",
                                    transform: "translateY(-2px)",
                                },
                            }}
                            size="large"
                            onClick={
                                handleCancel
                            }
                        >
                            Cancel
                        </Button>
                    </Stack>

                    <Typography
                        variant="body2"
                        align="center"
                        color="text.secondary"
                        sx={{ mt: 5 }}
                    >
                        © 2026 Audit & CAPA Digitisation
                    </Typography>
                </CardContent>
            </Card>
        </Box>
    );
}
