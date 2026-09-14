import {
    Box,
    Card,
    CardContent,
    Typography,
    TextField,
    Button,
    Grid,
} from "@mui/material";
import Chip from "@mui/material/Chip";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import AssignmentTurnedInIcon from "@mui/icons-material/AssignmentTurnedIn";
import { KpiSegment, KpiBar } from "../components/common/KpiBar";
// import {
//     generateCAPA,
// } from "../utils/capaGenerator";
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogContentText,
    DialogActions,
} from "@mui/material";
import {
    addNotification,
} from "../utils/notifications";
import {
    notifyCapaSet,
    SAP_FLAG,
} from "../utils/sapNotify";
import {
    saveCAPAs,
    updateAudit,
    updateCAPA,
    uploadCAPAEvidence,
    downloadCAPAEvidence,
} from "../utils/storage";
// import tab from "@mui/material/Tab";
// import { useState } from "react";
// import { useState } from "react";
import {
    useState,
    useEffect,
} from "react";
import { useSearchParams, useParams } from "react-router-dom";
import { LocalizationProvider }
    from "@mui/x-date-pickers";
import dayjs from "dayjs";
import {
    Select,
    MenuItem,
} from "@mui/material";

import { AdapterDayjs }
    from "@mui/x-date-pickers/AdapterDayjs";

import { DatePicker }
    from "@mui/x-date-pickers";
import {
    getCAPAs,
    getEvidenceUrl,
} from "../utils/storage";

import {
    useAppContext
} from "../context/AppContext";

import SearchIcon from "@mui/icons-material/Search";
import InputAdornment from "@mui/material/InputAdornment";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import AutorenewIcon from "@mui/icons-material/Autorenew";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import AccessTimeFilledIcon from "@mui/icons-material/AccessTimeFilled";

// const capaData = [
//     {
//         id: 1,
//         capaNo: "CAPA/F01/08/26/0001",
//         observationArea:
//             "Building / Premises",
//         observation:
//             "Godown size not adequate",
//         status: "Open",
//     },
// ];

// const capaData =
//   JSON.parse(
//     localStorage.getItem(
//       "capaRecords"
//     )
//   ) || [];
// const capaData = getCAPAs();



