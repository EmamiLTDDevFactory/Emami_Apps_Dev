import { useState } from "react";

import {
    Box,
    Button,
    MenuItem,
    TextField,
    Typography,
    Card,
    CardContent,
    Grid,
    Chip,
} from "@mui/material";
import emamiLogo from '../assets/emami-logo.jpg';
// import {
//     getCertification
// } from "../utils/certificationUtils";

// import IconButton from "@mui/material/IconButton";

// import MoreVertIcon from "@mui/icons-material/MoreVert";
import useMediaQuery from "@mui/material/useMediaQuery";
import { DataGrid } from "@mui/x-data-grid";
import {
    useAppContext,
} from "../context/AppContext";
import VisibilityIcon from "@mui/icons-material/Visibility";
import IconButton from "@mui/material/IconButton";
import DeleteIcon from "@mui/icons-material/Delete";
import Tooltip from "@mui/material/Tooltip";
import { deleteAudit } from "../utils/storage";


// import auditsData from "../data/audits";
import { useNavigate } from "react-router-dom";
import AssignmentTurnedInIcon from "@mui/icons-material/AssignmentTurnedIn";
import AssignmentLateIcon from "@mui/icons-material/AssignmentLate";
import AutorenewIcon from "@mui/icons-material/Autorenew";
import TaskAltIcon from "@mui/icons-material/TaskAlt";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";



