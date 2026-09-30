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
    removeCAPAEvidence,
    createCAPAs,
    cancelCAPA,
} from "../utils/storage";
import EvidenceList from "../components/common/EvidenceList";
import CAPAAuditHeader from "../components/capa/CAPAAuditHeader";
import { getFindingNo } from "../utils/findingUtils";
import { buildAdditionalCAPA } from "../utils/capaGenerator";
import AddIcon from "@mui/icons-material/Add";
import UploadFileIcon from "@mui/icons-material/UploadFile";
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
import { formatDate } from "../utils/dateUtils";
import {
    Select,
    MenuItem,
} from "@mui/material";

import { AdapterDayjs }
    from "@mui/x-date-pickers/AdapterDayjs";

import { DatePicker }
    from "@mui/x-date-pickers";
import {
    getAudit,
    getCAPAs,
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
    // CAPA id whose evidence is currently uploading (files upload as soon as
    // they're picked, so they're saved and viewable before Submit).
    const [uploadingEvidenceFor, setUploadingEvidenceFor] = useState(null);

    // "Add CAPA" dialog (CQA): the finding group it's for + the form.
    const [addCapaGroup, setAddCapaGroup] = useState(null);
    const [addCapaForm, setAddCapaForm] = useState({
        description: "",
        targetDate: "",
    });
    const [savingAddCapa, setSavingAddCapa] = useState(false);
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

    const currentAudit =
        audits?.find((a) => String(a.id) === String(auditId));

    const formatAuditDate = formatDate;

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

    const hasCqaRemarks = (item) =>
        Boolean(item?.cqaRemarks?.trim());

    const handleCloseCAPA = (id) => {
        if (!hasCqaRemarks(capaData.find((c) => c.id === id))) {
            alert("CQA Remarks are mandatory before closing the CAPA.");
            return;
        }
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
                    c.status !== "Closed" &&
                    c.status !== "Cancelled"
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
            eventType: "CAPA_ACCEPTED",
            emailPayload: buildCapaEmailPayload(
                closedCAPA,
                updatedCAPA,
                `/capa/${auditId}`
            ),
        });

        // Notify SAP (NGD) so it can trigger the depot email off the Flag.
        const openAfterClose = updatedCAPA.filter(
            (c) => c.status === "Open" || c.status === "Sent Back"
        ).length;

        notifyCapaSet({
            flag: SAP_FLAG.CAPA_ACCEPTED_CLOSED,
            auditNo: getAuditNo(auditId),
            findingNo: getFindingNo(closedCAPA, getAuditNo(auditId)),
            capaId: closedCAPA?.capaNo,
            totalCapa: countActiveCAPAs(updatedCAPA),
            capaSubm: countActiveCAPAs(updatedCAPA) - openAfterClose,
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

    const MAX_EVIDENCE_FILES = 10;
    const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;

    // Cancelled (added) CAPAs are kept for the record but don't count.
    const countActiveCAPAs = (capas) =>
        capas.filter((c) => c.status !== "Cancelled").length;

    // Data for the backend CAPA emails (emailTemplates.js). `link` is app-relative;
    // the backend turns it into a full URL.
    const buildCapaEmailPayload = (capa, capas, link) => {
        const total = countActiveCAPAs(capas);
        const open = capas.filter(
            (c) => c.status === "Open" || c.status === "Sent Back"
        ).length;

        return {
            auditNo: getAuditNo(capa?.auditId),
            findingNo: getFindingNo(capa, getAuditNo(capa?.auditId)),
            capaNo: capa?.capaNo,
            totalCAPA: total,
            submittedCAPA: total - open,
            openCAPA: open,
            userId: currentUser?.name || currentUser?.username || "",
            link,
        };
    };


    // Add CAPA / Cancel: CQA only, while the audit's CAPAs are still open.
    const canAddCAPA =
        !isDepot &&
        Boolean(auditId) &&
        currentAudit?.isActive !== false &&
        currentAudit?.status === "CAPA Open";

    const isAuditFrozen = (item) =>
        audits?.find((a) => String(a.id) === String(item.auditId))
            ?.isActive === false;

    const openAddCapa = (group) => {
        setAddCapaForm({ description: "", targetDate: "" });
        setAddCapaGroup(group);
    };

    const handleAddCAPA = async () => {
        const description = addCapaForm.description.trim();

        if (!description) {
            alert("Action required / CAPA description is mandatory.");
            return;
        }

        if (!addCapaForm.targetDate) {
            alert("Target Date is mandatory.");
            return;
        }

        try {
            setSavingAddCapa(true);

            // Re-read so the new serial never collides with a CAPA added meanwhile.
            const auditCapas = await getCAPAs(auditId);

            const newCAPA = buildAdditionalCAPA({
                finding: addCapaGroup.items[0],
                auditCapas: Array.isArray(auditCapas) ? auditCapas : capaData,
                auditId: Number(auditId),
                findingNo: addCapaGroup.findingNo,
                description,
                targetDate: addCapaForm.targetDate,
            });

            await createCAPAs([newCAPA]);
            await refreshCAPAs();

            setAddCapaGroup(null);

            await addNotification({
                role: "Depot",
                auditId: Number(auditId),
                title: "CAPA Assigned",
                message: `An additional CAPA ${newCAPA.capaNo} has been assigned for Finding ${newCAPA.findingNo}. Please review and submit.`,
                link: `/capa/${auditId}`,
                eventType: "CAPA_ASSIGNED",
                emailPayload: {
                    auditNo: getAuditNo(auditId),
                    findingNo: newCAPA.findingNo,
                    capaNo: newCAPA.capaNo,
                    totalCAPA: 1,
                    link: `/capa/${auditId}`,
                },
            });

            alert(`CAPA ${newCAPA.capaNo} added.`);
        } catch (error) {
            console.error("Add CAPA failed:", error);
            alert(error.message || "Unable to add CAPA.");
        } finally {
            setSavingAddCapa(false);
        }
    };

    // Soft cancel of an added CAPA; if nothing else is open, the audit closes
    // exactly as it does after the last Accept & Close.
    const handleCancelCAPA = async (item) => {
        if (
            !window.confirm(
                `Cancel CAPA ${item.capaNo}? It will be kept for the record but no longer counted.`
            )
        ) {
            return;
        }

        try {
            await cancelCAPA(item.id, currentUser?.username || "");

            const fresh = await getCAPAs(item.auditId);
            setCapaData(fresh);

            const stillOpen = fresh.filter(
                (c) => c.status !== "Closed" && c.status !== "Cancelled"
            );

            if (stillOpen.length === 0) {
                const updatedAudit = await updateAudit(item.auditId, {
                    status: "Closed",
                });

                setAudits((previous) =>
                    previous.map((audit) =>
                        audit.id === item.auditId ? updatedAudit : audit
                    )
                );
            }
        } catch (error) {
            console.error("Cancel CAPA failed:", error);
            alert(error.message || "Unable to cancel CAPA.");
        }
    };

    const activeCAPAEvidence = (item) =>
        (item.evidenceFiles || []).filter((file) => !file.removed);

    // Depot may remove only files added since the last submission: after a
    // Send Back the earlier (already reviewed) files stay.
    const canRemoveCAPAFile = (item, file, canEditCAPA) =>
        canEditCAPA &&
        (
            !item.submittedDate ||
            (
                file.id !== "legacy" &&
                new Date(file.uploadedAt) > new Date(item.submittedDate)
            )
        );

    const mergeCAPAEvidence = (updatedCAPA) =>
        setCapaData((previous) =>
            previous.map((capa) =>
                capa.id === updatedCAPA.id
                    ? {
                        ...capa,
                        evidenceFiles: updatedCAPA.evidenceFiles,
                        evidenceFileName: updatedCAPA.evidenceFileName,
                        evidenceFilePath: updatedCAPA.evidenceFilePath,
                        evidenceUploadedBy: updatedCAPA.evidenceUploadedBy,
                        evidenceUploadedAt: updatedCAPA.evidenceUploadedAt,
                    }
                    : capa
            )
        );

    const handleAddCAPAEvidence = async (item, fileList) => {

        const files = Array.from(fileList || []);
        if (files.length === 0) return;

        const activeCount = activeCAPAEvidence(item).length;

        if (activeCount + files.length > MAX_EVIDENCE_FILES) {
            alert(
                `A CAPA can have at most ${MAX_EVIDENCE_FILES} evidence files (${activeCount} already attached).`
            );
            return;
        }

        if (files.some((file) => file.size > MAX_EVIDENCE_BYTES)) {
            alert("Evidence file size must not exceed 10 MB.");
            return;
        }

        try {
            setUploadingEvidenceFor(item.id);

            mergeCAPAEvidence(
                await uploadCAPAEvidence(
                    item.id,
                    files,
                    currentUser?.username || "Depot"
                )
            );
        } catch (error) {
            console.error("Evidence upload failed:", error);
            alert(error.message || "Unable to upload evidence.");
        } finally {
            setUploadingEvidenceFor(null);
        }
    };

    // Soft remove: hidden from the list; the file and its record are kept.
    const handleRemoveCAPAEvidence = async (item, file) => {
        try {
            mergeCAPAEvidence(
                await removeCAPAEvidence(
                    item.id,
                    file.id,
                    currentUser?.username || ""
                )
            );
        } catch (error) {
            console.error("Evidence remove failed:", error);
            alert(error.message || "Unable to remove evidence.");
        }
    };

    const canSubmitCAPA = (item) => {

        const hasEvidence =
            activeCAPAEvidence(item).length > 0;

        return Boolean(
            item.rootCause?.trim() &&
            item.preventiveAction?.trim() &&
            item.targetDate &&
            hasEvidence
        );
    };

    const handleSubmitCAPA = async (item) => {

        // Depot must sign the audit (name + signature on the checklist page) before
        // any CAPA can be submitted. Re-fetch so a signature made in another tab counts.
        let auditForSignature = currentAudit;
        try {
            auditForSignature = await getAudit(item.auditId || auditId);
        } catch (error) {
            console.error(error);
        }

        if (
            !auditForSignature?.depotSignatureSubmitted ||
            !auditForSignature?.depotInchargeName?.trim()
        ) {
            alert(
                "Depot Incharge name and signature are mandatory before submitting the CAPA. Please sign on the audit checklist page first."
            );
            return;
        }

        if (activeCAPAEvidence(item).length === 0) {
            alert("Please attach at least one evidence file before submitting the CAPA.");
            return;
        }

        if (!canSubmitCAPA(item)) {
            alert(
                "Root Cause, Corrective Action and Target Date are mandatory."
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

            // 2. Evidence is already uploaded (on selection) - reload CAPAs.
            await refreshCAPAs();

            // setEvidenceCAPAId(null);

            alert(
                "CAPA submitted successfully."
            );

            const freshCapas = await getCAPAs(item.auditId);

            // 5. Notification (+ email) to CQA
            await addNotification({
                role: "CQA",
                auditId: item.auditId,
                title: "CAPA Submitted",
                message:
                    `CAPA ${item.capaNo} has been submitted by Depot with evidence.`,
                link:
                    `/capa/${item.auditId}`,
                eventType: "CAPA_SUBMITTED",
                emailPayload: buildCapaEmailPayload(
                    item,
                    freshCapas,
                    `/capa/${item.auditId}`
                ),
            });

            // Notify SAP (NGD) so it can trigger the CQA email off the Flag.
            const openAfterSubmit = freshCapas.filter(
                (c) => c.status === "Open" || c.status === "Sent Back"
            ).length;

            notifyCapaSet({
                flag: SAP_FLAG.CAPA_SUBMITTED,
                auditNo: getAuditNo(item.auditId),
                findingNo: getFindingNo(item, getAuditNo(item.auditId)),
                capaId: item.capaNo,
                totalCapa: countActiveCAPAs(freshCapas),
                capaSubm: countActiveCAPAs(freshCapas) - openAfterSubmit,
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

            if (tab === 4)
                return item.status === "Cancelled";

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

    const cancelledCount =
        capaData.filter(
            c => c.status === "Cancelled"
        ).length;

    // CAPA cards grouped under their finding (one finding, one or more CAPAs).
    const capaGroups = Object.values(
        filteredCAPA.reduce((groups, item) => {
            const findingNo =
                getFindingNo(item, getAuditNo(item.auditId)) || item.capaNo;

            if (!groups[findingNo]) {
                groups[findingNo] = { findingNo, items: [] };
            }

            groups[findingNo].items.push(item);
            return groups;
        }, {})
    );



    const delayedCount =
        capaData.filter(
            (item) =>
                isDelayed(item)
        ).length;



    const handleSendBackCAPA = async (
        capaId
    ) => {

        if (!hasCqaRemarks(capaData.find((c) => c.id === capaId))) {
            alert("CQA Remarks are mandatory before sending the CAPA back.");
            return;
        }

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
            eventType: "CAPA_SENT_BACK",
            emailPayload: buildCapaEmailPayload(
                selected,
                updatedCAPA,
                `/capa/${selected.auditId}`
            ),
        });

        // Notify SAP (NGD) so it can trigger the depot email off the Flag.
        const openAfterSendBack = updatedCAPA.filter(
            (c) => c.status === "Open" || c.status === "Sent Back"
        ).length;

        notifyCapaSet({
            flag: SAP_FLAG.CAPA_SENT_BACK,
            auditNo: getAuditNo(selected.auditId),
            findingNo: getFindingNo(selected, getAuditNo(selected.auditId)),
            capaId: selected?.capaNo,
            totalCapa: countActiveCAPAs(updatedCAPA),
            capaSubm: countActiveCAPAs(updatedCAPA) - openAfterSendBack,
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
                                Manage corrective actions
                            </Typography>
                        </Box>
                    </Box>
                </CardContent>
            </Card>

            {/* Same header as the audit checklist (Audit No, Element Compliance,
                General Information), read-only; the details card below stays. */}
            {currentAudit?.isActive === false && (
                <Box
                    sx={{
                        mb: 3,
                        p: 2,
                        borderRadius: 2,
                        bgcolor: "#F3F4F6",
                        border: "1px solid #D1D5DB",
                        color: "#374151",
                    }}
                >
                    <Typography fontWeight={700}>
                        This audit is deactivated. Its CAPAs are read-only.
                    </Typography>
                    <Typography variant="body2">
                        Reason: {currentAudit.deactivationReason || "-"}
                    </Typography>
                </Box>
            )}

            <CAPAAuditHeader audit={currentAudit} />

            {currentAudit && (
                <Card sx={{ mb: 3, borderRadius: 2 }}>
                    <CardContent>
                        <Box
                            sx={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                flexWrap: "wrap",
                                gap: 1,
                                mb: 2,
                            }}
                        >
                            <Typography variant="h6" fontWeight={600}>
                                Audit No: {currentAudit.auditNo}
                            </Typography>
                            <Chip label={currentAudit.status} color="primary" variant="outlined" />
                        </Box>

                        <Grid container spacing={2}>
                            {[
                                ["Audit Type", currentAudit.auditType],
                                ["Audit Category", currentAudit.auditCategory],
                                ["Depot", currentAudit.depot],
                                ["Auditor", currentAudit.auditor],
                                ["Audit Date", formatAuditDate(currentAudit.auditDate)],
                                ["Due Date", formatAuditDate(currentAudit.dueDate)],
                                [
                                    "Compliance",
                                    currentAudit.compliance != null
                                        ? `${Number(currentAudit.compliance).toFixed(2)}%`
                                        : "-",
                                ],
                                ["Total CAPA", countActiveCAPAs(capaData)],
                            ].map(([label, value]) => (
                                <Grid item xs={6} sm={4} md={3} key={label}>
                                    <Typography variant="caption" color="text.secondary">
                                        {label}
                                    </Typography>
                                    <Typography fontWeight={500}>
                                        {value === "" || value == null ? "-" : value}
                                    </Typography>
                                </Grid>
                            ))}
                        </Grid>
                    </CardContent>
                </Card>
            )}



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
                        {cancelledCount > 0 && (
                            <Tab label={`Cancelled (${cancelledCount})`} />
                        )}
                    </Tabs>

                </CardContent>
            </Card>




            {/* {filteredCAPA.map((item) => ( */}
            {capaGroups.map((group) => (
                <Box key={group.findingNo} sx={{ mb: 4 }}>
                    {/* Finding header: one finding, one or more CAPAs */}
                    <Box
                        sx={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            flexWrap: "wrap",
                            gap: 1,
                            mb: 1.5,
                            px: 2,
                            py: 1.5,
                            borderRadius: 2,
                            bgcolor: "#EEF2FF",
                            borderLeft: "5px solid #4F46E5",
                        }}
                    >
                        <Box sx={{ minWidth: 0 }}>
                            <Typography fontWeight={700}>
                                Finding No: {group.findingNo}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                {group.items[0].parameter}
                                {" · "}
                                {group.items.length} CAPA
                                {group.items.length > 1 ? "s" : ""}
                            </Typography>
                        </Box>

                        {canAddCAPA && (
                            <Button
                                variant="contained"
                                size="small"
                                startIcon={<AddIcon />}
                                onClick={() => openAddCapa(group)}
                            >
                                Add CAPA
                            </Button>
                        )}
                    </Box>

            {group.items.map((item) => {

                // const canEditCAPA =
                //     isDepot &&
                //     item.status === "Open";
                // Deactivated audit (Audit Management): its CAPAs are read-only.
                const isFrozen = isAuditFrozen(item);

                const canEditCAPA =
                    isDepot &&
                    !isFrozen &&
                    (
                        item.status === "Open" ||
                        item.status === "Sent Back"
                    );

                // CQA Remarks: CQA only, and only while reviewing a submitted CAPA
                // (same window as Accept & Close / Send Back). Locked while the CAPA
                // is with the Depot (Open / Sent Back) and once it is Closed.
                const canEditCqaRemarks =
                    !isDepot &&
                    !isFrozen &&
                    item.status === "In Progress";

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
                                <Box>
                                    <Typography variant="h6">
                                        {item.capaNo}
                                    </Typography>

                                    {getFindingNo(item, getAuditNo(item.auditId)) && (
                                        <Typography
                                            variant="body2"
                                            color="text.secondary"
                                            fontWeight={600}
                                        >
                                            Finding No: {getFindingNo(item, getAuditNo(item.auditId))}
                                        </Typography>
                                    )}
                                </Box>

                                <Box
                                    sx={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 1,
                                        flexWrap: "wrap",
                                    }}
                                >
                                    {item.isAdditional && (
                                        <Chip
                                            label="Added CAPA"
                                            variant="outlined"
                                            color="secondary"
                                            size="small"
                                        />
                                    )}

                                    <Chip
                                        label={item.status}
                                        color={
                                            item.status === "Open"
                                                ? "warning"
                                                : item.status === "Closed"
                                                    ? "success"
                                                    : item.status === "Cancelled"
                                                        ? "default"
                                                        : "info"
                                        }
                                    />

                                    {canAddCAPA &&
                                        item.isAdditional &&
                                        item.status !== "Closed" &&
                                        item.status !== "Cancelled" && (
                                            <Button
                                                size="small"
                                                color="error"
                                                variant="outlined"
                                                onClick={() => handleCancelCAPA(item)}
                                            >
                                                Cancel CAPA
                                            </Button>
                                        )}
                                </Box>
                            </Box>

                            {item.description && (
                                <Box
                                    sx={{
                                        mb: 2,
                                        p: 1.5,
                                        borderRadius: 1,
                                        bgcolor: "#FFF7ED",
                                        border: "1px solid #FED7AA",
                                    }}
                                >
                                    <Typography variant="caption" fontWeight={700} color="#9A3412">
                                        Action required (CQA)
                                    </Typography>
                                    <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                                        {item.description}
                                    </Typography>
                                </Box>
                            )}

                            {item.status === "Cancelled" && (
                                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                    Cancelled
                                    {item.cancelledBy ? ` by ${item.cancelledBy}` : ""}
                                    {item.cancelledAt
                                        ? ` on ${new Date(item.cancelledAt).toLocaleString()}`
                                        : ""}
                                </Typography>
                            )}

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
                                        label="Corrective Action"
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
                                            !canEditCqaRemarks
                                        }
                                        required={canEditCqaRemarks}
                                        error={
                                            canEditCqaRemarks &&
                                            !hasCqaRemarks(item)
                                        }
                                        // InputProps={{
                                        //     readOnly: isDepot,
                                        // }}
                                        helperText={
                                            canEditCqaRemarks
                                                ? "CQA Remarks are mandatory to Accept & Close or Send Back"
                                                : isDepot || item.status === "Closed"
                                                    ? "Remarks provided by CQA Auditor"
                                                    : "CQA Remarks can be entered once the Depot submits the CAPA"
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
                                            Root Cause, Corrective Action and Target Date
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

                                    {canEditCAPA && (
                                        <>
                                            <Button
                                                variant="outlined"
                                                component="label"
                                                startIcon={<UploadFileIcon />}
                                                disabled={uploadingEvidenceFor === item.id}
                                            >
                                                {uploadingEvidenceFor === item.id
                                                    ? "Uploading..."
                                                    : "Add Evidence Files"}

                                                <input
                                                    type="file"
                                                    hidden
                                                    multiple
                                                    accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                                                    onChange={(e) => {
                                                        handleAddCAPAEvidence(
                                                            item,
                                                            e.target.files
                                                        );
                                                        e.target.value = "";
                                                    }}
                                                />
                                            </Button>

                                            <Typography
                                                variant="caption"
                                                color="text.secondary"
                                                sx={{ display: "block", mt: 0.5 }}
                                            >
                                                Up to {MAX_EVIDENCE_FILES} files, 10 MB each (PDF, JPG, PNG, Word, Excel).
                                            </Typography>
                                        </>
                                    )}

                                    <Box sx={{ mt: 1.5 }}>
                                        <EvidenceList
                                            files={activeCAPAEvidence(item)}
                                            canRemove={(file) =>
                                                canRemoveCAPAFile(item, file, canEditCAPA)
                                            }
                                            onRemove={(file) =>
                                                handleRemoveCAPAEvidence(item, file)
                                            }
                                            emptyText="No evidence uploaded yet."
                                        />
                                    </Box>

                                    {canEditCAPA &&
                                        activeCAPAEvidence(item).length === 0 && (
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
                                                    : item.status === "Cancelled"
                                                        ? "default"
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
                                {!isFrozen && (
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
                                {canEditCAPA && (
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
                                    !isFrozen &&
                                    item.status === "In Progress" && (

                                        <>
                                            <Button
                                                variant="contained"
                                                color="success"
                                                disabled={!hasCqaRemarks(item)}
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
                                                disabled={!hasCqaRemarks(item)}
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
            ))}
            <Dialog
                open={Boolean(addCapaGroup)}
                onClose={() => !savingAddCapa && setAddCapaGroup(null)}
                fullWidth
                maxWidth="sm"
            >
                <DialogTitle>
                    Add CAPA
                    {addCapaGroup ? ` - Finding No: ${addCapaGroup.findingNo}` : ""}
                </DialogTitle>

                <DialogContent>
                    {addCapaGroup && (
                        <DialogContentText sx={{ mb: 2 }}>
                            {addCapaGroup.items[0].parameter}
                        </DialogContentText>
                    )}

                    <TextField
                        label="Action required / CAPA description"
                        required
                        fullWidth
                        multiline
                        rows={3}
                        value={addCapaForm.description}
                        onChange={(e) =>
                            setAddCapaForm((previous) => ({
                                ...previous,
                                description: e.target.value,
                            }))
                        }
                        sx={{ mb: 2, mt: 1 }}
                    />

                    <TextField
                        label="Target Date"
                        type="date"
                        required
                        fullWidth
                        value={addCapaForm.targetDate}
                        onChange={(e) =>
                            setAddCapaForm((previous) => ({
                                ...previous,
                                targetDate: e.target.value,
                            }))
                        }
                        slotProps={{
                            inputLabel: { shrink: true },
                            htmlInput: {
                                min: dayjs().format("YYYY-MM-DD"),
                            },
                        }}
                    />
                </DialogContent>

                <DialogActions>
                    <Button
                        onClick={() => setAddCapaGroup(null)}
                        disabled={savingAddCapa}
                    >
                        Cancel
                    </Button>

                    <Button
                        variant="contained"
                        onClick={handleAddCAPA}
                        disabled={savingAddCapa}
                    >
                        {savingAddCapa ? "Adding..." : "Add CAPA"}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}