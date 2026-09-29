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
    FormControlLabel,
    Switch,
} from "@mui/material";
import AssignmentIcon from "@mui/icons-material/Assignment";
import { KpiSegment, KpiBar } from "../components/common/KpiBar";
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
import {
    deleteAudit,
    updateAudit,
    deactivateAudit,
    activateAudit,
} from "../utils/storage";
import EditIcon from "@mui/icons-material/Edit";
import { formatDate } from "../utils/dateUtils";
import {
    EditAuditDialog,
    DeactivateAuditDialog,
} from "../components/audit/AuditAdminDialogs";


// import auditsData from "../data/audits";
import { useNavigate } from "react-router-dom";
import AssignmentTurnedInIcon from "@mui/icons-material/AssignmentTurnedIn";
import AssignmentLateIcon from "@mui/icons-material/AssignmentLate";
import AutorenewIcon from "@mui/icons-material/Autorenew";
import TaskAltIcon from "@mui/icons-material/TaskAlt";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import FactCheckIcon from "@mui/icons-material/FactCheck";
import RateReviewIcon from "@mui/icons-material/RateReview";
import ReplayIcon from "@mui/icons-material/Replay";



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

    // Edit / Deactivate (CQA) and the "Show deactivated" switch.
    const [editingAudit, setEditingAudit] = useState(null);
    const [deactivatingAudit, setDeactivatingAudit] = useState(null);
    const [showDeactivated, setShowDeactivated] = useState(true);

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

    const isInactive = (audit) =>
        audit?.isActive === false;

    // Deactivated audits are shown greyed but not counted.
    const countedAudits =
        visibleAudits.filter((audit) => !isInactive(audit));

    const isCQA =
        currentUser?.role === "CQA";

    // Edit: CQA, active audit, only before CAPA is generated.
    const canEditAudit = (audit) =>
        isCQA &&
        !isInactive(audit) &&
        ["Open", "In Progress"].includes(audit.status);

    const replaceAudit = (updated) =>
        setAudits((previous) =>
            previous.map((audit) =>
                audit.id === updated.id ? updated : audit
            )
        );

    const handleSaveEdit = async (form) => {
        try {
            replaceAudit(await updateAudit(editingAudit.id, form));
            setEditingAudit(null);
            alert("Audit updated successfully.");
        } catch (error) {
            console.error(error);
            alert(error.message || "Unable to update audit.");
        }
    };

    const handleDeactivate = async (reason) => {
        try {
            replaceAudit(
                await deactivateAudit(
                    deactivatingAudit.id,
                    reason,
                    currentUser?.username || currentUser?.name || ""
                )
            );
            setDeactivatingAudit(null);
        } catch (error) {
            console.error(error);
            alert(error.message || "Unable to deactivate audit.");
        }
    };

    const handleActivate = async (audit) => {
        if (!window.confirm(`Activate audit ${audit.auditNo} again?`)) {
            return;
        }

        try {
            replaceAudit(
                await activateAudit(
                    audit.id,
                    currentUser?.username || currentUser?.name || ""
                )
            );
        } catch (error) {
            console.error(error);
            alert(error.message || "Unable to activate audit.");
        }
    };

    const renderActivationControl = (audit) =>
        isCQA ? (
            isInactive(audit) ? (
                <Button
                    size="small"
                    variant="contained"
                    color="success"
                    onClick={() => handleActivate(audit)}
                >
                    Activate
                </Button>
            ) : (
                <Button
                    size="small"
                    variant="outlined"
                    color="error"
                    onClick={() => setDeactivatingAudit(audit)}
                >
                    Deactivate
                </Button>
            )
        ) : (
            <Chip
                size="small"
                label={isInactive(audit) ? "Deactivated" : "Active"}
                color={isInactive(audit) ? "default" : "success"}
                variant="outlined"
            />
        );

    const openCount =
        countedAudits.filter(a => a.status === "Open").length;

    const inProgressCount =
        countedAudits.filter(a => a.status === "In Progress").length;

    // Desktop audits now follow the Onsite flow; hides the legacy self-assessment KPI tiles.
    const SHOW_SELF_ASSESSMENT_KPIS = false;

    const selfAssessmentCount =
        countedAudits.filter(a => a.status === "Self Assessment Submitted").length;

    const reworkRequiredCount =
        countedAudits.filter(a => a.status === "Rework Required").length;

    const capaOpenCount =
        countedAudits.filter(a => a.status === "CAPA Open").length;

    const completedCount =
        countedAudits.filter(a => a.status === "Completed").length;

    const closedCount =
        countedAudits.filter(a => a.status === "Closed").length;

    const totalAuditsCount =
        openCount +
        inProgressCount +
        selfAssessmentCount +
        reworkRequiredCount +
        capaOpenCount +
        completedCount +
        closedCount;

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

            const activeMatch =
                showDeactivated || !isInactive(audit);

            return (
                searchMatch &&
                statusMatch &&
                typeMatch &&
                kpiMatch &&
                activeMatch
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
            // Display only; the raw value is kept so sorting stays by real date.
            renderCell: (params) => formatDate(params.value),
        },
        {
            field: "dueDate",
            headerName: "Due Date",
            flex: 1,
            renderCell: (params) => formatDate(params.value),
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
                    label={`${Number(params.value || 0).toFixed(2)}%`}
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
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
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

                    {isInactive(params.row) && (
                        <Tooltip title={params.row.deactivationReason || ""}>
                            <Chip label="Deactivated" size="small" />
                        </Tooltip>
                    )}
                </Box>
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

                    {canEditAudit(params.row) && (
                        <Tooltip title="Edit Audit">
                            <IconButton
                                size={
                                    isCQATablet
                                        ? "large"
                                        : "medium"
                                }
                                color="primary"
                                onClick={() =>
                                    setEditingAudit(params.row)
                                }
                            >
                                <EditIcon />
                            </IconButton>
                        </Tooltip>
                    )}

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

        {
            field: "activation",
            headerName: "Activate / Deactivate",
            flex: 1.2,
            minWidth: 170,
            sortable: false,
            renderCell: (params) => renderActivationControl(params.row),
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
                                sx={{
                                    width: 110,
                                    height: 90,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    background: "#fff",
                                    borderRadius: 2,
                                    p: 1,
                                    boxShadow:
                                        "0px 4px 12px rgba(0,0,0,0.15)",
                                }}
                            >
                                <AssignmentIcon sx={{ fontSize: 44, color: "#7C3AED" }} />
                            </Box>
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

            <Box sx={{ mb: 3 }}>
                <KpiBar>
                    <KpiSegment
                        label="Total Audits"
                        value={totalAuditsCount}
                        color="#2563EB"
                        icon={<AssignmentTurnedInIcon fontSize="small" />}
                        active={selectedKPI === "All"}
                        onClick={() => setSelectedKPI("All")}
                    />

                    <KpiSegment
                        label="Open Audits"
                        value={openCount}
                        color="#F59E0B"
                        icon={<AssignmentLateIcon fontSize="small" />}
                        active={selectedKPI === "Open"}
                        onClick={() => setSelectedKPI("Open")}
                    />

                    <KpiSegment
                        label="In Progress"
                        value={inProgressCount}
                        color="#06B6D4"
                        icon={<AutorenewIcon fontSize="small" />}
                        active={selectedKPI === "In Progress"}
                        onClick={() => setSelectedKPI("In Progress")}
                    />

                    {/* Self-assessment statuses are only reachable by legacy Desktop
                        audits now (Desktop runs the Onsite flow), so these tiles are hidden. */}
                    {SHOW_SELF_ASSESSMENT_KPIS && (
                        <>
                            <KpiSegment
                                label="Self Assessment"
                                value={selfAssessmentCount}
                                color="#0EA5E9"
                                icon={<RateReviewIcon fontSize="small" />}
                                active={selectedKPI === "Self Assessment Submitted"}
                                onClick={() => setSelectedKPI("Self Assessment Submitted")}
                            />

                            <KpiSegment
                                label="Rework Required"
                                value={reworkRequiredCount}
                                color="#F97316"
                                icon={<ReplayIcon fontSize="small" />}
                                active={selectedKPI === "Rework Required"}
                                onClick={() => setSelectedKPI("Rework Required")}
                            />
                        </>
                    )}

                    <KpiSegment
                        label="CAPA Open"
                        value={capaOpenCount}
                        color="#7C3AED"
                        icon={<FactCheckIcon fontSize="small" />}
                        active={selectedKPI === "CAPA Open"}
                        onClick={() => setSelectedKPI("CAPA Open")}
                    />

                    <KpiSegment
                        label="Completed"
                        value={completedCount}
                        color="#8B5CF6"
                        icon={<TaskAltIcon fontSize="small" />}
                        active={selectedKPI === "Completed"}
                        onClick={() => setSelectedKPI("Completed")}
                    />

                    <KpiSegment
                        label="Closed Audits"
                        value={closedCount}
                        color="#22C55E"
                        icon={<CheckCircleIcon fontSize="small" />}
                        active={selectedKPI === "Closed"}
                        onClick={() => setSelectedKPI("Closed")}
                        isLast
                    />
                </KpiBar>
            </Box>

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

                        <FormControlLabel
                            control={
                                <Switch
                                    checked={showDeactivated}
                                    onChange={(e) =>
                                        setShowDeactivated(e.target.checked)
                                    }
                                />
                            }
                            label="Show deactivated"
                        />
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
                                            ...(isInactive(audit) && {
                                                bgcolor: "#F3F4F6",
                                                "& .MuiCardContent-root > *:not(.audit-activation)": {
                                                    opacity: 0.55,
                                                    filter: "grayscale(1)",
                                                },
                                            }),
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
                                                        <b>Due Date:</b> {formatDate(audit.dueDate)}
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

                                                    {canEditAudit(audit) && (
                                                        <IconButton
                                                            color="primary"
                                                            onClick={() =>
                                                                setEditingAudit(audit)
                                                            }
                                                        >
                                                            <EditIcon />
                                                        </IconButton>
                                                    )}

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

                                            <Box
                                                className="audit-activation"
                                                sx={{
                                                    mt: 1.5,
                                                    display: "flex",
                                                    justifyContent: "flex-end",
                                                }}
                                            >
                                                {renderActivationControl(audit)}
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
                                    getRowClassName={(params) =>
                                        isInactive(params.row)
                                            ? "audit-row-inactive"
                                            : ""
                                    }
                                    sx={{
                                        border: 0,

                                        // Deactivated: greyed out; the Activate button stays clear.
                                        "& .audit-row-inactive": {
                                            bgcolor: "#F3F4F6",
                                        },
                                        "& .audit-row-inactive .MuiDataGrid-cell:not([data-field='activation'])": {
                                            opacity: 0.5,
                                            filter: "grayscale(1)",
                                        },

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

            <EditAuditDialog
                audit={editingAudit}
                onClose={() => setEditingAudit(null)}
                onSave={handleSaveEdit}
            />

            <DeactivateAuditDialog
                audit={deactivatingAudit}
                onClose={() => setDeactivatingAudit(null)}
                onConfirm={handleDeactivate}
            />
        </Box >
    );
}