export default function AuditList() {

    const navigate = useNavigate();
    const [search, setSearch] = useState("");

    const [statusFilter, setStatusFilter] =
        useState("All");
    const [typeFilter, setTypeFilter] =
        useState("All");

    const [selectedKPI, setSelectedKPI] =
        useState("All");

    const { audits, setAudits } =
        useAppContext();

    const currentUser = JSON.parse(
        localStorage.getItem(
            "currentUser"
        )
    );

    const isDepot =
        currentUser?.role ===
        "Depot";

    const isTablet =
        useMediaQuery(
            "(min-width:768px) and (max-width:1200px)"
        );

    const isCQATablet =
        !isDepot && isTablet;

    const visibleAudits =
        isDepot
            ? audits.filter(
                (audit) =>
                    audit.depot ===
                    currentUser.depot
            )
            : audits;

    const filteredAudits = visibleAudits.filter(
        (audit) => {
            const searchMatch =
                audit.auditNo
                    .toLowerCase()
                    .includes(search.toLowerCase()) ||
                audit.depot
                    .toLowerCase()
                    .includes(search.toLowerCase());

            const statusMatch =
                statusFilter === "All"
                    ? true
                    : audit.status ===
                    statusFilter;

            const typeMatch =
                typeFilter === "All"
                    ? true
                    : audit.auditType ===
                    typeFilter;

            const kpiMatch =
                selectedKPI === "All"
                    ? true
                    : audit.status === selectedKPI;

            // const visibleAudits =
            //     isDepot
            //         ? audits.filter(
            //             (audit) =>
            //                 audit.depot ===
            //                 currentUser.name
            //         )
            //         : audits;

            return (
                searchMatch &&
                statusMatch &&
                typeMatch &&
                kpiMatch
                // visibleAudits
            );
        }
    );



    //     useEffect(() => {
    //     const timer = setTimeout(() => {
    //         window.dispatchEvent(new Event("resize"));
    //     }, 350);

    //     return () => clearTimeout(timer);
    // }, [sidebarOpen]);

    const handleDeleteAudit = async (auditId) => {

        const confirmDelete =
            window.confirm(
                "Are you sure you want to delete this audit?"
            );

        if (!confirmDelete) return;

        const updatedAudits =
            audits.filter(
                (audit) =>
                    audit.id !== auditId
            );

        try {
            await deleteAudit(auditId);
            setAudits(updatedAudits);
            alert("Audit deleted successfully.");
        } catch (error) {
            console.error(error);
            alert("Unable to delete audit.");
        }
    };

    const columns = [
        {
            field: "auditNo",
            headerName: "Audit Number",
            flex: 2,
        },
        {
            field: "createdDate",
            headerName: "Creation Date",
            flex: 1,
        },
        {
            field: "dueDate",
            headerName: "Due Date",
            flex: 1,
        },

        // {
        //     field: "dueDate",
        //     headerName: "Due Date",
        //     flex: 1,

        //     renderCell: (params) =>
        //         new Date(
        //             params.value
        //         ).toLocaleDateString(),
        // },

        {
            field: "overdue",
            headerName: "Overdue",
            flex: 1,

            renderCell: (params) => {

                const dueDate =
                    params.row.dueDate;

                if (!dueDate)
                    return "-";

                const isOverdue =
                    new Date(dueDate) <
                    new Date() &&
                    params.row.status !==
                    "Closed";

                return (
                    <Chip
                        label={
                            isOverdue
                                ? "Yes"
                                : "No"
                        }
                        color={
                            isOverdue
                                ? "error"
                                : "success"
                        }
                        size="small"
                    />
                );
            },
        },

        {
            field: "depot",
            headerName: "Depot",
            flex: 1,
        },
        {
            field: "auditor",
            headerName: "Auditor",
            flex: 1,
        },
        {
            field: "auditType",
            headerName: "Audit Type",
            flex: 1,
        },

        {
            field: "compliance",
            headerName: "Compliance %",
            flex: 1,

            renderCell: (params) => (
                <Chip
                    size="small"
                    label={`${params.value}%`}
                    color={
                        params.value >= 90
                            ? "success"
                            : params.value >= 70
                                ? "warning"
                                : "error"
                    }
                />
            ),
        },
        // {
        //     field: "compliance",
        //     headerName: "Compliance %",
        //     flex: 1,
        // },

        // {
        //     field: "certification",
        //     headerName:
        //         "Certification",
        //     flex: 1,

        //     renderCell: (params) => {

        //         const cert =
        //             getCertification(
        //                 params.row.compliance || 0
        //             );

        //         return (
        //             <Chip
        //                 label={
        //                     cert.certification
        //                 }
        //                 sx={{
        //                     bgcolor:
        //                         cert.color,
        //                     color: "white",
        //                     fontWeight: 600,
        //                 }}
        //             />
        //         );
        //     },
        // },

        // {
        //     field: "rating",
        //     headerName: "Rating",
        //     flex: 1,

        //     renderCell: (params) => {

        //         const cert =
        //             getCertification(
        //                 params.row.compliance || 0
        //             );

        //         return (
        //             <Typography
        //                 sx={{
        //                     color:
        //                         cert.color,
        //                     fontWeight: 700,
        //                 }}
        //             >
        //                 {cert.rating}
        //             </Typography>
        //         );
        //     },
        // },

        // {
        //     field: "status",
        //     headerName: "Status",
        //     flex: 1,
        // },
        {
            field: "status",
            headerName: "Status",
            flex: 1,

            renderCell: (params) => (
                <Chip
                    label={params.value}
                    color={
                        params.value === "Open"
                            ? "warning"
                            : params.value === "Closed"
                                ? "success"
                                : params.value === "Completed"
                                    ? "primary"
                                    : "info"
                    }
                    size="small"
                />
            ),
        },
        // {
        //     field: "checklist",
        //     headerName: "Audit Checklist",
        //     flex: 1.5,
        //     sortable: false,

        //     renderCell: (params) => (
        //         <Button
        //             variant="outlined"
        //             color="primary"
        //             size="small"
        //             onClick={() =>
        //                 navigate(
        //                     `/annexure1/${params.row.id}`
        //                 )
        //             }
        //         >
        //             View Checklist
        //         </Button>
        //     ),
        // }

        {
            field: "actions",
            headerName: "Actions",
            flex: 1,
            sortable: false,

            renderCell: (params) => (
                <Box
                    sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                    }}
                >
                    <Tooltip title="View Checklist">
                        <IconButton
                            size={
                                isCQATablet
                                    ? "large"
                                    : "medium"
                            }
                            color="primary"
                            onClick={() =>
                                navigate(
                                    `/annexure1/${params.row.id}`
                                )
                            }
                        >
                            <VisibilityIcon />
                        </IconButton>
                    </Tooltip>

                    {/* {!isDepot && (
                        <Tooltip title="Delete Audit">
                            <IconButton
                                size={
                                    isCQATablet
                                        ? "large"
                                        : "medium"
                                }

                                color="error"
                                onClick={() =>
                                    handleDeleteAudit(
                                        params.row.id
                                    )
                                }
                            >
                                <DeleteIcon />
                            </IconButton>
                        </Tooltip>
                    )} */}

                    {currentUser?.role === "CQA" &&
                        ["Open", "In Progress"].includes(params.row.status) && (
                            <Tooltip title="Delete Audit">
                                <IconButton
                                    size={
                                        isCQATablet
                                            ? "large"
                                            : "medium"
                                    }
                                    color="error"
                                    onClick={() =>
                                        handleDeleteAudit(
                                            params.row.id
                                        )
                                    }
                                >
                                    <DeleteIcon />
                                </IconButton>
                            </Tooltip>
                        )}
                </Box>
            ),
        },

        // {
        //     field: "actions",
        //     headerName: "Actions",
        //     flex: 1.5,
        //     sortable: false,

        //     renderCell: (params) => (
        //         <Box
        //             sx={{
        //                 display: "flex",
        //                 alignItems: "center",
        //                 gap: 1,
        //             }}
        //         >
        //             <Button
        //                 variant="outlined"
        //                 size="small"
        //                 onClick={() =>
        //                     navigate(
        //                         `/annexure1/${params.row.id}`
        //                     )
        //                 }
        //             >
        //                 View Checklist
        //             </Button>

        //             <Tooltip title="Delete Audit">
        //                 <IconButton
        //                     color="error"
        //                     onClick={() =>
        //                         handleDeleteAudit(
        //                             params.row.id
        //                         )
        //                     }
        //                 >
        //                     <DeleteIcon />
        //                 </IconButton>
        //             </Tooltip>
        //         </Box>
        //     ),
        // },


        // {
        //     field: "actions",
        //     headerName: "Actions",
        //     flex: 2,
        //     sortable: false,

        //     renderCell: (params) => (
        //         <Box
        //             sx={{
        //                 display: "flex",
        //                 gap: 1,
        //             }}
        //         >
        //             <Button
        //                 variant="outlined"
        //                 color="primary"
        //                 size="small"
        //                 onClick={() =>
        //                     navigate(
        //                         `/annexure1/${params.row.id}`
        //                     )
        //                 }
        //             >
        //                 View Checklist
        //             </Button>

        //             <Button
        //                 variant="contained"
        //                 color="error"
        //                 size="small"
        //                 onClick={() =>
        //                     handleDeleteAudit(
        //                         params.row.id
        //                     )
        //                 }
        //             >
        //                 Delete
        //             </Button>
        //         </Box>
        //     ),
        // },


        //         {
        //   field: "checklist",
        //   headerName: "Checklist",
        //   flex: 1.5,
        //   sortable: false,

        //   renderCell: (params) => (
        //     <Button
        //       variant="contained"
        //       size="small"
        //       onClick={() =>
        //         navigate(
        //           `/annexure1/${params.row.id}`
        //         )
        //       }
        //     >
        //       View Checklist
        //     </Button>
        //   ),
        // }
        // {
        //     field: "actions",
        //     headerName: "Actions",
        //     width: 100,

        //     renderCell: (params) => (
        //         <IconButton
        //             onClick={() =>
        //                 navigate(
        //                     `/annexure1/${params.row.id}`
        //                 )
        //             }
        //         >
        //             <MoreVertIcon />
        //         </IconButton>
        //     ),
        // }
        // {
        //     field: "actions",
        //     headerName: "Actions",
        //     flex: 3,
        //     sortable: false,

        //     renderCell: (params) => (
        //         <>
        //             {/* <Button
        //     size="small"
        //     variant="outlined"
        //     sx={{ mr: 1 }}
        //   >
        //     View
        //   </Button> */}
        //             <Button
        //                 size="small"
        //                 variant="outlined"
        //                 sx={{ mr: 1 }}
        //                 onClick={() =>
        //                     navigate(`/annexure1/${params.row.id}`)
        //                 }
        //             >
        //                 View
        //             </Button>

        //             <Button
        //                 size="small"
        //                 variant="contained"
        //                 sx={{ mr: 1 }}
        //             >
        //                 Edit
        //             </Button>

        //             <Button
        //                 size="small"
        //                 color="error"
        //                 variant="contained"
        //             >
        //                 Delete
        //             </Button>

        //         </>
        //     ),
        // },
    ];



    return (
        <Box>
            {/* <Typography
                variant="h4"
                gutterBottom
            >
                Audit Management
            </Typography> */}

            {/* <Box
                sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    mb: 3,
                }}
            >
                <Typography variant="h4">
                    Audit Management
                </Typography>

                <Button
                    variant="contained"
                    onClick={() =>
                        navigate("/audits/create")
                    }
                >
                    Create Audit
                </Button>
            </Box> */}


            <Card
                sx={{
                    mb: 3,
                    // background:
                    //     "linear-gradient(135deg,#2563EB,#60A5FA)",
                    background: "linear-gradient(135deg,#3730A3,#7C3AED)",
                    // background:
                    //     "linear-gradient(135deg,#1565c0,#42a5f5)",
                    color: "white",
                    borderRadius: 2,
                }}
            >
                <CardContent>
                    <Box
                        sx={{
                            display: "flex",
                            justifyContent: "space-between",
                            flexDirection:
                                isCQATablet
                                    ? "column"
                                    : "row",

                            alignItems:
                                isCQATablet
                                    ? "flex-start"
                                    : "center",

                            gap: 3,

                        }}
                    >
                        <Box
                            sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: 3,
                            }}
                        >
                            <Box
                                component="img"
                                src={emamiLogo}
                                alt="Emami Logo"
                                sx={{
                                    width: 110,
                                    height: 90,
                                    objectFit: "contain",
                                    background: "#fff",
                                    borderRadius: 2,
                                    p: 1,
                                    boxShadow:
                                        "0px 4px 12px rgba(0,0,0,0.15)",
                                }}
                            />
                            <Box>
                                {/* <Typography variant="h4">
                                Audit Management
                            </Typography> */}
                                <Typography variant="h4">
                                    {isDepot
                                        ? "My Audits"
                                        : "Audit Management"}
                                </Typography>

                                <Typography>
                                    {isDepot
                                        ? "View audits assigned to your depot"
                                        : "Manage audits, assignments and compliance activities"}
                                </Typography>

                                {/* <Typography>
                                Manage audits, assignments and compliance activities
                            </Typography> */}
                            </Box>
                        </Box>

                        {!isDepot && (
                            <Button
                                variant="contained"
                                onClick={() =>
                                    navigate("/audits/create")
                                }
                                sx={{
                                    bgcolor: "white",
                                    color: "#7C3AED",
                                    fontWeight: 600,
                                    justifyContent: "flex-end",
                                    // alignItems: "flex-end",
                                    gap: 3,


                                    "&:hover": {
                                        bgcolor: "#f5f5f5",
                                    },
                                }}
                            >
                                Create Audit
                            </Button>
                        )}
                    </Box>
                </CardContent>
            </Card>

            {/* <Grid
                container
                spacing={2}
                sx={{ mb: 3 }}
            >
                <Grid item xs={12} md={4}>
                    <Card>
                        <CardContent>
                            <Typography>
                                Open Audits
                            </Typography>

                            <Typography variant="h4">
                                {
                                    audits.filter(
                                        (a) =>
                                            a.status ===
                                            "Open"
                                    ).length
                                }
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>

                <Grid item xs={12} md={4}>
                    <Card>
                        <CardContent>
                            <Typography>
                                Closed Audits
                            </Typography>

                            <Typography variant="h4">
                                {
                                    audits.filter(
                                        (a) =>
                                            a.status ===
                                            "Closed"
                                    ).length
                                }
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>

                <Grid item xs={12} md={4}>
                    <Card>
                        <CardContent>
                            <Typography>
                                Total Audits
                            </Typography>

                            <Typography variant="h4">
                                {audits.length}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid> */}

            <Grid
                container
                spacing={3}
                sx={{ mb: 3 }}
            >

                {/* Total Audits */}

                {/* <Grid item xs={12} sm={6} md={3}> */}
                <Grid
                    item
                    xs={12}
                    sm={6}
                    md={4}
                    lg={3}
                >
                    <Card
                        onClick={() =>
                            setSelectedKPI("All")
                        }
                        sx={{
                            cursor: "pointer",
                            borderRadius: 1,
                            height: "100%",
                            minHeight: isCQATablet ? 120 : 100,
                            border:
                                selectedKPI === "All"
                                    ? "2px solid #2563EB"
                                    : "1px solid #E5E7EB",
                            boxShadow:
                                "0px 8px 20px rgba(15,23,42,0.06)",

                        }}
                    >
                        <CardContent
                            sx={{
                                display: "flex",
                                justifyContent: "space-between",
                                // alignItems: "center",
                                flexDirection:
                                    isCQATablet
                                        ? "column"
                                        : "row",

                                alignItems:
                                    isCQATablet
                                        ? "flex-start"
                                        : "center",

                                gap: 2,

                            }}>
                            <Box>
                                <Typography
                                    color="text.secondary"
                                >
                                    Total Audits
                                </Typography>

                                <Typography
                                    variant="h4"
                                    fontWeight={700}
                                    color="#2563EB"

                                >
                                    {visibleAudits.length}
                                    {/* {audits.length} */}
                                </Typography>
                            </Box>
                            <AssignmentTurnedInIcon
                                sx={{
                                    fontSize: 40,
                                    color: "#2563EB",
                                }}
                            />

                        </CardContent>
                    </Card>
                </Grid>

                {/* Open */}

                {/* <Grid item xs={12} sm={6} md={3}> */}
                <Grid
                    item
                    xs={12}
                    sm={6}
                    md={4}
                    lg={3}
                >
                    <Card
                        onClick={() =>
                            setSelectedKPI("Open")
                        }
                        sx={{
                            cursor: "pointer",
                            borderRadius: 1,
                            border:
                                selectedKPI === "Open"
                                    ? "2px solid #F59E0B"
                                    : "1px solid #E5E7EB",
                            boxShadow:
                                "0px 8px 20px rgba(15,23,42,0.06)",
                        }}
                    >
                        {/* <CardContent>
                            <Typography
                                color="text.secondary"
                            >
                                Open Audits
                            </Typography>

                            <Typography
                                variant="h4"
                                fontWeight={700}
                                color="#F59E0B"
                            >
                                {
                                    audits.filter(
                                        a =>
                                            a.status ===
                                            "Open"
                                    ).length
                                }
                            </Typography>
                        </CardContent> */}
                        <CardContent
                            sx={{
                                display: "flex",
                                justifyContent: "space-between",
                                // alignItems: "center",
                                flexDirection:
                                    isCQATablet
                                        ? "column"
                                        : "row",

                                alignItems:
                                    isCQATablet
                                        ? "flex-start"
                                        : "center",

                                gap: 2,

                            }}
                        >
                            <Box>
                                <Typography
                                    color="text.secondary"
                                >
                                    Open Audits
                                </Typography>

                                <Typography
                                    variant="h4"
                                    fontWeight={700}
                                    color="#F59E0B"
                                >
                                    {/* {
                                        audits.filter(
                                            a =>
                                                a.status === "Open"
                                        ).length
                                    } */}
                                    {
                                        visibleAudits.filter(
                                            a => a.status === "Open"
                                        ).length
                                    }
                                </Typography>
                            </Box>

                            <AssignmentLateIcon
                                sx={{
                                    fontSize: 42,
                                    color: "#F59E0B",
                                }}
                            />
                        </CardContent>
                    </Card>
                </Grid>

                {/* In Progress */}

                {/* <Grid item xs={12} sm={6} md={3}> */}
                <Grid
                    item
                    xs={12}
                    sm={6}
                    md={4}
                    lg={3}
                >
                    <Card
                        onClick={() =>
                            setSelectedKPI(
                                "In Progress"
                            )
                        }
                        sx={{
                            cursor: "pointer",
                            borderRadius: 1,
                            border:
                                selectedKPI ===
                                    "In Progress"
                                    ? "2px solid #06B6D4"
                                    : "1px solid #E5E7EB",
                            boxShadow:
                                "0px 8px 20px rgba(15,23,42,0.06)",
                        }}
                    >
                        <CardContent
                            sx={{
                                display: "flex",
                                justifyContent: "space-between",
                                // alignItems: "center",
                                flexDirection:
                                    isCQATablet
                                        ? "column"
                                        : "row",

                                alignItems:
                                    isCQATablet
                                        ? "flex-start"
                                        : "center",

                                gap: 2,

                            }}>
                            <Box>
                                <Typography
                                    color="text.secondary"
                                >
                                    In Progress
                                </Typography>

                                <Typography
                                    variant="h4"
                                    fontWeight={700}
                                    color="#06B6D4"
                                >
                                    {/* {
                                        audits.filter(
                                            a =>
                                                a.status ===
                                                "In Progress"
                                        ).length
                                    } */}
                                    {
                                        visibleAudits.filter(
                                            a => a.status === "In Progress"
                                        ).length
                                    }
                                </Typography>
                            </Box>
                            <AutorenewIcon
                                sx={{
                                    fontSize: 40,
                                    color: "#06B6D4",
                                }}
                            />
                        </CardContent>
                    </Card>
                </Grid>

                {/* Completed */}

                {/* <Grid item xs={12} sm={6} md={3}> */}
                <Grid
                    item
                    xs={12}
                    sm={6}
                    md={4}
                    lg={3}
                >
                    <Card
                        onClick={() =>
                            setSelectedKPI(
                                "Completed"
                            )
                        }
                        sx={{
                            cursor: "pointer",
                            borderRadius: 1,
                            border:
                                selectedKPI ===
                                    "Completed"
                                    ? "2px solid #8B5CF6"
                                    : "1px solid #E5E7EB",
                            boxShadow:
                                "0px 8px 20px rgba(15,23,42,0.06)",
                        }}
                    >
                        <CardContent
                            sx={{
                                display: "flex",
                                justifyContent: "space-between",
                                // alignItems: "center",
                                flexDirection:
                                    isCQATablet
                                        ? "column"
                                        : "row",

                                alignItems:
                                    isCQATablet
                                        ? "flex-start"
                                        : "center",

                                gap: 2,

                            }}>
                            <Box>
                                <Typography
                                    color="text.secondary"
                                >
                                    Completed
                                </Typography>

                                <Typography
                                    variant="h4"
                                    fontWeight={700}
                                    color="#8B5CF6"
                                >
                                    {
                                        visibleAudits.filter(
                                            a => a.status === "Completed"
                                        ).length
                                    }
                                </Typography>
                            </Box>
                            <TaskAltIcon
                                sx={{
                                    fontSize: 40,
                                    color: "#8B5CF6",
                                }}
                            />
                        </CardContent>
                    </Card>
                </Grid>

                {/* Closed */}

                {/* <Grid item xs={12} sm={6} md={3}> */}
                <Grid
                    item
                    xs={12}
                    sm={6}
                    md={4}
                    lg={3}
                >
                    <Card
                        onClick={() =>
                            setSelectedKPI(
                                "Closed"
                            )
                        }
                        sx={{
                            cursor: "pointer",
                            borderRadius: 1,
                            border:
                                selectedKPI ===
                                    "Closed"
                                    ? "2px solid #22C55E"
                                    : "1px solid #E5E7EB",
                            boxShadow:
                                "0px 8px 20px rgba(15,23,42,0.06)",
                        }}
                    >
                        <CardContent
                            sx={{
                                display: "flex",
                                justifyContent: "space-between",
                                // alignItems: "center",
                                flexDirection:
                                    isCQATablet
                                        ? "column"
                                        : "row",

                                alignItems:
                                    isCQATablet
                                        ? "flex-start"
                                        : "center",

                                gap: 2,

                            }}>
                            <Box>
                                <Typography
                                    color="text.secondary"
                                >
                                    Closed Audits
                                </Typography>

                                <Typography
                                    variant="h4"
                                    fontWeight={700}
                                    color="#22C55E"
                                >
                                    {
                                        visibleAudits.filter(
                                            a => a.status === "Closed"
                                        ).length
                                    }
                                </Typography>
                            </Box>
                            <CheckCircleIcon
                                sx={{
                                    fontSize: 40,
                                    color: "#22C55E",
                                }}
                            />
                        </CardContent>
                    </Card>
                </Grid>

            </Grid>

            {/* <Box
                sx={{
                    display: "flex",
                    gap: 2,
                    mb: 3,
                }}
            > */}
            {/* <Card sx={{ mb: 3 }}> */}
            <Card
                sx={{
                    borderRadius: 2,
                    mb: 3,
                    boxShadow:
                        "0px 8px 20px rgba(15,23,42,0.06)",
                }}
            >

                <CardContent>

                    <Box
                        sx={{
                            // display: "flex",
                            // gap: 2,
                            // flexWrap: "wrap",
                            display: "flex",

                            flexDirection:
                                isCQATablet
                                    ? "column"
                                    : "row",

                            gap: 2,

                        }}
                    >

                        <TextField
                            label="Search Audit"
                            fullWidth={isCQATablet}
                            value={search}
                            onChange={(e) =>
                                setSearch(
                                    e.target.value
                                )
                            }
                        />

                        {/* <TextField
                            select
                            label="Status"
                            value={statusFilter}
                            onChange={(e) =>
                                setStatusFilter(
                                    e.target.value
                                )
                            }
                            sx={{ width: 200 }}
                        >
                            <MenuItem value="All">
                                All
                            </MenuItem>

                            <MenuItem value="Open">
                                Open
                            </MenuItem>

                            <MenuItem value="In Progress">
                                In Progress
                            </MenuItem>

                            <MenuItem value="Completed">
                                Completed
                            </MenuItem>

                            <MenuItem value="Closed">
                                Closed
                            </MenuItem>
                        </TextField> */}

                        <TextField
                            select
                            label="Audit Type"
                            fullWidth={isCQATablet}
                            value={typeFilter}
                            onChange={(e) =>
                                setTypeFilter(
                                    e.target.value
                                )
                            }
                            sx={{ width: 200 }}
                        >
                            <MenuItem value="All">
                                All
                            </MenuItem>

                            <MenuItem value="Onsite">
                                Onsite
                            </MenuItem>

                            <MenuItem value="Desktop">
                                Desktop
                            </MenuItem>
                        </TextField>


                    </Box>

                    <div
                        style={{
                            height: 500,
                            width: "100%",
                        }}
                    >
                        <Typography
                            sx={{
                                mb: 2,
                                fontWeight: 600,
                            }}
                        >
                            Showing
                            {" "}
                            {filteredAudits.length}
                            {" "}
                            audit(s)
                        </Typography>

                        {/* <Box
                            sx={{
                                width: "100%",
                                minWidth: 0,
                                overflowX: "auto",
                            }}
                        >
                            <DataGrid
                                // key={sidebarOpen ? "drawer-open" : "drawer-close"}
                                rowHeight={
                                    isCQATablet
                                        ? 60
                                        : 52
                                }
                                rows={filteredAudits}
                                columns={columns}
                                density={
                                    isCQATablet
                                        ? "comfortable"
                                        : "standard"
                                }
                                pageSizeOptions={[5, 10, 20]}
                                disableRowSelectionOnClick
                                autoHeight
                                sx={{
                                    border: 0,


                                    "& .MuiDataGrid-columnHeaders": {
                                        backgroundColor: "#f5f5f5",
                                        fontWeight: 700,
                                    },
                                }}
                            />
                        </Box> */}

                        {isCQATablet ? (

                            <Box sx={{ mt: 2 }}>
                                {filteredAudits.map((audit) => (
                                    <Card
                                        key={audit.id}
                                        sx={{
                                            mb: 2,
                                            borderRadius: 2,
                                            boxShadow:
                                                "0px 8px 20px rgba(15,23,42,0.06)",
                                        }}
                                    >
                                        <CardContent>

                                            <Typography
                                                variant="h6"
                                                fontWeight={700}
                                                color="primary"
                                            >
                                                {audit.auditNo}
                                            </Typography>

                                            <Grid container spacing={1} sx={{ mt: 1 }}>

                                                <Grid item xs={6}>
                                                    <Typography variant="body2">
                                                        <b>Depot:</b> {audit.depot}
                                                    </Typography>
                                                </Grid>

                                                <Grid item xs={6}>
                                                    <Typography variant="body2">
                                                        <b>Auditor:</b> {audit.auditor}
                                                    </Typography>
                                                </Grid>

                                                <Grid item xs={6}>
                                                    <Typography variant="body2">
                                                        <b>Type:</b> {audit.auditType}
                                                    </Typography>
                                                </Grid>

                                                <Grid item xs={6}>
                                                    <Typography variant="body2">
                                                        <b>Due Date:</b> {audit.dueDate}
                                                    </Typography>
                                                </Grid>

                                            </Grid>

                                            <Box
                                                sx={{
                                                    mt: 2,
                                                    display: "flex",
                                                    justifyContent: "space-between",
                                                    alignItems: "center",
                                                }}
                                            >
                                                <Chip
                                                    label={audit.status}
                                                    color={
                                                        audit.status === "Open"
                                                            ? "warning"
                                                            : audit.status === "Closed"
                                                                ? "success"
                                                                : audit.status === "Completed"
                                                                    ? "primary"
                                                                    : "info"
                                                    }
                                                />

                                                <Box>
                                                    <IconButton
                                                        color="primary"
                                                        onClick={() =>
                                                            navigate(
                                                                `/annexure1/${audit.id}`
                                                            )
                                                        }
                                                    >
                                                        <VisibilityIcon />
                                                    </IconButton>

                                                    {/* {!isDepot && (
                                                        <IconButton
                                                            color="error"
                                                            onClick={() =>
                                                                handleDeleteAudit(
                                                                    audit.id
                                                                )
                                                            }
                                                        >
                                                            <DeleteIcon />
                                                        </IconButton>
                                                    )} */}

                                                    {currentUser?.role === "CQA" &&
                                                        ["Open", "In Progress"].includes(audit.status) && (
                                                            <IconButton
                                                                color="error"
                                                                onClick={() =>
                                                                    handleDeleteAudit(
                                                                        audit.id
                                                                    )
                                                                }
                                                            >
                                                                <DeleteIcon />
                                                            </IconButton>
                                                        )}
                                                </Box>
                                            </Box>

                                        </CardContent>
                                    </Card>
                                ))}
                            </Box>

                        ) : (

                            <Box
                                sx={{
                                    width: "100%",
                                    minWidth: 0,
                                    overflowX: "auto",
                                }}
                            >
                                <DataGrid
                                    rowHeight={52}
                                    rows={filteredAudits}
                                    columns={columns}
                                    pageSizeOptions={[5, 10, 20]}
                                    disableRowSelectionOnClick
                                    autoHeight
                                    sx={{
                                        border: 0,

                                        "& .MuiDataGrid-columnHeaders": {
                                            backgroundColor: "#f5f5f5",
                                            fontWeight: 700,
                                        },
                                    }}
                                />
                            </Box>

                        )}

                    </div>
                    {/* </Box> */}
                </CardContent>
            </Card>
        </Box >
    );
}