export default function CAPAManagement() {
    // const [tab, setTab] = useState(1);
    // const capaData = getCAPAs();

    // const [searchParams] =
    //     useSearchParams();
    const { auditId } = useParams();
    const [tab, setTab] =
        useState(1);

    const [searchParams] =
        useSearchParams();



    useEffect(() => {

        const tabFromUrl =
            searchParams.get("tab");

        console.log(
            "Tab from URL:",
            tabFromUrl
        );

        if (tabFromUrl === "open") {
            setTab(0);
        }
        else if (
            tabFromUrl === "closed"
        ) {
            setTab(2);
        }
        else if (
            tabFromUrl === "delayed"
        ) {
            setTab(3);
        }
        else {
            setTab(1);
        }

    }, [searchParams]);

    // const tabFromUrl =
    //     searchParams.get("tab");

    // const getInitialTab = () => {

    //     if (tabFromUrl === "open")
    //         return 0;

    //     if (tabFromUrl === "closed")
    //         return 2;

    //     if (tabFromUrl === "delayed")
    //         return 3;

    //     return 1; // In Progress
    // };

    // const [tab, setTab] =
    //     useState(getInitialTab());

    // const [fileName, setFileName] =
    //     useState("");
    const [capaData, setCapaData] =
        useState([]);

    // const [evidenceFile, setEvidenceFile] = useState(null);
    const [evidenceFiles, setEvidenceFiles] = useState({});
    // const [evidenceCAPAId, setEvidenceCAPAId] = useState(null);
    const [uploadingEvidence, setUploadingEvidence] = useState(false);

    useEffect(() => {
        const loadCAPAs = async () => {
            try {
                const data = await getCAPAs(auditId);
                console.log("CAPAS", auditId, data);
                setCapaData(data);
            } catch (error) {
                console.error("Unable to load CAPAs:", error);
            }
        };

        if (auditId) {
            loadCAPAs();
        }
    }, [auditId]);


    const [openDialog, setOpenDialog] =
        useState(false);

    const [selectedCAPA, setSelectedCAPA] =
        useState(null);

    const { setAudits, audits } =
        useAppContext();

    const getAuditNo = (id) =>
        audits?.find((a) => String(a.id) === String(id))?.auditNo || "";

    const currentUser = JSON.parse(
        localStorage.getItem(
            "currentUser"
        )
    );

    const isDepot =
        currentUser?.role === "Depot";

    // const refreshCAPAs = async () => {
    //     const data = await getCAPAs(auditId);
    //     setCapaData(data);
    // };

    const refreshCAPAs = async () => {
        if (!auditId) {
            return;
        }
        const data = await getCAPAs(auditId);
        setCapaData(data);
    };

    const handleSaveDraft = async (
        capaId,
        field,
        value
    ) => {

        const updatedCAPA =
            capaData.map((item) =>
                item.id === capaId
                    ? {
                        ...item,
                        [field]: value,
                    }
                    : item
            );

        setCapaData(updatedCAPA);

        try {
            await updateCAPA(
                capaId,
                {
                    [field]: value,
                }
            );
        } catch (error) {
            console.error("Unable to Save CAPA:", error);
        }

        // saveCAPAs(updatedCAPA).catch((error) =>
        //     console.error("Unable to save CAPA:", error)
        // );
    };
    const handleStatusChange = async (
        capaId,
        newStatus
    ) => {

        const updatedCAPA =
            capaData.map((item) =>
                item.id === capaId
                    ? {
                        ...item,
                        status: newStatus,
                    }
                    : item
            );

        setCapaData(updatedCAPA);

        try {
            await updateCAPA(
                capaId,
                {
                    status: newStatus,
                }
            );

            await refreshCAPAs();
            // const refreshedCAPAs =
            //     await getCAPAs();

            // setCapaData(refreshedCAPAs);
        } catch (error) {
            console.error(error);
        }

        // saveCAPAs(updatedCAPA).catch((error) =>
        //     console.error("Unable to save CAPA:", error)
        // );
    };

    const handleCloseCAPA = (id) => {
        setSelectedCAPA(id);
        setOpenDialog(true);
    };

    // const confirmCloseCAPA = () => {

    //     updateCAPAStatus(
    //         selectedCAPA,
    //         "Closed"
    //     );

    //     const updatedCAPA =
    //         capaData.map((item) =>
    //             item.id === selectedCAPA
    //                 ? {
    //                     ...item,
    //                     status: "Closed",
    //                 }
    //                 : item
    //         );

    //     const allClosed =
    //         updatedCAPA.every(
    //             (item) =>
    //                 item.status === "Closed"
    //         );

    //     if (allClosed) {

    //         const audits =
    //             JSON.parse(
    //                 localStorage.getItem(
    //                     "audits"
    //                 )
    //             ) || [];

    //         const updatedAudits =
    //             audits.map((audit) => ({
    //                 ...audit,
    //                 status: "Closed",
    //             }));

    //         localStorage.setItem(
    //             "audits",
    //             JSON.stringify(updatedAudits)
    //         );
    //     }


    //     setOpenDialog(false);
    //     setSelectedCAPA(null);
    // };

    const confirmCloseCAPA = async () => {

        const updatedCAPA =
            capaData.map((item) =>
                item.id === selectedCAPA
                    ? {
                        ...item,
                        status: "Closed",
                    }
                    : item
            );


        // setCapaData(updatedCAPA);
        try {
            await updateCAPA(
                selectedCAPA,
                {
                    status: "Closed",
                }
            );
            await refreshCAPAs();
        } catch (error) {
            console.error("Unable to save CAPA:", error);
            return;
        }

        // saveCAPAs(updatedCAPA).catch((error) =>
        //     console.error("Unable to save CAPA:", error)
        // );

        const closedCAPA =
            updatedCAPA.find(
                (c) =>
                    c.id === selectedCAPA
            );

        const auditId =
            closedCAPA?.auditId;

        const remainingOpenCAPA =
            updatedCAPA.filter(
                (c) =>
                    c.auditId === auditId &&
                    c.status !== "Closed"
            );

        if (
            remainingOpenCAPA.length === 0
        ) {

            try {
                const updatedAudit = await updateAudit(auditId, {
                    status: "Closed",
                });

                setAudits((previous) =>
                    previous.map((audit) =>
                        audit.id === auditId ? updatedAudit : audit
                    )
                );
            } catch (error) {
                console.error("Unable to close audit:", error);
            }
        }

        setOpenDialog(false);
        setSelectedCAPA(null);

        await addNotification({

            role: "Depot",

            auditId: auditId,

            title:
                "CAPA Accepted & Closed",

            message:
                `CAPA ${closedCAPA?.capaNo}
         has been accepted and closed.`,

            link:
                `/capa/${auditId}?tab=closed`,
            // eventType: "CAPA_ACCEPTED"
        });

        // Notify SAP (NGD) so it can trigger the depot email off the Flag.
        const openAfterClose = updatedCAPA.filter(
            (c) => c.status === "Open" || c.status === "Sent Back"
        ).length;

        notifyCapaSet({
            flag: SAP_FLAG.CAPA_ACCEPTED_CLOSED,
            auditNo: getAuditNo(auditId),
            findingNo: closedCAPA?.findingNo,
            capaId: closedCAPA?.capaNo,
            totalCapa: updatedCAPA.length,
            capaSubm: updatedCAPA.length - openAfterClose,
            capaOpen: openAfterClose,
            email: currentUser?.email ?? "",
        });

    };

    // const canSubmitCAPA = (item) => {
    //     return Boolean(
    //         item.rootCause?.trim() &&
    //         item.preventiveAction?.trim() &&
    //         item.targetDate &&
    //         evidenceFiles[item.id]
    //     );
    // };

    const canSubmitCAPA = (item) => {

        const hasEvidence =
            Boolean(
                evidenceFiles[item.id] ||
                item.evidenceFilePath
            );

        return Boolean(
            item.rootCause?.trim() &&
            item.preventiveAction?.trim() &&
            item.targetDate &&
            hasEvidence
        );
    };

    const handleSubmitCAPA = async (item) => {
        const evidenceFile = evidenceFiles[item.id];

        if (!evidenceFile) {
            alert("Please attach evidence before submitting the CAPA.");
            return;
        }

        if (!canSubmitCAPA(item)) {
            alert(
                "Root Cause, Preventive Action and Target Date are mandatory."
            );
            return;
        }

        try {

            setUploadingEvidence(true);

            // 1. Update CAPA information
            await updateCAPA(
                item.id,
                {
                    rootCause: item.rootCause,
                    preventiveAction: item.preventiveAction,
                    targetDate: item.targetDate,
                    status: "In Progress",
                    submittedDate: new Date().toISOString(),
                }
            );

            // 2. Upload evidence
            await uploadCAPAEvidence(
                item.id,
                evidenceFile,
                "Depot"
            );

            // 3. Reload CAPAs from backend
            await refreshCAPAs();

            // 4. Clear selected file
            // setEvidenceFile(null);

            setEvidenceFiles((previous) => {
                const updated = { ...previous };
                delete updated[item.id];
                return updated;
            });

            // setEvidenceCAPAId(null);

            alert(
                "CAPA submitted successfully."
            );

            // 5. Notification to CQA
            await addNotification({

                role: "CQA",

                auditId: item.auditId,

                title: "CAPA Submitted",

                message:
                    `CAPA ${item.capaNo} has been submitted by Depot with evidence.`,

                link:
                    `/capa/${item.auditId}`,
                // eventType: "CAPA_SUBMITTED",
            });

            // Notify SAP (NGD) so it can trigger the CQA email off the Flag.
            const freshCapas = await getCAPAs(item.auditId);
            const openAfterSubmit = freshCapas.filter(
                (c) => c.status === "Open" || c.status === "Sent Back"
            ).length;

            notifyCapaSet({
                flag: SAP_FLAG.CAPA_SUBMITTED,
                auditNo: getAuditNo(item.auditId),
                findingNo: item.findingNo,
                capaId: item.capaNo,
                totalCapa: freshCapas.length,
                capaSubm: freshCapas.length - openAfterSubmit,
                capaOpen: openAfterSubmit,
                // SAP's UsrId is capped at 12 chars — send just the depot name
                // ("Bangalore" not "Bangalore Depot") so it never needs truncating.
                usrId: currentUser?.depot?.replace(/\s*Depot$/i, "") ?? "",
                email: currentUser?.email ?? "",
            });

        } catch (error) {

            console.error(
                "CAPA submission failed:",
                error
            );

            alert(
                error.message ||
                "Unable to submit CAPA."
            );

        } finally {

            setUploadingEvidence(false);
        }
    };

    const updateCAPAStatus = (
        capaId,
        status
    ) => {

        const updatedCAPA =
            capaData.map((item) =>
                item.id === capaId
                    ? {
                        ...item,
                        status,
                    }
                    : item
            );

        setCapaData(updatedCAPA);

        saveCAPAs(updatedCAPA).catch((error) =>
            console.error("Unable to save CAPA:", error)
        );
    };

    // const handleStatusChange = (
    //     capaId,
    //     newStatus
    // ) => {

    //     const updatedCAPA =
    //         capaData.map((item) =>
    //             item.id === capaId
    //                 ? {
    //                     ...item,
    //                     status: newStatus,
    //                 }
    //                 : item
    //         );

    //     localStorage.setItem(
    //         "capaRecords",
    //         JSON.stringify(updatedCAPA)
    //     );

    //     window.location.reload();
    // };

    const isDelayed = (item) => {

        if (
            !item.targetDate ||
            !item.submittedDate
        ) {
            return false;
        }

        return (
            new Date(item.submittedDate) >
            new Date(item.targetDate)
        );
    };

    const filteredCAPA =
        capaData.filter((item) => {

            // if (tab === 0)
            //     return item.status === "Open";
            if (tab === 0)
                return (
                    item.status === "Open" ||
                    item.status === "Sent Back"
                );

            if (tab === 1)
                return item.status === "In Progress";

            if (tab === 2)
                return item.status === "Closed";

            if (tab === 3)
                return isDelayed(item);

            // if (tab === 3)
            //     return item.status === "Overdue";

            return true;
        });

    // const openCount =
    //     capaData.filter(
    //         c => c.status === "Open"
    //     ).length;
    const openCount =
        capaData.filter(
            c =>
                c.status === "Open" ||
                c.status === "Sent Back"
        ).length;

    const inProgressCount =
        capaData.filter(
            c => c.status === "In Progress"
        ).length;

    const closedCount =
        capaData.filter(
            c => c.status === "Closed"
        ).length;



    const delayedCount =
        capaData.filter(
            (item) =>
                isDelayed(item)
        ).length;



    const handleSendBackCAPA = async (
        capaId
    ) => {

        const updatedCAPA =
            capaData.map((item) =>
                item.id === capaId
                    ? {
                        ...item,
                        status: "Sent Back",
                    }
                    : item
            );

        setCapaData(updatedCAPA);

        await updateCAPA(
            capaId,
            {
                status: "Sent Back",
            }
        );
        await refreshCAPAs();
        // saveCAPAs(updatedCAPA).catch((error) =>
        //     console.error("Unable to save CAPA:", error)
        // );

        const selected =
            updatedCAPA.find(
                c => c.id === capaId
            );

        await addNotification({

            role: "Depot",

            auditId:
                selected.auditId,

            title:
                "CAPA Sent Back",

            message:
                `${selected.capaNo}
             has been sent back by CQA.
             Please review and resubmit.`,

            link:
                `/capa/${selected.auditId}?tab=open`,
            // eventType: "CAPA_SENT_BACK"
        });

        // Notify SAP (NGD) so it can trigger the depot email off the Flag.
        const openAfterSendBack = updatedCAPA.filter(
            (c) => c.status === "Open" || c.status === "Sent Back"
        ).length;

        notifyCapaSet({
            flag: SAP_FLAG.CAPA_SENT_BACK,
            auditNo: getAuditNo(selected.auditId),
            findingNo: selected?.findingNo,
            capaId: selected?.capaNo,
            totalCapa: updatedCAPA.length,
            capaSubm: updatedCAPA.length - openAfterSendBack,
            capaOpen: openAfterSendBack,
            email: currentUser?.email ?? "",
        });

        alert(
            "CAPA sent back."
        );
    };


    return (
        <Box
            sx={{
                maxWidth: 1400,
                mx: "auto",
            }}
        >

            {/* const overdueCount =
  capaData.filter(
    c => c.status === "Overdue"
  ).length; */}


            {/* <Typography
        variant="h4"
        gutterBottom
      >
        CAPA Management
      </Typography> */}
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
                            <AssignmentTurnedInIcon sx={{ fontSize: 44, color: "#7C3AED" }} />
                        </Box>
                        <Box>
                            <Typography variant="h4">
                                CAPA Management
                            </Typography>

                            <Typography >
                                Manage corrective and preventive actions
                            </Typography>
                        </Box>
                    </Box>
                </CardContent>
            </Card>



            {/* <Card sx={{ mb: 3 }}>
                <CardContent>
                    <Tabs
                        value={tab}
                        onChange={(e, value) =>
                            setTab(value)
                        }
                    >
                        <Tab label={`Open (${openCount})`} />
                        <Tab label={`In Progress (${inProgressCount})`} />
                        <Tab label={`Closed (${closedCount})`} />
                        <Tab label={`Delayed (${delayedCount})`} />
                    </Tabs>

                </CardContent>
            </Card> */}


            {/* <TextField
                fullWidth
                label="Search CAPA"
            /> */}

            {/* <TextField
                fullWidth
                label="Search CAPA"
                sx={{ mb: 3 }}
            /> */}




            {/* <Grid container spacing={3} sx={{ mb: 3 }}>
                <Grid item xs={12} sm={4} md={4}>
                    <Card
                        sx={{
                            height: 130,
                            display: "flex",
                            alignItems: "center",
                        }}
                    >
                        <CardContent>
                            <Typography color="text.secondary">
                                Open
                            </Typography>

                            <Typography variant="h4" fontWeight="bold">
                                {openCount}
                            </Typography>

                        </CardContent>
                    </Card>
                </Grid>

                <Grid item xs={12} sm={4} md={4}>
                    <Card
                        sx={{
                            height: 130,
                            display: "flex",
                            alignItems: "center",
                        }}
                    >
                        <CardContent>
                            <Typography color="text.secondary">
                                In Progress
                            </Typography>
                            <Typography variant="h4" fontWeight="bold">
                                {inProgressCount}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>

                <Grid item xs={12} sm={4} md={4}>
                    <Card
                        sx={{
                            height: 130,
                            display: "flex",
                            alignItems: "center",
                        }}
                    >
                        <CardContent>
                            <Typography color="text.secondary">
                                Closed
                            </Typography>
                            <Typography variant="h4" fontWeight="bold">
                                {closedCount}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>

                <Grid item xs={12} sm={4} md={3}>
                    <Card
                        sx={{
                            height: 130,
                            display: "flex",
                            alignItems: "center",

                        }}
                    >
                        <CardContent>
                            <Typography
                                color="text.secondary"
                            >
                                Delayed CAPA
                            </Typography>

                            <Typography
                                variant="h4"
                                color="warning.main"
                                fontWeight="bold"
                            >
                                {delayedCount}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid> */}


            {/* <Grid item xs={12} md={3}>
                    <Card>
                        <CardContent>
                            <Typography>
                                Overdue
                            </Typography>

                            <Typography variant="h4">
                                {overdueCount}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid> */}
            {/* </Grid> */}


            <Box
                sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",

                    gap: 2,
                    mb: 3,
                    flexWrap: "wrap",
                }}
            >
                <Box sx={{ mb: 3, width: "100%" }}>
                    <KpiBar>
                        <KpiSegment
                            label="Open"
                            value={openCount}
                            color="#F59E0B"
                            icon={<WarningAmberIcon fontSize="small" />}
                            active={tab === 0}
                            onClick={() => setTab(0)}
                        />

                        <KpiSegment
                            label="In Progress"
                            value={inProgressCount}
                            color="#06B6D4"
                            icon={<AutorenewIcon fontSize="small" />}
                            active={tab === 1}
                            onClick={() => setTab(1)}
                        />

                        <KpiSegment
                            label="Closed"
                            value={closedCount}
                            color="#22C55E"
                            icon={<CheckCircleIcon fontSize="small" />}
                            active={tab === 2}
                            onClick={() => setTab(2)}
                        />

                        <KpiSegment
                            label="Delayed"
                            value={delayedCount}
                            color="#EF4444"
                            icon={<AccessTimeFilledIcon fontSize="small" />}
                            active={tab === 3}
                            onClick={() => setTab(3)}
                            isLast
                        />
                    </KpiBar>
                </Box>
                {/* <TextField
                    size="small"
                    placeholder="Search CAPA..."
                    sx={{
                        width: 300,
                        bgcolor: "white",

                        "& .MuiOutlinedInput-root": {
                            borderRadius: 1,
                        },
                    }}
                    InputProps={{
                        startAdornment: (
                            <InputAdornment position="start">
                                <SearchIcon />
                            </InputAdornment>
                        ),

                    }}
                /> */}
                {/* <TextField
                    size="small"
                    placeholder="Search CAPA..."
                    sx={{
                        width: 260,

                        "& .MuiOutlinedInput-root": {
                            borderRadius: 8,
                            bgcolor: "#FFFFFF",
                            boxShadow:
                                "0px 2px 8px rgba(0,0,0,0.08)",

                            "& fieldset": {
                                borderColor: "#E2E8F0",
                            },

                            "&:hover fieldset": {
                                borderColor: "#7C3AED",
                            },
                        },
                    }}
                    InputProps={{
                        startAdornment: (
                            <InputAdornment position="start">
                                <SearchIcon
                                    sx={{
                                        color: "#64748B",
                                    }}
                                />
                            </InputAdornment>
                        ),
                    }}
                /> */}
            </Box>



            <Card sx={{ mb: 3 }}>
                <CardContent>
                    <Tabs
                        value={tab}
                        onChange={(e, value) =>
                            setTab(value)
                        }
                    >
                        <Tab label={`Open (${openCount})`} />
                        <Tab label={`In Progress (${inProgressCount})`} />
                        <Tab label={`Closed (${closedCount})`} />
                        <Tab label={`Delayed (${delayedCount})`} />
                    </Tabs>

                </CardContent>
            </Card>




            {/* {filteredCAPA.map((item) => ( */}
            {filteredCAPA.map((item) => {

                // const canEditCAPA =
                //     isDepot &&
                //     item.status === "Open";
                const canEditCAPA =
                    isDepot &&
                    (
                        item.status === "Open" ||
                        item.status === "Sent Back"
                    );

                return (
                    <Card
                        key={item.id}
                        sx={{
                            mb: 3,
                            borderRadius: 3,
                            boxShadow:
                                "0px 10px 30px rgba(15,23,42,0.08)",
                        }}
                    >
                        <CardContent>
                            {/* <Typography
                            variant="h6"
                        >
                            {item.capaNo}
                        </Typography> */}

                            <Box
                                sx={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    mb: 2,
                                }}
                            >
                                <Typography variant="h6">
                                    {item.capaNo}
                                </Typography>

                                {/* <Chip
                                label="Open"
                                color="warning"
                            /> */}
                                <Chip
                                    label={item.status}
                                    color={
                                        item.status === "Open"
                                            ? "warning"
                                            : item.status === "Closed"
                                                ? "success"
                                                : "info"
                                    }
                                />
                            </Box>

                            <Typography
                                sx={{
                                    mb: 2,
                                    p: 1.5,
                                    bgcolor: "#F8FAFC",
                                    borderRadius: 1,
                                    fontWeight: 500,
                                }}
                            >
                                {item.category}
                                {" > "}
                                {item.section}
                                {" > "}
                                {item.parameter}
                            </Typography>

                            {/* <Typography>
                                Observation Area:
                                {item.observationArea}
                            </Typography> */}

                            <Typography sx={{ mb: 2 }}>
                                Observation:
                                {item.observation}
                            </Typography>

                            <Grid
                                container
                                spacing={2}
                            >
                                <Grid
                                    item
                                    xs={12}
                                >
                                    <TextField
                                        label="Root Cause"
                                        fullWidth
                                        multiline
                                        rows={3}
                                        disabled={!canEditCAPA}
                                        value={item.rootCause || ""}
                                        onChange={(e) =>
                                            handleSaveDraft(
                                                item.id,
                                                "rootCause",
                                                e.target.value
                                            )
                                        }
                                    />
                                </Grid>

                                <Grid
                                    item
                                    xs={12}
                                >
                                    <TextField
                                        label="Preventive Action"
                                        fullWidth
                                        multiline
                                        rows={3}
                                        disabled={!canEditCAPA}
                                        value={item.preventiveAction || ""}
                                        onChange={(e) =>
                                            handleSaveDraft(
                                                item.id,
                                                "preventiveAction",
                                                e.target.value
                                            )
                                        }
                                    />
                                </Grid>

                                <Grid item xs={12}>

                                    <TextField
                                        label="CQA Remarks"
                                        fullWidth
                                        multiline
                                        rows={3}
                                        value={item.cqaRemarks || ""}
                                        disabled={
                                            isDepot
                                        }
                                        // InputProps={{
                                        //     readOnly: isDepot,
                                        // }}
                                        helperText={
                                            isDepot
                                                ? "Remarks provided by CQA Auditor"
                                                : "Enter review remarks"
                                        }
                                        onChange={(e) =>
                                            handleSaveDraft(
                                                item.id,
                                                "cqaRemarks",
                                                e.target.value
                                            )
                                        }
                                    />

                                </Grid>

                                {/* <Grid container spacing={2}> */}
                                <Grid
                                    item
                                    xs={12}
                                    md={6}
                                >

                                    <LocalizationProvider
                                        dateAdapter={AdapterDayjs}
                                    >
                                        {/* <DatePicker
                                        label="Target Date"
                                        slotProps={{
                                            textField: {
                                                fullWidth: true,
                                            },
                                        }}
                                    /> */}

                                        {/* <DatePicker
                                        label="Target Date"
                                        value={item.targetDate || null}
                                        onChange={(newValue) =>
                                            handleSaveDraft(
                                                item.id,
                                                "targetDate",
                                                newValue
                                            )
                                        }
                                        slotProps={{
                                            textField: {
                                                fullWidth: true,
                                                size: "small",
                                            },
                                        }}
                                    /> */}
                                        <DatePicker
                                            label="Target Date"
                                            value={
                                                item.targetDate
                                                    ? dayjs(item.targetDate)
                                                    : null
                                            }
                                            onChange={(newValue) =>
                                                handleSaveDraft(
                                                    item.id,
                                                    "targetDate",
                                                    newValue
                                                        ? newValue.toISOString()
                                                        : null
                                                )
                                            }
                                            // Calendar-only — typing a date section-by-section
                                            // could fire onChange with an invalid intermediate
                                            // value, which crashed on .toISOString().
                                            readOnly
                                            disabled={isDepot}
                                            slotProps={{
                                                textField: {
                                                    fullWidth: false,
                                                    size: "small",
                                                    disabled: !canEditCAPA,
                                                    sx: {
                                                        width: 200,
                                                        "& .MuiInputBase-root": {
                                                            height: 40,
                                                        },
                                                    },
                                                },
                                            }}
                                        />
                                    </LocalizationProvider>

                                    {/* <Grid item xs={12} md={6}> */}
                                    <Box sx={{ mt: 2 }}>
                                        <TextField
                                            label="Submission Date"
                                            fullWidth
                                            size="small"
                                            // sx={{
                                            //     mt: 2
                                            // }}
                                            value={
                                                item.submittedDate
                                                    ? new Date(
                                                        item.submittedDate
                                                    ).toLocaleDateString()
                                                    : ""
                                            }
                                            InputProps={{
                                                readOnly: true,
                                            }}
                                            sx={{
                                                width: 200,
                                                mt: 2,
                                                "& .MuiInputBase-root": {
                                                    height: 40,
                                                },
                                            }}
                                        />
                                    </Box>


                                    {/* </Grid> */}


                                    {!canSubmitCAPA(item) && (
                                        <Typography
                                            variant="caption"
                                            color="error"
                                            sx={{
                                                mt: 1,
                                                display: "block",
                                                maxWidth: 200,
                                                lineHeight: 1.4,
                                                whiteSpace: "normal",
                                            }}
                                        >
                                            Root Cause, Preventive Action and Target Date
                                            are mandatory before submission.
                                        </Typography>

                                    )}
                                    {/* <TextField
                                    type="date"
                                    label="Target Date"
                                    fullWidth
                                    InputLabelProps={{
                                        shrink: true,
                                    }}
                                /> */}
                                </Grid>

                                {/* <Grid item xs={12} md={6}>
                                    <Select
                                        fullWidth
                                        disabled={isDepot}
                                        value={item.status}
                                        onChange={(e) =>
                                            handleStatusChange(
                                                item.id,
                                                e.target.value
                                            )
                                        }
                                    >
                                        <MenuItem value="Open">
                                            Open
                                        </MenuItem>

                                        <MenuItem value="Sent Back">
                                            Sent Back
                                        </MenuItem>

                                        <MenuItem value="In Progress">
                                            In Progress
                                        </MenuItem>

                                        <MenuItem value="Closed">
                                            Closed
                                        </MenuItem>
                                    </Select>
                                </Grid> */}

                                <Grid
                                    item
                                    xs={12}
                                    md={6}
                                >
                                    {/* <Button
                                        variant="outlined"
                                        component="label"
                                        disabled={!canEditCAPA}
                                    >
                                        Upload Evidence

                                        <input
                                            hidden
                                            type="file"
                                            onChange={(e) =>
                                                setFileName(
                                                    e.target.files[0]?.name
                                                )
                                            }
                                        />
                                    </Button>
                                    <Typography
                                        color="text.secondary"
                                        sx={{ mt: 1 }}
                                    >
                                        {fileName || "No file selected"}
                                    </Typography> */}

                                    {/* <Box sx={{ mt: 3 }}> */}
                                    <Typography
                                        variant="subtitle1"
                                        fontWeight={600}
                                        sx={{ mb: 1 }}
                                    >
                                        Evidence <span style={{ color: "#DC2626" }}>*</span>
                                    </Typography>

                                    <Button
                                        variant="outlined"
                                        component="label"
                                        disabled={!canEditCAPA}
                                    >
                                        Select Evidence

                                        <input
                                            type="file"
                                            hidden
                                            accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                                            // onChange={(e) => {

                                            //     const file =
                                            //         e.target.files?.[0];

                                            //     if (!file) {
                                            //         return;
                                            //     }

                                            //     if (
                                            //         file.size >
                                            //         10 * 1024 * 1024
                                            //     ) {
                                            //         alert(
                                            //             "Evidence file size must not exceed 10 MB."
                                            //         );
                                            //         return;
                                            //     }

                                            //     setEvidenceFile(file);
                                            onChange={(e) => {

                                                const file =
                                                    e.target.files?.[0];

                                                if (!file) {
                                                    return;
                                                }

                                                if (
                                                    file.size >
                                                    10 * 1024 * 1024
                                                ) {
                                                    alert(
                                                        "Evidence file size must not exceed 10 MB."
                                                    );
                                                    return;
                                                }

                                                setEvidenceFiles((previous) => ({
                                                    ...previous,
                                                    [item.id]: file,
                                                }));

                                                // }}
                                                // setEvidenceCAPAId(item.id);
                                            }}
                                        // onChange={(e) => {
                                        //     const file = e.target.files?.[0];

                                        //     if (!file) {
                                        //         return;
                                        //     }

                                        //     if (file.size > 10 * 1024 * 1024) {
                                        //         alert(
                                        //             "Evidence file size must not exceed 10 MB."
                                        //         );
                                        //         return;
                                        //     }

                                        //     setEvidenceFile(file);
                                        // }}
                                        />
                                    </Button>

                                    {/* {evidenceFile && (
                                            <Typography
                                                variant="body2"
                                                sx={{ mt: 1 }}
                                            >
                                                Selected file:{" "}
                                                <strong>
                                                    {evidenceFile.name}
                                                </strong>
                                            </Typography>
                                        )} */}

                                    {evidenceFiles[item.id] && (
                                        <Box
                                            sx={{
                                                mt: 1.5,
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 1,
                                            }}
                                        >
                                            <Typography
                                                variant="body2"
                                                color="text.secondary"
                                            >
                                                Selected file:
                                            </Typography>

                                            <Typography
                                                variant="body2"
                                                fontWeight={600}
                                                sx={{
                                                    overflow: "hidden",
                                                    textOverflow: "ellipsis",
                                                    whiteSpace: "nowrap",
                                                    maxWidth: 350,
                                                }}
                                            >
                                                {evidenceFiles[item.id].name}
                                            </Typography>
                                        </Box>
                                    )}


                                    {item.evidenceFileName && item.evidenceFilePath && (
                                        <Box
                                            sx={{
                                                mt: 2,
                                                border: "1px solid #E5E7EB",
                                                borderRadius: 2,
                                                backgroundColor: "#FAFAFA",
                                                px: 2,
                                                py: 1.5,
                                            }}
                                        >
                                            <Box
                                                sx={{
                                                    display: "flex",
                                                    alignItems: "center",
                                                    justifyContent: "space-between",
                                                    gap: 2,
                                                    flexWrap: "wrap",
                                                }}
                                            >
                                                {/* File information */}
                                                <Box
                                                    sx={{
                                                        display: "flex",
                                                        alignItems: "center",
                                                        gap: 1.5,
                                                        minWidth: 0,
                                                        flex: 1,
                                                    }}
                                                >
                                                    <Box
                                                        sx={{
                                                            width: 38,
                                                            height: 38,
                                                            borderRadius: 1.5,
                                                            backgroundColor: "#EEF2FF",
                                                            display: "flex",
                                                            alignItems: "center",
                                                            justifyContent: "center",
                                                            flexShrink: 0,
                                                        }}
                                                    >
                                                        <Typography
                                                            sx={{
                                                                fontSize: 18,
                                                            }}
                                                        >
                                                            📎
                                                        </Typography>
                                                    </Box>

                                                    <Box
                                                        sx={{
                                                            minWidth: 0,
                                                        }}
                                                    >
                                                        <Typography
                                                            variant="body2"
                                                            fontWeight={600}
                                                            sx={{
                                                                overflow: "hidden",
                                                                textOverflow: "ellipsis",
                                                                whiteSpace: "nowrap",
                                                                maxWidth: 350,
                                                            }}
                                                        >
                                                            {item.evidenceFileName}
                                                        </Typography>

                                                        <Typography
                                                            variant="caption"
                                                            color="text.secondary"
                                                        >
                                                            Uploaded by {item.evidenceUploadedBy || "Depot"}
                                                            {item.evidenceUploadedAt &&
                                                                ` • ${new Date(
                                                                    item.evidenceUploadedAt
                                                                ).toLocaleDateString()}`}
                                                        </Typography>
                                                    </Box>
                                                </Box>

                                                {/* Actions */}
                                                <Box
                                                    sx={{
                                                        display: "flex",
                                                        gap: 1,
                                                        flexShrink: 0,
                                                    }}
                                                >
                                                    <Button
                                                        variant="outlined"
                                                        size="small"
                                                        onClick={() => {
                                                            window.open(
                                                                getEvidenceUrl(item.evidenceFilePath),
                                                                "_blank",
                                                                "noopener,noreferrer"
                                                            );
                                                        }}
                                                    >
                                                        Preview
                                                    </Button>

                                                    <Button
                                                        variant="contained"
                                                        size="small"
                                                        onClick={async () => {
                                                            try {
                                                                await downloadCAPAEvidence(
                                                                    item.evidenceFilePath,
                                                                    item.evidenceFileName
                                                                );
                                                            } catch (error) {
                                                                console.error(
                                                                    "Evidence download failed:",
                                                                    error
                                                                );

                                                                alert(
                                                                    "Unable to download evidence."
                                                                );
                                                            }
                                                        }}
                                                    >
                                                        Download
                                                    </Button>
                                                </Box>
                                            </Box>
                                        </Box>
                                    )}

                                    {/* {item.evidenceFilePath && (
                                            <Box sx={{ mt: 2 }}>

                                                <Typography
                                                    variant="body2"
                                                    fontWeight={600}
                                                    sx={{ mb: 1 }}
                                                >
                                                    Uploaded Evidence
                                                </Typography> */}



                                    {/* {canEditCAPA && !evidenceFiles[item.id] && (
                                            <Typography
                                                variant="caption"
                                                color="error"
                                                sx={{
                                                    display: "block",
                                                    mt: 1,
                                                }}
                                            >
                                                Evidence is mandatory before submitting CAPA.
                                            </Typography>
                                        )} */}

                                    {canEditCAPA &&
                                        !evidenceFiles[item.id] &&
                                        !item.evidenceFilePath && (
                                            <Typography
                                                variant="caption"
                                                color="error"
                                                sx={{
                                                    display: "block",
                                                    mt: 1,
                                                }}
                                            >
                                                Evidence is mandatory before submitting CAPA.
                                            </Typography>
                                        )}
                                    {/* </Box> */}
                                </Grid>
                            </Grid>
                            {/* </Grid> */}

                            <Box
                                sx={{
                                    display: "flex",
                                    gap: 1,
                                    mt: 2,
                                }}
                            >

                                <Chip
                                    label={item.status}
                                    color={
                                        item.status === "Open"
                                            ? "warning"
                                            : item.status === "Closed"
                                                ? "success"
                                                : item.status === "Sent Back"
                                                    ? "error"
                                                    : "info"
                                    }
                                />

                                {isDelayed(item) && (
                                    <Chip
                                        label="Delayed"
                                        color="warning"
                                    />
                                )}

                            </Box>
                            <Box
                                sx={{
                                    display: "flex",
                                    justifyContent: "flex-end",
                                    gap: 2,
                                    mt: 3,
                                }}
                            >
                                {/* {(!isDepot || canEditCAPA) && ( */}
                                {(
                                    !isDepot ||
                                    (
                                        isDepot &&
                                        canEditCAPA
                                    )
                                ) && (

                                        // <Button
                                        //     variant="outlined"
                                        //     // disabled={
                                        //     //     isDepot &&
                                        //     //     !canEditCAPA
                                        //     // }
                                        //     onClick={async () => {
                                        //         try {
                                        //             await saveCAPAs(capaData);
                                        //             alert(
                                        //                 "CAPA Draft Saved Successfully"
                                        //             );
                                        //         } catch (error) {
                                        //             console.error(error);
                                        //             alert("Unable to save CAPA draft");
                                        //         }
                                        //     }}
                                        // >
                                        //     Save Draft
                                        // </Button>
                                        <Button
                                            variant="outlined"
                                            onClick={() => {
                                                alert("CAPA Draft Saved Successfully");
                                            }}
                                        >
                                            Save Draft
                                        </Button>
                                    )}
                                {/* {isDepot &&
                                    item.status === "Open" && ( */}
                                {isDepot &&
                                    (
                                        item.status === "Open" ||
                                        item.status === "Sent Back"
                                    ) && (
                                        //                                 <Button
                                        //                                     variant="contained"
                                        //                                     color="primary"
                                        //                                     disabled={!canSubmitCAPA(item)}
                                        //                                     onClick={async () => {

                                        //                                         const updatedCAPA =
                                        //                                             capaData.map((capa) =>
                                        //                                                 capa.id === item.id
                                        //                                                     ? {
                                        //                                                         ...capa,
                                        //                                                         status: "In Progress",
                                        //                                                         submittedDate:
                                        //                                                             new Date().toISOString(),
                                        //                                                     }
                                        //                                                     : capa
                                        //                                             );

                                        //                                         setCapaData(updatedCAPA);

                                        //                                         //                                     saveCAPAs(updatedCAPA).catch((error) =>
                                        //                                         // console.error("Unable to save CAPA:", error)

                                        //                                         // );
                                        //                                         await updateCAPA(
                                        //                                             item.id,
                                        //                                             {
                                        //                                                 rootCause: item.rootCause,
                                        //                                                 preventiveAction: item.preventiveAction,
                                        //                                                 targetDate: item.targetDate,
                                        //                                                 evidence: item.evidence,
                                        //                                                 status: "In Progress",
                                        //                                                 submittedDate: new Date().toISOString(),
                                        //                                             }
                                        //                                         );
                                        //                                         await refreshCAPAs();
                                        //                                         // await updateCAPA(
                                        //                                         //     item.id,
                                        //                                         //     {
                                        //                                         //         status: "In Progress",
                                        //                                         //         submittedDate:
                                        //                                         //             new Date().toISOString(),
                                        //                                         //     }
                                        //                                         // );

                                        //                                         const totalCAPA =
                                        //                                             updatedCAPA.length;

                                        //                                         const submittedCAPA =
                                        //                                             updatedCAPA.filter(
                                        //                                                 c =>
                                        //                                                     c.status ===
                                        //                                                     "In Progress"
                                        //                                             ).length;

                                        //                                         const openCAPA =
                                        //                                             updatedCAPA.filter(
                                        //                                                 c =>
                                        //                                                     c.status === "Open"
                                        //                                             ).length;

                                        //                                         await addNotification({

                                        //                                             role: "CQA",

                                        //                                             auditId: item.auditId,

                                        //                                             title:
                                        //                                                 "CAPA Submitted",

                                        //                                             message:
                                        //                                                 `Audit: ${item.capaNo}
                                        //  | Total CAPA: ${totalCAPA}
                                        //  | Submitted: ${submittedCAPA}
                                        //  | Open: ${openCAPA}`,

                                        //                                             link:
                                        //                                                 `/capa/${item.auditId}`,
                                        //                                         });

                                        //                                     }}
                                        //                                 >
                                        //                                     Submit CAPA
                                        //                                 </Button>


                                        <Button
                                            variant="contained"
                                            color="primary"
                                            disabled={
                                                !canSubmitCAPA(item) ||
                                                uploadingEvidence
                                            }
                                            onClick={() => handleSubmitCAPA(item)}
                                        >
                                            {uploadingEvidence
                                                ? "Submitting..."
                                                : "Submit CAPA"}
                                        </Button>
                                        // )}
                                        // <Button
                                        //     variant="contained"
                                        //     color="primary"
                                        //     disabled={!canSubmitCAPA(item)}

                                        //     onClick={() =>
                                        //         updateCAPAStatus(
                                        //             item.id,
                                        //             "In Progress"
                                        //         )

                                        //     }

                                        // >
                                        //     Submit CAPA
                                        // </Button>

                                    )}
                                {/* submittedDate:new Date().toISOString(), */}
                                {/* {item.status === "In Progress" && (
                                <Button
                                    variant="contained"
                                    color="success"
                                    onClick={() =>
                                        handleCloseCAPA(
                                            item.id
                                        )
                                    }
                                >
                                    Close CAPA
                                </Button>
                            )} */}
                                {!isDepot &&
                                    item.status === "In Progress" && (

                                        <>
                                            <Button
                                                variant="contained"
                                                color="success"
                                                onClick={() =>
                                                    handleCloseCAPA(
                                                        item.id
                                                    )
                                                }
                                            >
                                                Accept & Close
                                            </Button>

                                            <Button
                                                variant="contained"
                                                color="error"
                                                onClick={() =>
                                                    handleSendBackCAPA(
                                                        item.id
                                                    )
                                                }
                                            >
                                                Send Back
                                            </Button>
                                        </>

                                    )}

                                {/* closedDate:new Date().toISOString(), */}
                                <Dialog
                                    open={openDialog}
                                    onClose={() =>
                                        setOpenDialog(false)
                                    }
                                >
                                    <DialogTitle>
                                        Close CAPA
                                    </DialogTitle>

                                    <DialogContent>
                                        <DialogContentText>
                                            Are you sure you want to
                                            close this CAPA?
                                        </DialogContentText>
                                    </DialogContent>

                                    <DialogActions>
                                        <Button
                                            onClick={() =>
                                                setOpenDialog(false)
                                            }
                                        >
                                            Cancel
                                        </Button>

                                        <Button
                                            color="success"
                                            variant="contained"
                                            onClick={confirmCloseCAPA}
                                        >
                                            Confirm
                                        </Button>
                                    </DialogActions>
                                </Dialog>
                            </Box>
                            {/* <Box
                            sx={{
                                display: "flex",
                                justifyContent: "flex-end",
                                mt: 3,
                            }}
                        >
                            <Button
                                variant="contained"
                                size="large"
                            >
                                Save CAPA
                            </Button>
                        </Box> */}

                            {/* <Button
                            variant="contained"
                            sx={{ mt: 2 }}
                        >
                            Save CAPA
                        </Button> */}
                        </CardContent>
                    </Card>
                );
            })}
        </Box>
    );
}