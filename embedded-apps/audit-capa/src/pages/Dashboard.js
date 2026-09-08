import { Typography, Card, CardContent } from "@mui/material";
// import KPIBox from "../components/dashboard/KPIBox";
// import dashboardData from "../data/dashboardData";
// import audits from "../data/audits";
import { useAppContext } from "../context/AppContext";
import { useState, useEffect } from "react";
import Box from "@mui/material/Box";
import { DataGrid } from "@mui/x-data-grid";
import { getCAPAs } from "../utils/storage";
import AuditTable from "../components/audit/AuditTable";
// import AssessmentIcon from "@mui/icons-material/Assessment";
import AssignmentTurnedInIcon from "@mui/icons-material/AssignmentTurnedIn";
// import TaskIcon from "@mui/icons-material/Task";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import AssignmentLateIcon from "@mui/icons-material/AssignmentLate";
import AutorenewIcon from "@mui/icons-material/Autorenew";
import TaskAltIcon from "@mui/icons-material/TaskAlt";
// import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import ReportProblemIcon from "@mui/icons-material/ReportProblem";
// import ComplianceChart
//     from "../components/dashboard/ComplianceChart";
import emamiLogo from '../assets/emami-logo.jpg';
// import AuditStatusChart
//     from "../components/dashboard/AuditStatusChart";

// import {
//     complianceTrend,
//     auditStatusData,
// }
//     from "../data/dashboardCharts";

// const totalAudits =
//     audits.length;
// const openAudits =
//     audits.filter(
//         (a) =>
//             a.status === "Open"
//     ).length;
// One clickable segment of a compact KPI stat bar — icon badge + name + count,
// with a soft tinted background when it's the active filter.
function KpiSegment({
    icon,
    label,
    value,
    color,
    active,
    onClick,
    isLast,
}) {
    return (
        <Box
            onClick={onClick}
            sx={{
                flex: "1 1 0",
                minWidth: 150,
                display: "flex",
                alignItems: "center",
                gap: 1.25,
                px: 2,
                py: 1.5,
                cursor: "pointer",
                borderRight: isLast ? "none" : "1px solid #EEF1F6",
                bgcolor: active ? `${color}1A` : "transparent",
                transition: "background-color 0.15s ease",
                "&:hover": {
                    bgcolor: `${color}0F`,
                },
            }}
        >
            <Box
                sx={{
                    width: 34,
                    height: 34,
                    borderRadius: "10px",
                    flex: "none",
                    bgcolor: `${color}22`,
                    color,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                }}
            >
                {icon}
            </Box>

            <Box sx={{ minWidth: 0 }}>
                <Typography
                    sx={{
                        fontSize: "0.68rem",
                        fontWeight: 700,
                        letterSpacing: "0.03em",
                        textTransform: "uppercase",
                        color: "text.secondary",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                    }}
                >
                    {label}
                </Typography>

                <Typography
                    sx={{
                        fontSize: "1.3rem",
                        fontWeight: 800,
                        color: "#0F172A",
                        lineHeight: 1.15,
                    }}
                >
                    {value}
                </Typography>
            </Box>
        </Box>
    );
}

// A section's worth of segments as one continuous card.
function KpiBar({ children }) {
    return (
        <Box
            sx={{
                bgcolor: "#fff",
                borderRadius: 3,
                boxShadow: "0px 8px 20px rgba(15,23,42,0.06)",
                display: "flex",
                flexWrap: "wrap",
            }}
        >
            {children}
        </Box>
    );
}

