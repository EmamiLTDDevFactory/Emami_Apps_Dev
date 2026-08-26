import { Grid, Typography, Card, CardContent } from "@mui/material";
// import KPIBox from "../components/dashboard/KPIBox";
// import dashboardData from "../data/dashboardData";
// import audits from "../data/audits";
import { useAppContext } from "../context/AppContext";
import { useState, useEffect } from "react";
import Box from "@mui/material/Box";
import { DataGrid } from "@mui/x-data-grid";
import { getCAPAs } from "../utils/storage";
import AuditTable from "../components/audit/AuditTable";
import KpiCard from "../components/dashboard/KPIBox";
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
export default function Dashboard() {

    const { audits } = useAppContext();
    const totalAudits =
        audits.length;

    const [selectedFilter, setSelectedFilter] =
        useState("All");

    const [dashboardView, setDashboardView] =
        useState("AUDITS");

    const openAudits =
        audits.filter(
            (audit) =>
                audit.status === "Open"
        ).length;

    const inProgressAudits =
        audits.filter(
            (audit) =>
                audit.status ===
                "In Progress"
        ).length;

    const completedAudits =
        audits.filter(
            (audit) =>
                audit.status ===
                "Completed"
        ).length;

    const closedAudits =
        audits.filter(
            (audit) =>
                audit.status ===
                "Closed"
        ).length;

    const [capaRecords, setCapaRecords] = useState([]);

    useEffect(() => {
        getCAPAs()
            .then(setCapaRecords)
            .catch((error) => console.error("Unable to load CAPAs:", error));
    }, []);

    // const openCAPA =
    //     capaRecords.filter(
    //         c => c.status === "Open"
    //     ).length;

    const safeCapaRecords =
        Array.isArray(capaRecords)
            ? capaRecords
            : [];

    const openCAPA =
        safeCapaRecords.filter(
            c => c.status === "Open"
        ).length;


    const inProgressCAPA =
        capaRecords.filter(
            (c) => c.status === "In Progress"
        ).length;

    const closedCAPA =
        capaRecords.filter(
            (c) => c.status === "Closed"
        ).length;

    const overdueAudits =
        audits.filter(a => {
            if (!a.dueDate) return false;

            return new Date(a.dueDate) <
                new Date() &&
                a.status !== "Closed";
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

        case "Open":
            filteredAudits =
                audits.filter(
                    (audit) =>
                        audit.status === "Open"
                );
            break;

        case "In Progress":
            filteredAudits =
                audits.filter(
                    (audit) =>
                        audit.status === "In Progress"
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
                        audit.status === "Open"
                );
            break;

        case "Completed":
            filteredAudits =
                audits.filter(
                    (audit) =>
                        audit.status === "Completed"
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
                        audit.status !== "Closed"
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
                    background: "linear-gradient(135deg,#4F46E5,#6366F1)",
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
                                width: 90,
                                height: 90,
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

            <Grid container spacing={4}>
                <Grid item xs={12} sm={6} md={3} lg={3}>
                    <Box
                        onClick={() => {
                            setDashboardView("AUDITS");
                            setSelectedFilter("All");
                        }}
                        // onClick={() =>
                        //     setSelectedFilter("Open")
                        // }
                        sx={{
                            cursor: "pointer",
                        }}
                    >
                        <KpiCard
                            title="Total Audits"
                            value={totalAudits}
                            color="#2563EB"
                            icon={
                                <AssignmentTurnedInIcon fontSize="large" />
                            }
                        />
                    </Box>
                    {/* <KpiCard
                        title="Total Audits"
                        value={totalAudits}
                        color="#1976d2"
                        icon={
                            <AssignmentTurnedInIcon fontSize="large" />
                        }
                    /> */}
                </Grid>

                <Grid item xs={12} sm={6} md={3} lg={3}>
                    <Box
                        // onClick={() =>
                        //     setSelectedFilter("Open")
                        // }
                        onClick={() => {
                            setDashboardView("AUDITS");
                            setSelectedFilter("Open");
                        }}
                        sx={{
                            cursor: "pointer",
                        }}
                    >
                        <KpiCard
                            title="Open Audits"
                            value={openAudits}
                            color="#F59E0B"
                            icon={
                                <AssignmentLateIcon fontSize="large" />
                            }
                        />
                    </Box>
                    {/* <KpiCard
                        title="Open Audits"
                        value={
                            openAudits
                        }
                        // value={openAudits}
                        color="#ff9800"
                        icon={<AssessmentIcon fontSize="large" />}
                    /> */}
                </Grid>

                <Grid item xs={12} sm={6} md={3} lg={3}>
                    <Box
                        onClick={() => {
                            setDashboardView("AUDITS");
                            setSelectedFilter("In Progress");
                        }
                        }
                        sx={{
                            cursor: "pointer",
                        }}
                    >
                        <KpiCard
                            title="In Progress"
                            value={inProgressAudits}
                            color="#06B6D4"
                            icon={
                                <AutorenewIcon fontSize="large" />
                            }
                        />
                    </Box>
                </Grid>

                <Grid item xs={12} sm={6} md={3} lg={3}>
                    <Box
                        // onClick={() =>
                        // setSelectedFilter(
                        //     "Closed"
                        // )
                        onClick={() => {
                            setDashboardView("AUDITS");
                            setSelectedFilter("Completed");
                        }}


                        sx={{
                            cursor: "pointer",
                        }}
                    >
                        <KpiCard
                            title="Completed"
                            value={completedAudits}
                            color="#8B5CF6"
                            icon={
                                <TaskAltIcon fontSize="large" />
                            }
                        />
                    </Box>
                </Grid>

                <Grid item xs={12} sm={6} md={3} lg={3}>
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
                            title="Closed"
                            value={closedAudits}
                            color="#22C55E"
                            icon={
                                <CheckCircleIcon fontSize="large" />
                            }
                        />
                    </Box>
                </Grid>

                <Grid item xs={12} sm={6} md={3} lg={3}>
                    <Box
                        onClick={() => {
                            setDashboardView("AUDITS");
                            setSelectedFilter("Overdue");
                        }}
                        sx={{
                            cursor: "pointer",
                        }}
                    >
                        <KpiCard
                            title="Overdue"
                            value={overdueAudits}
                            color="#EF4444"
                            icon={
                                <ReportProblemIcon fontSize="large" />
                            }
                        />
                    </Box>
                </Grid>



                <Grid item xs={12} sm={6} md={3} lg={3}>
                    <Box
                        sx={{ cursor: "pointer" }}
                        // onClick={() =>
                        //     setSelectedFilter(
                        //         "Open CAPA"
                        //     )
                        onClick={() =>
                            setDashboardView("CAPA")
                        }

                    >
                        <KpiCard
                            title="Open CAPA"
                            value={openCAPA}
                            color="#DC2626"
                            icon={
                                <WarningAmberIcon fontSize="large" />
                            }
                        />
                    </Box>
                    {/* <KpiCard
                        title="Open CAPA"
                        value={openCAPA}
                        // value = "2"
                        // value={
                        //     audits.reduce(
                        //         (count, audit) => {
                        //             if (audit.status === "Open") {
                        //                 return count + 1;
                        //             }
                        //             return count;
                        //         },
                        //         0
                        //     )
                        // }
                        color="#e53935"
                        icon={<WarningAmberIcon fontSize="large" />}
                    /> */}
                </Grid>

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
            </Grid>
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
                            : "Open CAPA Records"}
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
                        {dashboardView === "AUDITS"
                            ? `Showing ${selectedFilter} Audits`
                            : "Showing Open CAPA Records"}
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
                                rows={safeCapaRecords.filter(
                                    capa => capa.status === "Open"
                                )}
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
        </Box>
    );
}