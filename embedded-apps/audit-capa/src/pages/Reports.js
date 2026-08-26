import {
    Box,
    Grid,
    Card,
    CardContent,
    Typography,
} from "@mui/material";
import emamiLogo from '../assets/emami-logo.jpg';
import {
    PieChart,
    Pie,
    Cell,
    ResponsiveContainer,
    Tooltip,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
} from "recharts";

import {
    Tabs,
    Tab,
    Table,
    TableHead,
    TableBody,
    TableRow,
    TableCell,
    TableContainer,
    Paper,
} from "@mui/material";

import { useState, useEffect } from "react";

import {
    useAppContext,
} from "../context/AppContext";

import { getCAPAs } from "../utils/storage";

import {
    getCertification,
} from "../utils/certificationUtils";

export default function Reports() {

    const { audits } =
        useAppContext();

    const [capaRecords, setCapaRecords] = useState([]);

    useEffect(() => {
        getCAPAs()
            .then(setCapaRecords)
            .catch((error) => console.error("Unable to load CAPAs:", error));
    }, []);

    const [tab, setTab] = useState(0);

    const certificationData = [
        {
            name: "Platinum",
            value: audits.filter(
                a => Number(a.compliance) >= 95
            ).length,
        },
        {
            name: "Gold",
            value: audits.filter(
                a =>
                    Number(a.compliance) >= 90 &&
                    Number(a.compliance) < 95
            ).length,
        },
        {
            name: "Silver",
            value: audits.filter(
                a =>
                    Number(a.compliance) >= 80 &&
                    Number(a.compliance) < 90
            ).length,
        },
        {
            name: "Bronze",
            value: audits.filter(
                a =>
                    Number(a.compliance) >= 70 &&
                    Number(a.compliance) < 80
            ).length,
        },
        {
            name: "No Certificate",
            value: audits.filter(
                a => Number(a.compliance) < 70
            ).length,
        },
    ];

    const complianceData = [
        {
            grade: "Excellent",
            count: audits.filter(
                a => Number(a.compliance) >= 95
            ).length,
        },
        {
            grade: "Good",
            count: audits.filter(
                a =>
                    Number(a.compliance) >= 90 &&
                    Number(a.compliance) < 95
            ).length,
        },
        {
            grade: "Average",
            count: audits.filter(
                a =>
                    Number(a.compliance) >= 80 &&
                    Number(a.compliance) < 90
            ).length,
        },
        {
            grade: "Poor",
            count: audits.filter(
                a =>
                    Number(a.compliance) >= 70 &&
                    Number(a.compliance) < 80
            ).length,
        },
        {
            grade: "Fail",
            count: audits.filter(
                a => Number(a.compliance) < 70
            ).length,
        },
    ];

    const COLORS = [
        "#22C55E", // Platinum
        "#F59E0B", // Gold
        "#94A3B8", // Silver
        "#CD7F32", // Bronze
        "#EF4444", // No Certificate
    ];

    const getSummaryData = (auditType) => {

        return audits
            .filter(
                audit =>
                    audit.auditType === auditType
            )
            .map((audit) => {

                const auditCAPAs =
                    capaRecords.filter(
                        c =>
                            c.auditId ===
                            audit.id
                    );

                const findings =
                    auditCAPAs.length;

                const findingsClosed =
                    auditCAPAs.filter(
                        c =>
                            c.status ===
                            "Closed"
                    ).length;

                const closurePercentage =
                    findings > 0
                        ? (
                            (findingsClosed /
                                findings) *
                            100
                        ).toFixed(0)
                        : 0;

                const onTimeClosed =
                    auditCAPAs.filter(
                        c =>
                            c.status ===
                            "Closed" &&
                            c.closedDate &&
                            c.targetDate &&
                            new Date(
                                c.closedDate
                            ) <=
                            new Date(
                                c.targetDate
                            )
                    ).length;

                const delayedClosed =
                    findingsClosed -
                    onTimeClosed;

                const onTimeClosurePercent =
                    findingsClosed > 0
                        ? (
                            (onTimeClosed /
                                findingsClosed) *
                            100
                        ).toFixed(0)
                        : 0;

                const cert =
                    getCertification(
                        audit.compliance || 0
                    );

                return {
                    ...audit,
                    findings,
                    findingsClosed,
                    closurePercentage,
                    onTimeClosed,
                    delayedClosed,
                    onTimeClosurePercent,
                    certification:
                        cert.certification,
                    rating:
                        cert.rating,
                };
            });
    };

    const onsiteSummary =
        getSummaryData("Onsite");

    const desktopSummary =
        getSummaryData("Desktop");

    return (
        <Box
            sx={{
                maxWidth: 1400,
                mx: "auto",
            }}
        >
            {/* Header */}

            <Card
                sx={{
                    mb: 3,
                    background: "linear-gradient(135deg,#4F46E5,#6366F1)",
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
                                Reports & Analytics
                            </Typography>

                            <Typography>
                                Audit compliance,
                                CAPA performance and
                                operational insights
                            </Typography>
                        </Box>
                    </Box>
                </CardContent>
            </Card>

            <Card sx={{ mb: 3 }}>
                <CardContent>

                    <Tabs
                        value={tab}
                        onChange={(
                            e,
                            newValue
                        ) =>
                            setTab(newValue)
                        }
                    >
                        <Tab
                            label="Summary Report"
                        />

                        <Tab
                            label="Transaction Report"
                        />
                    </Tabs>

                </CardContent>
            </Card>

            {tab === 0 && (
                <>

                    {/* <BarChart data={complianceData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="grade" />
                        <YAxis />
                        <Tooltip />
                        <Bar
                            dataKey="count"
                            fill="#4F46E5"
                        />
                    </BarChart> */}
                    <Card
                        sx={{



                            borderRadius: 1,

                            mr: 2,
                            mt: 3

                        }}>
                        <CardContent>
                            <ResponsiveContainer
                                width="100%"
                                height={300}
                            >
                                <BarChart
                                    data={complianceData}
                                >
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="grade" />
                                    <YAxis />
                                    <Tooltip />
                                    <Bar
                                        dataKey="count"
                                        fill="#4F46E5"
                                    />
                                </BarChart>
                            </ResponsiveContainer>

                            <Typography
                                align="center"
                                variant="h6"
                                fontWeight={600}
                                sx={{ mt: 2 }}
                            >
                                Compliance Distribution
                            </Typography>
                        </CardContent>
                    </Card>
                    {/* <PieChart>
                        <Pie
                            data={certificationData}
                            dataKey="value"
                            label
                        >
                            {certificationData.map(
                                (entry, index) => (
                                    <Cell
                                        key={index}
                                        fill={COLORS[index]}
                                    />
                                )
                            )}
                        </Pie>
                        <Tooltip />
                    </PieChart> */}
                    <Card
                        sx={{

                            height: "100%",

                            borderRadius: 1,

                            mr: 2,
                            mt: 3

                        }}>
                        <CardContent>
                            <ResponsiveContainer
                                width="100%"
                                height={300}
                            >
                                <PieChart>
                                    <Pie
                                        data={certificationData}
                                        dataKey="value"
                                        label
                                    >
                                        {certificationData.map(
                                            (entry, index) => (
                                                <Cell
                                                    key={index}
                                                    fill={COLORS[index]}
                                                />
                                            )
                                        )}
                                    </Pie>
                                    <Tooltip />
                                </PieChart>
                            </ResponsiveContainer>
                            <Typography
                                align="center"
                                variant="h6"
                                fontWeight={600}
                                sx={{ mt: 2 }}
                            >
                                Certification Distribution
                            </Typography>

                        </CardContent>
                    </Card>

                    <Card sx={{ mt: 3, mr: 3 }}>
                        <CardContent>
                            <Typography
                                variant="h6"
                                gutterBottom
                            >
                                Certification Matrix
                            </Typography>
                            <Table>
                                <TableHead>
                                    <TableRow>
                                        <TableCell>
                                            Compliance %
                                        </TableCell>
                                        <TableCell>
                                            Grade
                                        </TableCell>
                                        <TableCell>
                                            Rating
                                        </TableCell>
                                        <TableCell>
                                            Action Required
                                        </TableCell>
                                        <TableCell>
                                            Certification
                                        </TableCell>
                                    </TableRow>
                                </TableHead>

                                <TableBody>

                                    <TableRow>
                                        <TableCell>
                                            95% - 100%
                                        </TableCell>
                                        <TableCell>
                                            Excellent
                                        </TableCell>
                                        <TableCell>
                                            ★★★★★
                                        </TableCell>
                                        <TableCell>
                                            Maintain current practices
                                        </TableCell>
                                        <TableCell>
                                            Platinum
                                        </TableCell>
                                    </TableRow>

                                    <TableRow>
                                        <TableCell>
                                            90% - 94%
                                        </TableCell>
                                        <TableCell>
                                            Good
                                        </TableCell>
                                        <TableCell>
                                            ★★★★
                                        </TableCell>
                                        <TableCell>
                                            Minor improvements recommended
                                        </TableCell>
                                        <TableCell>
                                            Gold
                                        </TableCell>
                                    </TableRow>

                                    <TableRow>
                                        <TableCell>
                                            80% - 89%
                                        </TableCell>
                                        <TableCell>
                                            Average
                                        </TableCell>
                                        <TableCell>
                                            ★★★
                                        </TableCell>
                                        <TableCell>
                                            Improvement action plan required
                                        </TableCell>
                                        <TableCell>
                                            Silver
                                        </TableCell>
                                    </TableRow>

                                    <TableRow>
                                        <TableCell>
                                            70% - 79%
                                        </TableCell>
                                        <TableCell>
                                            Poor
                                        </TableCell>
                                        <TableCell>
                                            ★★
                                        </TableCell>
                                        <TableCell>
                                            Immediate corrective action needed
                                        </TableCell>
                                        <TableCell>
                                            Bronze
                                        </TableCell>
                                    </TableRow>

                                    <TableRow>
                                        <TableCell>
                                            &lt;70%
                                        </TableCell>
                                        <TableCell>
                                            Fail
                                        </TableCell>
                                        <TableCell>
                                            ★
                                        </TableCell>
                                        <TableCell>
                                            Re-audit after major improvements
                                        </TableCell>
                                        <TableCell>
                                            No Certificate
                                        </TableCell>
                                    </TableRow>

                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>

                    {/* Onsite */}

                    <Card sx={{ mb: 3, p: 2, mt: 3 }}>
                        <CardContent>

                            <Typography
                                variant="h6"
                                sx={{
                                    mb: 2,
                                    bgcolor:
                                        "#FFF59D",
                                    p: 1,
                                }}
                            >
                                Onsite Audit Summary
                            </Typography>

                            <TableContainer
                                component={Paper}
                            >
                                <Table size="small">

                                    <TableHead>
                                        <TableRow>
                                            <TableCell>
                                                Depot
                                            </TableCell>

                                            <TableCell>
                                                Audit Date
                                            </TableCell>

                                            <TableCell>
                                                % Compliance
                                            </TableCell>

                                            <TableCell>
                                                Rating
                                            </TableCell>

                                            <TableCell>
                                                Findings
                                            </TableCell>

                                            <TableCell>
                                                Findings Closed
                                            </TableCell>

                                            <TableCell>
                                                Closure %
                                            </TableCell>

                                            <TableCell>
                                                On Time
                                            </TableCell>

                                            <TableCell>
                                                Delayed
                                            </TableCell>

                                            <TableCell>
                                                On Time %
                                            </TableCell>

                                            <TableCell>
                                                Certification
                                            </TableCell>
                                        </TableRow>
                                    </TableHead>

                                    <TableBody>

                                        {onsiteSummary.map(
                                            row => (
                                                <TableRow
                                                    key={
                                                        row.id
                                                    }
                                                >
                                                    <TableCell>
                                                        {
                                                            row.depot
                                                        }
                                                    </TableCell>

                                                    <TableCell>
                                                        {
                                                            row.auditDate
                                                        }
                                                    </TableCell>

                                                    <TableCell>
                                                        {
                                                            row.compliance
                                                        }
                                                        %
                                                    </TableCell>

                                                    <TableCell>
                                                        {
                                                            row.rating
                                                        }
                                                    </TableCell>

                                                    <TableCell>
                                                        {
                                                            row.findings
                                                        }
                                                    </TableCell>

                                                    <TableCell>
                                                        {
                                                            row.findingsClosed
                                                        }
                                                    </TableCell>

                                                    <TableCell>
                                                        {
                                                            row.closurePercentage
                                                        }
                                                        %
                                                    </TableCell>

                                                    <TableCell>
                                                        {
                                                            row.onTimeClosed
                                                        }
                                                    </TableCell>

                                                    <TableCell>
                                                        {
                                                            row.delayedClosed
                                                        }
                                                    </TableCell>

                                                    <TableCell>
                                                        {
                                                            row.onTimeClosurePercent
                                                        }
                                                        %
                                                    </TableCell>

                                                    <TableCell>
                                                        {
                                                            row.certification
                                                        }
                                                    </TableCell>
                                                </TableRow>
                                            )
                                        )}

                                    </TableBody>

                                </Table>
                            </TableContainer>

                        </CardContent>
                    </Card>

                    {/* Desktop */}

                    <Card>
                        <CardContent>

                            <Typography
                                variant="h6"
                                sx={{
                                    mb: 2,
                                    bgcolor:
                                        "#FFF59D",
                                    p: 1,
                                }}
                            >
                                Desktop Audit Summary
                            </Typography>

                            <TableContainer
                                component={Paper}
                            >
                                <Table size="small">

                                    <TableHead>
                                        <TableRow>
                                            <TableCell>
                                                Depot
                                            </TableCell>

                                            <TableCell>
                                                Audit Date
                                            </TableCell>

                                            <TableCell>
                                                % Score
                                            </TableCell>

                                            <TableCell>
                                                Rating
                                            </TableCell>

                                            <TableCell>
                                                Findings
                                            </TableCell>

                                            <TableCell>
                                                Findings Closed
                                            </TableCell>

                                            <TableCell>
                                                Closure %
                                            </TableCell>

                                            <TableCell>
                                                On Time
                                            </TableCell>

                                            <TableCell>
                                                Delayed
                                            </TableCell>

                                            <TableCell>
                                                On Time %
                                            </TableCell>

                                            <TableCell>
                                                Certification
                                            </TableCell>
                                        </TableRow>
                                    </TableHead>

                                    <TableBody>

                                        {desktopSummary.map(
                                            row => (
                                                <TableRow
                                                    key={
                                                        row.id
                                                    }
                                                >
                                                    <TableCell>
                                                        {
                                                            row.depot
                                                        }
                                                    </TableCell>

                                                    <TableCell>
                                                        {
                                                            row.auditDate
                                                        }
                                                    </TableCell>

                                                    <TableCell>
                                                        {
                                                            row.compliance
                                                        }
                                                        %
                                                    </TableCell>

                                                    <TableCell>
                                                        {
                                                            row.rating
                                                        }
                                                    </TableCell>

                                                    <TableCell>
                                                        {
                                                            row.findings
                                                        }
                                                    </TableCell>

                                                    <TableCell>
                                                        {
                                                            row.findingsClosed
                                                        }
                                                    </TableCell>

                                                    <TableCell>
                                                        {
                                                            row.closurePercentage
                                                        }
                                                        %
                                                    </TableCell>

                                                    <TableCell>
                                                        {
                                                            row.onTimeClosed
                                                        }
                                                    </TableCell>

                                                    <TableCell>
                                                        {
                                                            row.delayedClosed
                                                        }
                                                    </TableCell>

                                                    <TableCell>
                                                        {
                                                            row.onTimeClosurePercent
                                                        }
                                                        %
                                                    </TableCell>

                                                    <TableCell>
                                                        {
                                                            row.certification
                                                        }
                                                    </TableCell>
                                                </TableRow>
                                            )
                                        )}

                                    </TableBody>

                                </Table>
                            </TableContainer>

                        </CardContent>
                    </Card>

                </>
            )
            }

            {
                tab === 1 && (
                    <Card>
                        <CardContent>

                            <Typography
                                variant="h6"
                                sx={{ mb: 2 }}
                            >
                                Transaction Report
                            </Typography>

                            <TableContainer
                                component={Paper}
                            >
                                <Table size="small">

                                    <TableHead>
                                        <TableRow>
                                            <TableCell>
                                                Audit No
                                            </TableCell>

                                            <TableCell>
                                                Depot
                                            </TableCell>

                                            <TableCell>
                                                Audit Type
                                            </TableCell>

                                            <TableCell>
                                                Auditor
                                            </TableCell>

                                            <TableCell>
                                                Audit Date
                                            </TableCell>

                                            <TableCell>
                                                Compliance %
                                            </TableCell>

                                            <TableCell>
                                                Certification
                                            </TableCell>

                                            <TableCell>
                                                CAPA Count
                                            </TableCell>

                                            <TableCell>
                                                Audit Status
                                            </TableCell>
                                        </TableRow>
                                    </TableHead>

                                    <TableBody>

                                        {audits.map((audit) => {

                                            const relatedCAPAs =
                                                capaRecords.filter(
                                                    capa =>
                                                        capa.auditId ===
                                                        audit.id
                                                );

                                            const cert =
                                                getCertification(
                                                    audit.compliance || 0
                                                );

                                            return (

                                                <TableRow
                                                    key={audit.id}
                                                >
                                                    <TableCell>
                                                        {audit.auditNo}
                                                    </TableCell>

                                                    <TableCell>
                                                        {audit.depot}
                                                    </TableCell>

                                                    <TableCell>
                                                        {audit.auditType}
                                                    </TableCell>

                                                    <TableCell>
                                                        {audit.auditor}
                                                    </TableCell>

                                                    <TableCell>
                                                        {audit.auditDate}
                                                    </TableCell>

                                                    <TableCell>
                                                        {audit.compliance}%
                                                    </TableCell>

                                                    <TableCell>
                                                        {cert.certification}
                                                    </TableCell>

                                                    <TableCell>
                                                        {relatedCAPAs.length}
                                                    </TableCell>

                                                    <TableCell>
                                                        {audit.status}
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}

                                    </TableBody>

                                </Table>
                            </TableContainer>

                        </CardContent>
                    </Card>
                )
            }


            {/* KPI Section */}


            {/* CAPA Section */}



            {/* 
            <Card
                sx={{
                    mt: 3,
                    borderRadius: 3,
                    boxShadow:
                        "0px 10px 30px rgba(15,23,42,0.08)",
                }}
            >
                <CardContent>

                    <Typography
                        variant="h6"
                        gutterBottom
                    >
                        Certification Distribution
                    </Typography>

                    <Grid
                        container
                        spacing={3}
                    >

                        <Grid item xs={12} md={3}>
                            <Box>
                                <Typography
                                    fontWeight={600}
                                >
                                    Platinum
                                </Typography>

                                <LinearProgress
                                    variant="determinate"
                                    value={
                                        audits.length
                                            ? (audits.filter(
                                                a =>
                                                    Number(
                                                        a.compliance
                                                    ) >= 95
                                            ).length /
                                                audits.length) *
                                            100
                                            : 0
                                    }
                                    color="success"
                                    sx={{
                                        height: 12,
                                        borderRadius: 5,
                                        mt: 1,
                                    }}
                                />

                                <Typography
                                    sx={{ mt: 1 }}
                                >
                                    ★★★★★ (
                                    {
                                        audits.filter(
                                            a =>
                                                Number(
                                                    a.compliance
                                                ) >= 95
                                        ).length
                                    }
                                    )
                                </Typography>
                            </Box>
                        </Grid>

                        <Grid item xs={12} md={3}>
                            <Box>
                                <Typography
                                    fontWeight={600}
                                >
                                    Gold
                                </Typography>

                                <LinearProgress
                                    variant="determinate"
                                    value={
                                        audits.length
                                            ? (audits.filter(
                                                a =>
                                                    Number(
                                                        a.compliance
                                                    ) >= 90 &&
                                                    Number(
                                                        a.compliance
                                                    ) < 95
                                            ).length /
                                                audits.length) *
                                            100
                                            : 0
                                    }
                                    color="warning"
                                    sx={{
                                        height: 12,
                                        borderRadius: 5,
                                        mt: 1,
                                    }}
                                />

                                <Typography
                                    sx={{ mt: 1 }}
                                >
                                    ★★★★ (
                                    {
                                        audits.filter(
                                            a =>
                                                Number(
                                                    a.compliance
                                                ) >= 90 &&
                                                Number(
                                                    a.compliance
                                                ) < 95
                                        ).length
                                    }
                                    )
                                </Typography>
                            </Box>
                        </Grid>

                        <Grid item xs={12} md={3}>
                            <Box>
                                <Typography
                                    fontWeight={600}
                                >
                                    Silver
                                </Typography>

                                <LinearProgress
                                    variant="determinate"
                                    value={
                                        audits.length
                                            ? (audits.filter(
                                                a =>
                                                    Number(
                                                        a.compliance
                                                    ) >= 80 &&
                                                    Number(
                                                        a.compliance
                                                    ) < 90
                                            ).length /
                                                audits.length) *
                                            100
                                            : 0
                                    }
                                    color="info"
                                    sx={{
                                        height: 12,
                                        borderRadius: 5,
                                        mt: 1,
                                    }}
                                />

                                <Typography
                                    sx={{ mt: 1 }}
                                >
                                    ★★★ (
                                    {
                                        audits.filter(
                                            a =>
                                                Number(
                                                    a.compliance
                                                ) >= 80 &&
                                                Number(
                                                    a.compliance
                                                ) < 90
                                        ).length
                                    }
                                    )
                                </Typography>
                            </Box>
                        </Grid>

                        <Grid item xs={12} md={3}>
                            <Box>
                                <Typography
                                    fontWeight={600}
                                >
                                    Bronze
                                </Typography>

                                <LinearProgress
                                    variant="determinate"
                                    value={
                                        audits.length
                                            ? (audits.filter(
                                                a =>
                                                    Number(
                                                        a.compliance
                                                    ) >= 70 &&
                                                    Number(
                                                        a.compliance
                                                    ) < 80
                                            ).length /
                                                audits.length) *
                                            100
                                            : 0
                                    }
                                    color="error"
                                    sx={{
                                        height: 12,
                                        borderRadius: 5,
                                        mt: 1,
                                    }}
                                />

                                <Typography
                                    sx={{ mt: 1 }}
                                >
                                    ★★ (
                                    {
                                        audits.filter(
                                            a =>
                                                Number(
                                                    a.compliance
                                                ) >= 70 &&
                                                Number(
                                                    a.compliance
                                                ) < 80
                                        ).length
                                    }
                                    )
                                </Typography>
                            </Box>
                        </Grid>

                    </Grid>

                </CardContent>
            </Card> */}

            {/* <Card
                sx={{
                    mt: 3,
                    borderRadius: 3,
                    boxShadow:
                        "0px 10px 30px rgba(15,23,42,0.08)",
                }}
            >
                <CardContent>

                    <Typography
                        variant="h6"
                        gutterBottom
                    >
                        Certification Summary
                    </Typography>

                    <Grid
                        container
                        spacing={3}
                    >
                        {audits.map((audit) => {

                            const cert =
                                getCertification(
                                    audit.compliance || 0
                                );

                            let grade = "";
                            let actionRequired = "";

                            if (
                                audit.compliance >= 95
                            ) {
                                grade = "Excellent";

                                actionRequired =
                                    "Maintain current practices";
                            } else if (
                                audit.compliance >= 90
                            ) {
                                grade = "Good";

                                actionRequired =
                                    "Minor improvements recommended";
                            } else if (
                                audit.compliance >= 80
                            ) {
                                grade = "Average";

                                actionRequired =
                                    "Improvement action plan required";
                            } else if (
                                audit.compliance >= 70
                            ) {
                                grade = "Poor";

                                actionRequired =
                                    "Immediate corrective action needed";
                            } else {
                                grade = "Fail";

                                actionRequired =
                                    "Re-audit after major improvements";
                            } 

                            return (
                                <Grid
                                    item
                                    xs={12}
                                    md={6}
                                    key={audit.id}
                                >
                                    <Card
                                        sx={{
                                            height: "100%",
                                            borderRadius: 3,
                                            borderLeft:
                                                `6px solid ${cert.color}`,
                                        }}
                                    >
                                        <CardContent>

                                            <Typography
                                                variant="h6"
                                            >
                                                {audit.auditNo}
                                            </Typography>

                                            <Typography
                                                color="text.secondary"
                                                gutterBottom
                                            >
                                                {audit.depot}
                                            </Typography>

                                            <Grid
                                                container
                                                spacing={2}
                                            >
                                                <Grid
                                                    item
                                                    xs={6}
                                                >
                                                    <Typography
                                                        fontWeight={600}
                                                    >
                                                        Compliance
                                                    </Typography>

                                                    <Typography>
                                                        {
                                                            audit.compliance
                                                        }
                                                        %
                                                    </Typography>
                                                </Grid>

                                                <Grid
                                                    item
                                                    xs={6}
                                                >
                                                    <Typography
                                                        fontWeight={600}
                                                    >
                                                        Grade
                                                    </Typography>

                                                    <Typography>
                                                        {grade}
                                                    </Typography>
                                                </Grid>

                                                <Grid
                                                    item
                                                    xs={6}
                                                >
                                                    <Typography
                                                        fontWeight={600}
                                                    >
                                                        Rating
                                                    </Typography>

                                                    <Typography
                                                        sx={{
                                                            color:
                                                                cert.color,
                                                            fontSize:
                                                                "1.2rem",
                                                            fontWeight: 700,
                                                        }}
                                                    >
                                                        {cert.rating}
                                                    </Typography>
                                                </Grid>

                                                <Grid
                                                    item
                                                    xs={6}
                                                >
                                                    <Typography
                                                        fontWeight={600}
                                                    >
                                                        Certification
                                                    </Typography>

                                                    <Typography
                                                        sx={{
                                                            color:
                                                                cert.color,
                                                            fontWeight: 700,
                                                        }}
                                                    >
                                                        {
                                                            cert.certification
                                                        }
                                                    </Typography>
                                                </Grid>

                                                <Grid
                                                    item
                                                    xs={12}
                                                >
                                                    <Typography
                                                        fontWeight={600}
                                                    >
                                                        Action Required
                                                    </Typography>

                                                    <Typography
                                                        color="text.secondary"
                                                    >
                                                        {
                                                            actionRequired
                                                        }
                                                    </Typography>
                                                </Grid>

                                            </Grid>

                                        </CardContent>
                                    </Card>
                                </Grid>
                            );
                        })}
                    </Grid>

                </CardContent>
            </Card> */}

            {/* Lowest Compliance Audits */}

            {/* <Card
                sx={{
                    mt: 3,
                }}
            >
                <CardContent>
                    <Typography
                        variant="h6"
                        gutterBottom
                    >
                        Audit Risk Analysis
                    </Typography>

                    {sortedAudits
                        .slice(0, 5)
                        .map((audit) => (
                            <Box
                                key={audit.id}
                                sx={{
                                    mb: 3,
                                }}
                            >
                                <Typography
                                    fontWeight={600}
                                >
                                    {audit.auditNo}
                                </Typography>

                                <Typography
                                    variant="body2"
                                    color="text.secondary"
                                    sx={{ mb: 1 }}
                                >
                                    {audit.depot}
                                </Typography>

                                <LinearProgress
                                    variant="determinate"
                                    value={
                                        audit.compliance ||
                                        0
                                    }
                                    color={
                                        audit.compliance >=
                                            80
                                            ? "success"
                                            : audit.compliance >=
                                                60
                                                ? "warning"
                                                : "error"
                                    }
                                    sx={{
                                        height: 10,
                                        borderRadius: 5,
                                    }}
                                />

                                <Typography
                                    variant="body2"
                                    sx={{ mt: 1 }}
                                >
                                    Compliance :
                                    {audit.compliance || 0}
                                    %
                                </Typography>
                            </Box>
                        ))}
                </CardContent>
            </Card> */}
        </Box >
    );
}