export default function Dashboard() {

    const { audits } = useAppContext();
    const totalAudits =
        audits.length;

    const [selectedFilter, setSelectedFilter] =
        useState("All");

    const [dashboardView, setDashboardView] =
        useState("AUDITS");

    const [selectedCAPAFilter, setSelectedCAPAFilter] =
        useState("All");

    // const openAudits =
    //     audits.filter(
    //         (audit) =>
    //             audit.status === "Open"
    //     ).length;

    const openAudits =
        audits.filter(
            (audit) =>
                ["Open", "Rework Required"].includes(audit.status)
        ).length;

    const underReviewAudits =
        audits.filter(
            a =>
                [
                    "Self Assessment Submitted",
                    "Under Review"
                ].includes(a.status)
        ).length;

    const capaOpenAudits =
        audits.filter(
            a =>
                a.status === "CAPA Open"
        ).length;


    // const inProgressAudits =
    //     audits.filter(
    //         (audit) =>
    //             audit.status ===
    //             "In Progress"
    //     ).length;
    // not used.
    // const inProgressAudits =
    //     audits.filter(
    //         (audit) =>
    //             [
    //                 "In Progress",
    //                 "Self Assessment Submitted",
    //                 "Under Review"
    //             ].includes(audit.status)
    //     ).length;

    // const completedAudits =
    //     audits.filter(
    //         (audit) =>
    //             audit.status ===
    //             "Completed"
    //     ).length;
    // const completedAudits =
    //     audits.filter(
    //         (audit) =>
    //             [
    //                 "CAPA Open",
    //                 "Completed"
    //             ].includes(audit.status)
    //     ).length;

    const closedAudits =
        audits.filter(
            (audit) =>
                audit.status ===
                "Closed"
        ).length;

    const [capaRecords, setCapaRecords] = useState([]);



    // useEffect(() => {
    //     getCAPAs()
    //         .then(setCapaRecords)
    //         .catch((error) => console.error("Unable to load CAPAs:", error));
    // }, []);

    useEffect(() => {
        getCAPAs()
            .then(setCapaRecords)
            .catch((error) =>
                console.error("Unable to load CAPAs:", error)
            );
    }, [audits]);

    // const openCAPA =
    //     capaRecords.filter(
    //         c => c.status === "Open"
    //     ).length;

    const safeCapaRecords =
        Array.isArray(capaRecords)
            ? capaRecords
            : [];

    // const totalCAPA =
    //     safeCapaRecords.length;

    // const openCAPA =
    //     safeCapaRecords.filter(
    //         c => c.status === "Open"
    //     ).length;

    const openCAPA =
        safeCapaRecords.filter(
            c =>
                c.status === "Open" ||
                c.status === "Sent Back"
        ).length;

    const inProgressCAPA =
        safeCapaRecords.filter(
            c => c.status === "In Progress"
        ).length;

    const closedCAPA =
        safeCapaRecords.filter(
            c => c.status === "Closed"
        ).length;

    const totalCAPA =
        safeCapaRecords.length;

    // const inProgressCAPA =
    //     capaRecords.filter(
    //         (c) => c.status === "In Progress"
    //     ).length;

    // const closedCAPA =
    //     capaRecords.filter(
    //         (c) => c.status === "Closed"
    //     ).length;

    const overdueAudits =
        audits.filter(a => {
            if (!a.dueDate) return false;

            return new Date(a.dueDate) <
                new Date() &&
                // a.status !== "Closed";
                !["Closed", "CAPA Open"]
                    .includes(a.status)
        }).length;

    // const averageCompliance =
    //     audits.length > 0
    //         ? (
    //             audits.reduce(
    //                 (sum, audit) =>
    //                     sum +
    //                     (audit.compliance ||
    //                         0),
    //                 0
    //             ) / audits.length
    //         ).toFixed(2)
    //         : 0;

    // const filteredAudits =
    //     audits.filter((audit) => {

    //         if (
    //             selectedFilter === "All"
    //         )
    //             return true;

    //         return (
    //             audit.status ===
    //             selectedFilter
    //         );
    //     });

    let filteredAudits = audits;

    switch (selectedFilter) {

        // case "Open":
        //     filteredAudits =
        //         audits.filter(
        //             (audit) =>
        //                 audit.status === "Open"
        //         );
        //     break;
        case "Open":
            filteredAudits =
                audits.filter(
                    (audit) =>
                        ["Open", "Rework Required"]
                            .includes(audit.status)
                );
            break;

        // case "In Progress":
        //     filteredAudits =
        //         audits.filter(
        //             (audit) =>
        //                 audit.status === "In Progress"
        //         );
        //     break;
        case "In Progress":
            filteredAudits =
                audits.filter(
                    (audit) =>
                        [
                            "In Progress",
                            "Self Assessment Submitted",
                            "Under Review"
                        ].includes(audit.status)
                );
            break;

        case "Under Review":
            filteredAudits =
                audits.filter(
                    audit =>
                        [
                            "Self Assessment Submitted",
                            "Under Review"
                        ].includes(audit.status)
                );
            break;

        case "Closed":
            filteredAudits =
                audits.filter(
                    (audit) =>
                        audit.status === "Closed"
                );
            break;

        case "Open CAPA":
            filteredAudits =
                audits.filter(
                    (audit) =>
                        audit.status === "CAPA Open"
                );
            break;

        // case "Completed":
        //     filteredAudits =
        //         audits.filter(
        //             (audit) =>
        //                 audit.status === "Completed"
        //         );
        //     break;
        case "Completed":
            filteredAudits =
                audits.filter(
                    (audit) =>
                        ["CAPA Open", "Completed"]
                            .includes(audit.status)
                );
            break;

        case "Overdue":
            filteredAudits =
                audits.filter((audit) => {

                    if (!audit.dueDate)
                        return false;

                    return (
                        new Date(audit.dueDate) <
                        new Date() &&
                        // audit.status !== "Closed"
                        // !["Closed"].includes(audit.status)
                        !["Closed", "CAPA Open"]
                            .includes(audit.status)
                    );
                });
            break;

        // case "Compliance":
        //     filteredAudits =
        //         [...audits].sort(
        //             (a, b) =>
        //                 (b.compliance || 0) -
        //                 (a.compliance || 0)
        //         );
        //     break;

        default:
            filteredAudits = audits;
    }

    const filteredCAPAs =
        safeCapaRecords.filter((capa) => {

            if (selectedCAPAFilter === "All") {
                return true;
            }

            if (selectedCAPAFilter === "Open") {
                return (
                    capa.status === "Open" ||
                    capa.status === "Sent Back"
                );
            }

            if (selectedCAPAFilter === "In Progress") {
                return capa.status === "In Progress";
            }

            if (selectedCAPAFilter === "Closed") {
                return capa.status === "Closed";
            }

            return true;
        });

    const capaColumns = [
        {
            field: "capaNo",
            headerName: "CAPA Number",
            flex: 1,
        },
        {
            field: "observationArea",
            headerName: "Area",
            flex: 1,
        },
        {
            field: "observation",
            headerName: "Observation",
            flex: 2,
        },
        {
            field: "status",
            headerName: "Status",
            flex: 1,
        },
    ];




    return (
        <Box
            sx={{
                maxWidth: 1400,
                mx: "auto",
            }}
        >
            {/* <Typography
                variant="h4"
                gutterBottom
            >
                Audit & CAPA Dashboard
            </Typography> */}

            {/* <Box
                sx={{
                    mb: 3,
                }}
            >
                <Typography
                    variant="h4"
                    fontWeight={700}
                >
                    Quality Management System Dashboard
                </Typography>

                <Typography
                    color="text.secondary"
                >
                    Overview of audits, CAPA findings and compliance performance.
                </Typography>
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
                            <Typography variant="h4">
                                Dashboard
                            </Typography>

                            <Typography>
                                Overview of audits, CAPA findings and compliance performance
                            </Typography>
                        </Box>
                    </Box>
                </CardContent>
            </Card>

            <Typography
                variant="h6"
                fontWeight={700}
                sx={{
                    mt: 2,
                    mb: 2,
                    color: "#1E293B",
                }}
            >
                Audit Overview
            </Typography>

            <KpiBar>
                <KpiSegment
                    label="Total Audits"
                    value={totalAudits}
                    color="#2563EB"
                    icon={<AssignmentTurnedInIcon fontSize="small" />}
                    active={dashboardView === "AUDITS" && selectedFilter === "All"}
                    onClick={() => {
                        setDashboardView("AUDITS");
                        setSelectedFilter("All");
                    }}
                />

                <KpiSegment
                    label="Open Audits"
                    value={openAudits}
                    color="#F59E0B"
                    icon={<AssignmentLateIcon fontSize="small" />}
                    active={dashboardView === "AUDITS" && selectedFilter === "Open"}
                    onClick={() => {
                        setDashboardView("AUDITS");
                        setSelectedFilter("Open");
                    }}
                />

                <KpiSegment
                    label="Under Review"
                    value={underReviewAudits}
                    color="#06B6D4"
                    icon={<AutorenewIcon fontSize="small" />}
                    active={dashboardView === "AUDITS" && selectedFilter === "Under Review"}
                    onClick={() => {
                        setDashboardView("AUDITS");
                        setSelectedFilter("Under Review");
                    }}
                />

                <KpiSegment
                    label="CAPA Open Audits"
                    value={capaOpenAudits}
                    color="#8B5CF6"
                    icon={<TaskAltIcon fontSize="small" />}
                    active={dashboardView === "AUDITS" && selectedFilter === "Open CAPA"}
                    onClick={() => {
                        setDashboardView("AUDITS");
                        setSelectedFilter("Open CAPA");
                    }}
                />

                <KpiSegment
                    label="Closed"
                    value={closedAudits}
                    color="#22C55E"
                    icon={<CheckCircleIcon fontSize="small" />}
                    active={dashboardView === "AUDITS" && selectedFilter === "Closed"}
                    onClick={() => {
                        setDashboardView("AUDITS");
                        setSelectedFilter("Closed");
                    }}
                />

                <KpiSegment
                    label="Overdue"
                    value={overdueAudits}
                    color="#EF4444"
                    icon={<ReportProblemIcon fontSize="small" />}
                    active={dashboardView === "AUDITS" && selectedFilter === "Overdue"}
                    onClick={() => {
                        setDashboardView("AUDITS");
                        setSelectedFilter("Overdue");
                    }}
                    isLast
                />
            </KpiBar>

            <Typography
                variant="h6"
                fontWeight={700}
                sx={{
                    mt: 4,
                    mb: 2,
                    color: "#1E293B",
                }}
            >
                CAPA Overview
            </Typography>

            <KpiBar>
                <KpiSegment
                    label="Total CAPA"
                    value={totalCAPA}
                    color="#7C3AED"
                    icon={<TaskAltIcon fontSize="small" />}
                    active={dashboardView === "CAPA" && selectedCAPAFilter === "All"}
                    onClick={() => {
                        setDashboardView("CAPA");
                        setSelectedCAPAFilter("All");
                    }}
                />

                <KpiSegment
                    label="Open CAPA"
                    value={openCAPA}
                    color="#DC2626"
                    icon={<WarningAmberIcon fontSize="small" />}
                    active={dashboardView === "CAPA" && selectedCAPAFilter === "Open"}
                    onClick={() => {
                        setDashboardView("CAPA");
                        setSelectedCAPAFilter("Open");
                    }}
                />

                <KpiSegment
                    label="In Progress CAPA"
                    value={inProgressCAPA}
                    color="#06B6D4"
                    icon={<AutorenewIcon fontSize="small" />}
                    active={dashboardView === "CAPA" && selectedCAPAFilter === "In Progress"}
                    onClick={() => {
                        setDashboardView("CAPA");
                        setSelectedCAPAFilter("In Progress");
                    }}
                />

                <KpiSegment
                    label="Closed CAPA"
                    value={closedCAPA}
                    color="#22C55E"
                    icon={<CheckCircleIcon fontSize="small" />}
                    active={dashboardView === "CAPA" && selectedCAPAFilter === "Closed"}
                    onClick={() => {
                        setDashboardView("CAPA");
                        setSelectedCAPAFilter("Closed");
                    }}
                    isLast
                />
            </KpiBar>

            {/* <Grid item xs={12} md={2}>
                    <Box
                        // onClick={() =>
                        // setSelectedFilter(
                        //     "Closed"
                        // )
                        onClick={() => {
                            setDashboardView("AUDITS");
                            setSelectedFilter("Closed");
                        }}


                        sx={{
                            cursor: "pointer",
                        }}
                    >
                        <KpiCard
                            title="Closed Audits"
                            value={closedAudits}
                            color="#43a047"
                            icon={
                                <CheckCircleIcon fontSize="large" />
                            }
                        />
                    </Box>
                </Grid> */}

            {/* <Grid item xs={12} md={3}>
                    <Box
                        sx={{ cursor: "pointer" }}
                        // onClick={() =>
                        //     setSelectedFilter(
                        //         "Compliance"
                        //     )
                        onClick={() => {
                            setDashboardView("AUDITS");
                            setSelectedFilter("Compliance");
                        }
                        }
                    >
                        <KpiCard
                            title="Compliance"
                            value={`${averageCompliance}%`}
                            color="#43a047"
                            icon={
                                <CheckCircleIcon fontSize="large" />
                            }
                        />
                    </Box> */}
            {/* <KpiCard
                        title="Compliance"
                        value={`${averageCompliance}%`}
                        color="#43a047"
                        icon={<CheckCircleIcon fontSize="large" />}
                    /> */}
            {/* </Grid> */}
            {/* </Grid> */}
            {/* <AuditTable audits={audits} /> */}

            {/* <Grid container spacing={3} sx={{ mt: 2 }}>
                <Grid item xs={12} md={6}>
                    <Card
                        sx={{
                            height: 180,
                            boxShadow: 3,
                        }}
                    >
                        <CardContent>
                            <Typography variant="h6">
                                Recent Audits
                            </Typography>

                            <Typography>
                                Delhi Depot Audit
                            </Typography>

                            <Typography>
                                Kolkata Desktop Audit
                            </Typography>

                            <Typography>
                                Mumbai Depot Audit
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>

                <Grid item xs={12} md={6}>
                    <Card
                        sx={{
                            height: 180,
                            boxShadow: 3,
                        }}
                    >
                        <CardContent>
                            <Typography variant="h6">
                                Open CAPA
                            </Typography>

                            <Typography>
                                CAPA/F01/08/26/0001
                            </Typography>

                            <Typography>
                                CAPA/F02/08/26/0002
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid> */}

            {/* <Grid
                container
                spacing={3}
                sx={{ mt: 2 }}
            >
                <Grid
                    item
                    xs={12}
                    md={8}
                >
                    <Card>
                        <CardContent>
                            <Typography
                                variant="h6"
                                gutterBottom
                            >
                                Compliance Trend
                            </Typography>

                            <ComplianceChart
                                data={complianceTrend}
                            />
                        </CardContent>
                    </Card>
                </Grid>

                <Grid
                    item
                    xs={12}
                    md={4}
                >
                    <Card>
                        <CardContent>
                            <Typography
                                variant="h6"
                                gutterBottom
                            >
                                Audit Status
                            </Typography>

                            <AuditStatusChart
                                data={auditStatusData}
                            />
                        </CardContent>
                    </Card>
                </Grid>
            </Grid> */}

            <Card sx={{ mt: 3 }}>
                <CardContent>
                    <Typography
                        variant="h6"
                        gutterBottom
                    >
                        {dashboardView === "AUDITS"
                            ? "Recent Audit Transactions"
                            : `${selectedCAPAFilter} CAPA Records`}
                    </Typography>


                    {/* <Typography
                        variant="h6"
                        gutterBottom
                    >
                        Recent Audit Transactions
                    </Typography> */}
                    {/* <Typography
                        color="primary"
                        sx={{ mb: 2 }}
                    >
                        Showing:
                        {" "}
                        <strong>
                            {selectedFilter}
                        </strong>
                        {" "}
                        Audits
                    </Typography> */}
                    <Typography
                        color="primary"
                        sx={{
                            mb: 2,
                            fontWeight: 600,
                        }}
                    >
                        {/* {dashboardView === "AUDITS"
                            ? `Showing ${selectedFilter} Audits`
                            : `Showing ${selectedCAPAFilter} CAPA Records`} */}
                        {dashboardView === "AUDITS"
                            ? `Showing ${selectedFilter} Audits (${filteredAudits.length})`
                            : `Showing ${selectedCAPAFilter} CAPA Records (${filteredCAPAs.length})`}
                    </Typography>
                    {/* <Typography
                        sx={{
                            mb: 2,
                            fontWeight: 600,
                            color: "#2563EB",
                        }}
                    >
                        Showing :
                        {" "}
                        {selectedFilter}
                    </Typography> */}


                    {dashboardView === "AUDITS" ? (
                        <AuditTable
                            audits={filteredAudits}
                        />
                    ) : (
                        <div
                            style={{
                                height: 500,
                                width: "100%",
                            }}
                        >
                            <DataGrid
                                // rows={capaRecords.filter(
                                //     (capa) =>
                                //         capa.status === "Open"
                                // )}
                                // rows={safeCapaRecords.filter(
                                //     capa => capa.status === "Open"
                                // )}

                                rows={filteredCAPAs}
                                // rows={safeCapaRecords.filter(
                                //     capa =>
                                //         capa.status === "Open" ||
                                //         capa.status === "Sent Back"
                                // )}
                                columns={capaColumns}
                                pageSizeOptions={[5, 10]}
                                disableRowSelectionOnClick
                            />
                        </div>
                    )}

                    {/* <AuditTable
                        audits={filteredAudits}
                    /> */}

                    {/* <AuditTable audits={audits} /> */}

                </CardContent>
            </Card>
        </Box >
    );
}