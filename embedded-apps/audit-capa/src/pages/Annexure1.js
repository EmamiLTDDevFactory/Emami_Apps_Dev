import {
    Box,
    Grid,
    Card,
    CardContent,
    TextField,
    Typography,
    Button
} from "@mui/material";

import { useParams } from "react-router-dom";
import checklistData from "../data/checklistData";
import { useState, useRef } from "react";
import {
    generateCAPA,
} from "../utils/capaGenerator";
import LinearProgress from "@mui/material/LinearProgress";
import {
    saveCAPAs,
    // updateAudit,
    getCAPAs,
} from "../utils/storage";
import {
    saveChecklistDraft,
} from "../utils/storage";

import { useEffect } from "react";
import emamiLogo from '../assets/emami-logo.jpg';

import AuditQuestionCard from "../components/audit/AuditQuestionCard";
import { useNavigate } from "react-router-dom";
import {
    Accordion,
    AccordionSummary,
    AccordionDetails,
} from "@mui/material";

import SearchIcon from "@mui/icons-material/Search";
import InputAdornment from "@mui/material/InputAdornment";
import {
    addNotification,
} from "../utils/notifications";
import {
    notifyCapaSet,
    SAP_FLAG,
} from "../utils/sapNotify";

import BusinessIcon from "@mui/icons-material/Business";
import SecurityIcon from "@mui/icons-material/Security";
import DescriptionIcon from "@mui/icons-material/Description";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import ScienceIcon from "@mui/icons-material/Science";
import WarehouseIcon from "@mui/icons-material/Warehouse";
import SignatureCanvas
    from "react-signature-canvas";

import useMediaQuery
    from "@mui/material/useMediaQuery";
import { useAppContext } from "../context/AppContext";
import DeleteIcon from "@mui/icons-material/Delete";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
// import { generateCAPA } from "../utils/capaGenerator";

// import {
//   saveCAPAs,
// } from "../utils/storage";

import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import {
    getAuditById,
    updateAudit
} from "../api/auditApi";

export default function Annexure1() {
    const { id } = useParams();
    const { audits } = useAppContext();
    // const selectedAudit = audits.find(
    //     (audit) => audit.id === Number(id)
    // );
    const [selectedAudit, setSelectedAudit] = useState(null);
    const [auditItems, setAuditItems] =
        useState(checklistData);

    const {
        setAudits
    } = useAppContext();



    // useEffect(() => {
    //     const savedDraft =
    //         getChecklistDraft(id);

    //     if (savedDraft) {
    //         setAuditItems(savedDraft);
    //     }
    // }, [id]);

    // old
    // useEffect(() => {
    //     const audit = audits.find((a) => a.id === Number(id));

    //     if (audit?.checklist?.length > 0) {
    //         setAuditItems(audit.checklist);
    //     } else {
    //         setAuditItems(checklistData);
    //     }
    // }, [id, audits]);

    // new
    useEffect(() => {
        loadAudit();
    }, [id]);



    const loadAudit = async () => {
        try {
            // const response = await getAuditById(id);

            // const audit = response.data;

            // setSelectedAudit(audit);
            // old
            // const audit = await getAuditById(id);
            // if (audit.checklist && audit.checklist.length > 0) {
            //     setAuditItems(audit.checklist);
            // } else {
            //     setAuditItems(checklistData);
            // }
            // new
            const audit = await getAuditById(id);

            // const audit = await getAuditById(id);

            if (audit.status === "Open") {

                audit.status = "In Progress";

                const updatedAudit =
                    await updateAudit(
                        Number(id),
                        {
                            status: "In Progress",
                        }
                    );

                setSelectedAudit(updatedAudit);

                setAudits(previous =>
                    previous.map(a =>
                        a.id === Number(id)
                            ? updatedAudit
                            : a
                    )
                );
            } else {
                setSelectedAudit(audit);
            }

            // setSelectedAudit(audit);

            if (audit.checklist?.length > 0) {
                setAuditItems(audit.checklist);
            } else {
                setAuditItems(checklistData);
            }

        } catch (error) {
            console.error("Unable to load audit", error);
        }
    };





    // const [auditItems, setAuditItems] =
    //     useState(checklistData);
    const [searchText, setSearchText] =
        useState("");
    // const [capaRecords, setCapaRecords] =
    //     useState([]);
    const navigate = useNavigate();

    const currentUser =
        JSON.parse(
            localStorage.getItem(
                "currentUser"
            )
        );

    const isDepot =
        currentUser?.role ===
        "Depot";

    const isDesktopAudit =
        selectedAudit?.auditType === "Desktop";

    const isOnsiteAudit =
        selectedAudit?.auditType === "Onsite";

    // const canEditAnnexure =
    //     (isDesktopAudit && isDepot) ||
    //     (isOnsiteAudit && !isDepot);

    const isCQA =
        currentUser?.role === "CQA";

    const canEditAnnexure =
        (
            //     isDesktopAudit &&
            //     isDepot &&
            //     ![
            //         "Self Assessment Submitted",
            //         "Under Review",
            //         "CAPA Open",
            //         "Closed"
            //     ].includes(selectedAudit?.status)
            // )

            isDesktopAudit &&
            isDepot &&
            [
                "Open",
                "In Progress",
                "Rework Required"
            ].includes(selectedAudit?.status)
        )
        ||
        (
            isDesktopAudit &&
            isCQA &&
            selectedAudit?.status ===
            "Self Assessment Submitted"
        )
        ||
        (
            isOnsiteAudit &&
            !isDepot
        );

    // const canEditAnnexure =

    //     (
    //         isDesktopAudit &&
    //         isDepot &&
    //         selectedAudit?.status !==
    //         "Self Assessment Submitted"
    //     )

    //     ||

    //     (
    //         isOnsiteAudit &&
    //         !isDepot
    //     );

    const isTablet =
        useMediaQuery(
            "(min-width:768px) and (max-width:1200px)"
        );

    const isAuditorTablet =
        !isDepot && isTablet;



    const handleStatusChange = async (
        questionId,
        value
    ) => {
        const updatedItems =
            auditItems.map((item) => {
                if (item.id === questionId) {

                    const isCompliance =
                        value === "NA" ||
                        Number(value) >= 2;

                    return {
                        ...item,
                        status: value,

                        actualScore:
                            value === "NA"
                                ? 0
                                : Number(value),

                        actionPlan: isCompliance
                            ? ""
                            : item.actionPlan,

                        responsibility: isCompliance
                            ? ""
                            : item.responsibility,

                        targetDate: isCompliance
                            ? ""
                            : item.targetDate,

                        evidence: isCompliance
                            ? null
                            : item.evidence,
                    };
                    // return {
                    //     ...item,
                    //     status: value,


                    //     actualScore:
                    //         value === "NA"
                    //             ? 0
                    //             : Number(value),
                    // };
                }

                return item;
            });

        setAuditItems(updatedItems);

        try {
            // const updatedAudit = await updateAudit(Number(id), {
            //     status: "In Progress",
            //     checklist: updatedItems,
            // });

            const updatedAudit = await updateAudit(Number(id), {
                status:
                    selectedAudit?.status ===
                        "Self Assessment Submitted"
                        ? "Under Review"
                        : selectedAudit?.status ===
                            "Rework Required"
                            ? "In Progress"
                            : selectedAudit?.status,

                checklist: updatedItems,
            });

            setSelectedAudit(updatedAudit);


            setAudits((previous) =>
                previous.map((audit) =>
                    audit.id === Number(id) ? updatedAudit : audit
                )
            );
        } catch (error) {
            console.error(error);
        }
    };

    const totalMaxScore =
        auditItems.reduce(
            (sum, item) => {
                if (item.status === "NA")
                    return sum;

                return (
                    sum + item.maxScore
                );
            },
            0
        );

    const totalActualScore =
        auditItems.reduce(
            (sum, item) => {
                if (item.status === "NA")
                    return sum;

                return (
                    sum + item.actualScore
                );
            },
            0
        );

    const compliancePercentage =
        totalMaxScore === 0
            ? 0
            : (
                (totalActualScore /
                    totalMaxScore) *
                100
            ).toFixed(2);


    const filteredItems =
        auditItems.filter((item) =>
            item.parameter
                .toLowerCase()
                .includes(
                    searchText.toLowerCase()
                )
        );

    const groupedItems =
        filteredItems.reduce(
            (acc, item) => {
                if (!acc[item.category]) {
                    acc[item.category] = [];
                }

                acc[item.category].push(item);

                return acc;
            },
            {}
        );

    const handleObservationChange = (
        id,
        value
    ) => {
        const updatedItems =
            auditItems.map((item) =>
                item.id === id
                    ? {
                        ...item,
                        observation:
                            value,
                    }
                    : item
            );

        setAuditItems(updatedItems);
    };

    // const handleActionPlanChange = (
    //     id,
    //     value
    // ) => {

    //     const updatedItems =
    //         auditItems.map((item) =>
    //             item.id === id
    //                 ? {
    //                     ...item,
    //                     actionPlan: value,
    //                 }
    //                 : item
    //         );

    //     setAuditItems(updatedItems);
    // };

    const handleActionPlanChange = (
        id,
        value
    ) => {

        const updatedItems =
            auditItems.map((item) =>
                item.id === id
                    ? {
                        ...item,
                        actionPlan: value,

                        responsibility:
                            value.trim().toLowerCase() ===
                                "not applicable"
                                ? ""
                                : item.responsibility,

                        targetDate:
                            value.trim().toLowerCase() ===
                                "not applicable"
                                ? ""
                                : item.targetDate,
                    }
                    : item
            );

        setAuditItems(updatedItems);
    };

    const handleResponsibilityChange = (
        id,
        value
    ) => {

        const updatedItems =
            auditItems.map((item) =>
                item.id === id
                    ? {
                        ...item,
                        responsibility: value,
                    }
                    : item
            );

        setAuditItems(updatedItems);
    };

    const handleTargetDateChange = (
        id,
        value
    ) => {

        const updatedItems =
            auditItems.map((item) =>
                item.id === id
                    ? {
                        ...item,
                        targetDate: value,
                    }
                    : item
            );

        setAuditItems(updatedItems);
    };

    // const nonComplianceCount =
    //     auditItems.filter(
    //         (item) =>
    //             item.status ===
    //             "Non Compliance"
    //     ).length;

    const nonComplianceCount =
        auditItems.filter(
            (item) =>
                item.actualScore !== null &&
                item.status !== "NA" &&
                item.actualScore < 2
        ).length;

    const handleCompleteAudit = async () => {

        // const missingActionPlan =
        //     auditItems.some(
        //         item =>
        //             item.actualScore < 2 &&
        //             item.status !== "NA" &&
        //             !item.actionPlan?.trim()
        //     );

        // if (missingActionPlan) {
        //     alert(
        //         "Action Plan is mandatory for Non-Compliance findings."
        //     );
        //     return;
        // }

        const missingFields =
            auditItems.some(
                item =>
                    item.actualScore < 2 &&
                    item.status !== "NA" &&
                    (
                        !item.actionPlan?.trim() ||
                        !item.responsibility?.trim() ||
                        !item.targetDate
                    )
            );

        if (missingFields) {
            alert(
                "Action Plan, Responsibility and Target Date are mandatory for Non-Compliance findings."
            );
            return;
        }

        try {
            const updatedAudit = await updateAudit(Number(id), {
                compliance: Number(compliancePercentage),
                status: "Closed",
                checklist: auditItems,
                generalInfo,
            });

            setSelectedAudit(updatedAudit);


            setAudits((previous) =>
                previous.map((audit) =>
                    audit.id === Number(id) ? updatedAudit : audit
                )
            );
        } catch (error) {
            console.error(error);
            alert("Unable to complete audit.");
            return;
        }

        alert(
            "Audit completed successfully. No CAPA required."
        );

        navigate("/audits");
    };

    // const handleSelfAssessmentSubmit = async () => {

    //     try {

    //         const updatedAudit =
    //             await updateAudit(Number(id), {
    //                 checklist: auditItems,
    //                 generalInfo,
    //                 compliance: Number(compliancePercentage),
    //                 status: "Self Assessment Submitted",
    //             });

    //         setSelectedAudit(updatedAudit);

    //         setAudits((previous) =>
    //             previous.map((audit) =>
    //                 audit.id === Number(id)
    //                     ? updatedAudit
    //                     : audit
    //             )
    //         );

    //         alert("Self Assessment Submitted Successfully");

    //     } catch (error) {
    //         console.error(error);
    //         alert("Unable to submit self assessment.");
    //     }
    // };

    const handleSelfAssessmentSubmit = async () => {

        try {

            // Create Findings (all NC items)

            const findings =
                auditItems.filter(
                    item =>
                        item.status !== "NA" &&
                        item.actualScore < 2
                );

            // Create CAPAs automatically

            const capaRecords =
                findings.map((item, index) => ({
                    capaNo: `CAPA-${index + 1}`,
                    auditId: Number(id),

                    category: item.category,
                    section: item.section,

                    questionId: item.id,

                    parameter: item.parameter,

                    observation:
                        item.observation ||

                        "Observation not provided",

                    actionPlan: "",

                    responsibility: "",

                    targetDate: "",

                    status: "Open",
                }));

            // Prevent duplicate CAPA creation

            const existingCAPAs =
                await getCAPAs(Number(id));

            if (
                existingCAPAs &&
                existingCAPAs.length > 0
            ) {
                alert(
                    "Self Assessment already submitted."
                );
                return;
            }

            if (capaRecords.length > 0) {

                await saveCAPAs(
                    capaRecords
                );
            }

            await addNotification({

                role: "CQA",

                auditId: Number(id),

                title: "Self Assessment Submitted",

                message:
                    `${selectedAudit?.depot}
         has submitted Desktop Self Assessment.`,

                link: `/annexure1/${id}`,
            });

            // Notify SAP (NGD) so it can trigger the CQA email off the Flag.
            notifyCapaSet({
                flag: SAP_FLAG.SELF_ASSESSMENT_SUBMITTED,
                auditNo: selectedAudit?.auditNo,
                totalCapa: capaRecords.length,
                capaSubm: 0,
                capaOpen: capaRecords.length,
            });

            const updatedAudit =
                await updateAudit(Number(id), {
                    checklist: auditItems,
                    generalInfo,
                    compliance: Number(compliancePercentage),
                    status: "Self Assessment Submitted",
                });

            setSelectedAudit(updatedAudit);

            setAudits((previous) =>
                previous.map((audit) =>
                    audit.id === Number(id)
                        ? updatedAudit
                        : audit
                )
            );

            alert(
                "Self Assessment Submitted Successfully."
            );

        } catch (error) {

            console.error(error);

            alert(
                "Unable to submit self assessment."
            );
        }
    };

    const handleApproveSelfAssessment =
        async () => {

            try {

                const updatedAudit =
                    await updateAudit(
                        Number(id),
                        {
                            status: "CAPA Open",
                        }
                    );

                setSelectedAudit(
                    updatedAudit
                );

                setAudits(previous =>
                    previous.map(a =>
                        a.id === Number(id)
                            ? updatedAudit
                            : a
                    )
                );

                await addNotification({
                    role: "Depot",
                    auditId: Number(id),
                    title: "Assessment Approved",
                    message:
                        "Your self assessment has been approved.",
                    link: `/capa/${id}`,
                });

                // Notify SAP (NGD) so it can trigger the depot email off the Flag.
                notifyCapaSet({
                    flag: SAP_FLAG.SELF_ASSESSMENT_ACCEPTED,
                    auditNo: selectedAudit?.auditNo,
                });

                alert(
                    "Assessment Approved"
                );

            } catch (error) {
                console.error(error);
            }
        };

    const handleRejectSelfAssessment =
        async () => {

            try {

                const updatedAudit =
                    await updateAudit(
                        Number(id),
                        {
                            status: "Rework Required",
                        }
                    );

                setSelectedAudit(
                    updatedAudit
                );

                setAudits(previous =>
                    previous.map(a =>
                        a.id === Number(id)
                            ? updatedAudit
                            : a
                    )
                );

                await addNotification({
                    role: "Depot",
                    auditId: Number(id),
                    title: "Rework Required",
                    message:
                        "Please revise and resubmit your assessment.",
                    link: `/annexure1/${id}`,
                });

                alert(
                    "Sent back for rework"
                );

            } catch (error) {
                console.error(error);
            }
        };


    const handleAddQuestion = (
        category
    ) => {

        const newQuestion = {
            id: Date.now(),

            category,

            parameter: "",

            status: "",

            observation: "",

            actionPlan: "",

            responsibility: "",

            targetDate: "",

            maxScore: 3,

            actualScore: null,

            evidence: null,

            isCustom: true,
        };

        setAuditItems((prev) => [
            // ...auditItems,
            ...prev,
            newQuestion,
        ]);
        setTimeout(() => {


            const element =

                document.getElementById(

                    `question-${newQuestion.id}`

                );

            if (element) {
                element.scrollIntoView({
                    behavior: "smooth",
                    block: "center",

                });

            }

        }, 200);
    };

    const handleQuestionChange = (
        id,
        value
    ) => {

        const updatedItems =
            auditItems.map((item) =>
                item.id === id
                    ? {
                        ...item,
                        parameter: value,
                    }
                    : item
            );

        setAuditItems(updatedItems);
    };

    const handleDeleteQuestion = (
        questionId
    ) => {

        const updated =
            auditItems.filter(
                (item) =>
                    item.id !==
                    questionId
            );

        setAuditItems(updated);
    };

    const getCategoryIcon = (category) => {

        switch (category) {

            case "Building / Premises":
                return <BusinessIcon color="primary" />;

            case "Safety":
                return <SecurityIcon color="error" />;

            case "Documentation":
                return <DescriptionIcon color="success" />;

            case "General Hygiene":
                return <Inventory2Icon color="warning" />;

            case "Material Control":
                return <LocalShippingIcon color="info" />;

            case "Training":
                return <ScienceIcon color="secondary" />;

            case "SOPs":
                return <WarehouseIcon color="primary" />;

            default:
                return <DescriptionIcon />;
        }
    };

    const [expandedCategory, setExpandedCategory] =
        useState(
            Object.keys(groupedItems)[0]
        );


    // const handleEvidenceUpload = (
    //     questionId,
    //     file
    // ) => {

    //     const updatedItems =
    //         auditItems.map((item) =>
    //             item.id === questionId
    //                 ? {
    //                     ...item,
    //                     evidence: file.name,
    //                 }
    //                 : item
    //         );

    //     setAuditItems(updatedItems);
    // };

    const handleEvidenceUpload = (
        questionId,
        file
    ) => {

        if (!file) return;

        const updatedItems =
            auditItems.map((item) =>
                item.id === questionId
                    ? {
                        ...item,
                        // evidence: {
                        //     name: file.name,
                        //     preview:
                        //         URL.createObjectURL(file),
                        // },

                        // evidence: {
                        //     fileName: file.name,
                        //     filePath: "",
                        //     uploadedBy: currentUser?.username,
                        //     uploadedAt: new Date().toISOString(),
                        //     preview: URL.createObjectURL(file),
                        // }
                        evidence: {
                            auditId: Number(id),
                            questionId: item.id,
                            fileName: file.name,
                            filePath: "",
                            uploadedBy: currentUser?.username,
                            uploadedAt: new Date().toISOString(),
                            preview: URL.createObjectURL(file),
                        }
                    }
                    : item
            );

        setAuditItems(updatedItems);
    };

    const auditorSigRef =
        useRef();

    const depotSigRef = useRef();

    const [auditorSignature, setAuditorSignature] =
        useState(null);

    const handleAuditorSignatureUpload = (
        event
    ) => {

        const file =
            event.target.files?.[0];

        if (!file) return;

        setAuditorSignature({
            name: file.name,
            preview:
                URL.createObjectURL(file),
        });
    };

    // const [depotSignatureSubmitted,
    //     setDepotSignatureSubmitted] =
    //     useState(false);

    const hasDepotSignature =
        depotSigRef.current &&
        !depotSigRef.current.isEmpty();

    const handleDepotSignatureSubmit = async () => {

        const depotSignature =
            depotSigRef.current
                // ?.getTrimmedCanvas()
                ?.getCanvas()
                .toDataURL("image/png");

        try {
            const updatedAudit = await updateAudit(Number(id), {
                depotSignature,
                depotSignatureSubmitted: true,
                depotSignatureDate: new Date().toISOString(),
            });

            setSelectedAudit(updatedAudit);

            setAudits((previous) =>
                previous.map((audit) =>
                    audit.id === Number(id) ? updatedAudit : audit
                )
            );
        } catch (error) {
            console.error(error);
            alert("Unable to submit depot signature.");
            return;
        }

        alert(
            "Signature submitted successfully."
        );
    };

    const handleAuditorSignatureSubmit = async () => {

        if (
            !auditorSigRef.current ||
            auditorSigRef.current.isEmpty()
        ) {
            alert("Please provide auditor signature.");
            return;
        }

        const auditorSignature =
            auditorSigRef.current
                .getCanvas()
                .toDataURL("image/png");

        try {
            const updatedAudit = await updateAudit(Number(id), {
                auditorSignature,
                auditorSignatureSubmitted: true,
                auditorSignatureDate: new Date().toISOString(),
            });

            setSelectedAudit(updatedAudit);
            console.log("Updated Audit:", updatedAudit);
            setAudits((previous) =>
                previous.map((audit) =>
                    audit.id === Number(id) ? updatedAudit : audit
                )
            );
        } catch (error) {
            console.error(error);
            alert("Unable to submit auditor signature.");
            return;
        }



        alert(
            "Auditor signature submitted successfully."
        );
    };

    const sectionColors = {
        "Facility": "#2563EB",
        "Loading / unloading": "#0891B2",
        "Material Control": "#16A34A",
        "SOPs": "#7C3AED",
        "Redressal/rework": "#EA580C",
        "Destruction": "#DC2626",
        "Safety": "#2563EB",
        "Emergency/evacuation plan": "#CA8A04",
        "Fire Extinguisher": "#DC2626",
        "First AID": "#16A34A",
        "Training": "#7C3AED",
        "Housekeeping/Hygiene": "#0891B2",
        "Product storage": "#16A34A",
        "Goods Reciept/Handling": "#EA580C",
        "Environmental control-Inside the Godown": "#0284C7",
    };

    const [generalInfo, setGeneralInfo] = useState({
        depotName: selectedAudit?.depot || "",
        depotIncharge: "",
        godownAddress: "",
        officeAddress: "",
        visitedAuditedBy: selectedAudit?.auditor || "",
        dateOfVisitAudit: "",
        purposeOfVisitAudit: "",
        layoutDisplay: "",
        statutoryLicences: "",
        insuranceCoverage: "",
    });

    // useEffect(() => {
    //     if (!selectedAudit) return;

    //     setGeneralInfo({
    //         depotName:
    //             selectedAudit?.generalInfo?.depotName ||
    //             selectedAudit?.depot ||
    //             "",

    //         depotIncharge:
    //             selectedAudit?.generalInfo?.depotIncharge ||
    //             "",

    //         godownAddress:
    //             selectedAudit?.generalInfo?.godownAddress ||
    //             "",

    //         officeAddress:
    //             selectedAudit?.generalInfo?.officeAddress ||
    //             "",

    //         visitedAuditedBy:
    //             selectedAudit?.generalInfo?.visitedAuditedBy ||
    //             selectedAudit?.auditor ||
    //             "",

    //         dateOfVisitAudit:
    //             selectedAudit?.generalInfo?.dateOfVisitAudit ||
    //             "",

    //         purposeOfVisitAudit:
    //             selectedAudit?.generalInfo?.purposeOfVisitAudit ||
    //             "",

    //         layoutDisplay:
    //             selectedAudit?.generalInfo?.layoutDisplay ||
    //             "",

    //         statutoryLicences:
    //             selectedAudit?.generalInfo?.statutoryLicences ||
    //             "",

    //         insuranceCoverage:
    //             selectedAudit?.generalInfo?.insuranceCoverage ||
    //             "",
    //     });
    // }, [selectedAudit]);

    useEffect(() => {
        if (!selectedAudit) return;

        setGeneralInfo(prev => {

            if (prev.depotName || prev.depotIncharge) {
                return prev;
            }

            return {
                depotName:
                    selectedAudit?.generalInfo?.depotName ||
                    selectedAudit?.depot ||
                    "",

                depotIncharge:
                    selectedAudit?.generalInfo?.depotIncharge ||
                    "",

                godownAddress:
                    selectedAudit?.generalInfo?.godownAddress ||
                    "",

                officeAddress:
                    selectedAudit?.generalInfo?.officeAddress ||
                    "",

                visitedAuditedBy:
                    selectedAudit?.generalInfo?.visitedAuditedBy ||
                    selectedAudit?.auditor ||
                    "",

                dateOfVisitAudit:
                    selectedAudit?.generalInfo?.dateOfVisitAudit ||
                    "",

                purposeOfVisitAudit:
                    selectedAudit?.generalInfo?.purposeOfVisitAudit ||
                    "",

                layoutDisplay:
                    selectedAudit?.generalInfo?.layoutDisplay ||
                    "",

                statutoryLicences:
                    selectedAudit?.generalInfo?.statutoryLicences ||
                    "",

                insuranceCoverage:
                    selectedAudit?.generalInfo?.insuranceCoverage ||
                    "",
            };
        });
    }, [selectedAudit]);

    const handleGeneralInfoChange = (field, value) => {
        setGeneralInfo((prev) => ({
            ...prev,
            [field]: value,
        }));
    };




    // const handleSubmitSignature = async () => {
    //     if (!signatureData) {
    //         return;
    //     }

    //     try {
    //         const updatedAudit = await updateAudit(id, {
    //             auditorSignature: signatureData,
    //             auditorSignatureSubmitted: true,
    //             auditorSignatureDate: new Date().toISOString()
    //         });

    //         setAudit(updatedAudit);

    //         // Clear canvas after successful API save
    //         if (signaturePadRef.current) {
    //             signaturePadRef.current.clear();
    //         }

    //         setSignatureData("");

    //     } catch (error) {
    //         console.error("Error submitting signature:", error);
    //     }
    // };

    const categoryCompliance = Object.entries(
        auditItems.reduce((acc, item) => {

            const category = item.category || "Others";

            if (!acc[category]) {
                acc[category] = {
                    maxScore: 0,
                    actualScore: 0,
                };
            }

            if (item.status !== "NA") {
                acc[category].maxScore += Number(item.maxScore || 0);
                acc[category].actualScore += Number(item.actualScore || 0);
            }

            return acc;
        }, {})
    ).map(([category, scores]) => ({
        category,
        maxScore: scores.maxScore,
        actualScore: scores.actualScore,
        compliance:
            scores.maxScore === 0
                ? 0
                : (
                    (scores.actualScore / scores.maxScore) *
                    100
                ).toFixed(2),
    }));

    return (
        // <Box
        //     sx={{
        //         maxWidth: 1400,
        //         mx: "auto",
        //     }}
        // >

        <Box
            sx={{
                maxWidth:
                    isAuditorTablet
                        ? "100%"
                        : 1400,
                mx: "auto",
                px:
                    isAuditorTablet
                        ? 1
                        : 0,
            }}
        >
            <Card
                sx={{
                    mb: 3,
                    // bgcolor: "#1565c0",
                    background: "linear-gradient(135deg,#4F46E5,#6366F1)",
                    color: "white",
                    boxShadow:
                        "0px 4px 20px rgba(0,0,0,0.08)",
                }}
            >
                {/* <CardContent>
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
                            <Typography
                                variant={isTablet ? "h5" : "h4"}
                                fontWeight={600}
                            >
                                DEPOT AUDIT CHECK LIST

                            </Typography>

                            <Typography>
                                Audit No: {selectedAudit?.auditNo}
                            </Typography>
                        </Box>
                    </Box>
                </CardContent> */}


                <CardContent>
                    <Box
                        sx={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            flexWrap: "wrap",
                            gap: 3,
                        }}
                    >
                        {/* Left Side */}
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
                                    objectFit: "contain",
                                    p: 1,
                                }}
                            />

                            <Box>
                                <Typography
                                    variant="h5"
                                    fontWeight={700}
                                    sx={{ mb: 0.5 }}
                                >
                                    DEPOT AUDIT CHECK LIST
                                </Typography>

                                <Typography variant="body1">
                                    Audit No: {selectedAudit?.auditNo}
                                </Typography>
                            </Box>
                        </Box>

                        {/* Right Side Summary */}
                        <Card
                            sx={{
                                minWidth: 320,
                                bgcolor: "rgba(255,255,255,0.15)",
                                color: "#fff",
                                borderRadius: 2,
                            }}
                        >
                            <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
                                <Typography
                                    fontWeight={700}
                                    sx={{ mb: 1 }}
                                >
                                    Element Compliance %
                                </Typography>

                                {categoryCompliance.map((item) => (
                                    <Box
                                        key={item.category}
                                        sx={{
                                            display: "flex",
                                            justifyContent: "space-between",
                                            alignItems: "center",
                                            mb: 0.5,
                                        }}
                                    >
                                        <Typography variant="body2">
                                            {item.category}
                                        </Typography>

                                        <Typography
                                            variant="body2"
                                            fontWeight={700}
                                        >
                                            {item.compliance}%
                                        </Typography>
                                    </Box>
                                ))}

                                {/* Total */}
                                <Box
                                    sx={{
                                        mt: 1,
                                        pt: 1,
                                        borderTop:
                                            "1px solid rgba(255,255,255,0.3)",
                                        display: "flex",
                                        justifyContent: "space-between",
                                        alignItems: "center",
                                    }}
                                >
                                    <Typography fontWeight={700}>
                                        Total
                                    </Typography>

                                    <Typography fontWeight={700}>
                                        {compliancePercentage}%
                                    </Typography>
                                </Box>
                            </CardContent>
                        </Card>
                    </Box>
                </CardContent>
            </Card>

            {/* <Typography variant="h4" gutterBottom>
                Annexure-1 Audit Checklist
            </Typography>

            <Typography gutterBottom>
                Audit ID: {id}
            </Typography> */}

            {/* <Paper sx={{ p: 3, mb: 3 }}> */}
            <Card
                sx={{
                    mb: 3,
                    borderRadius: 3,
                    border: "1px solid #D1D5DB",
                    borderLeft: "6px solid #2563EB",
                    boxShadow:
                        "0px 4px 14px rgba(0,0,0,0.06)",
                    overflow: "hidden",
                }}
            >
                <CardContent sx={{ p: isAuditorTablet ? 2 : 3 }}>

                    <Typography
                        variant={isAuditorTablet ? "h6" : "h5"}
                        fontWeight={700}
                        sx={{
                            mb: 3,
                            color: "#1E293B",
                        }}
                    >
                        General Information
                    </Typography>

                    <Grid container spacing={2.5}>

                        {/* 1. Name of Depot */}
                        <Grid item xs={12}>
                            <TextField
                                fullWidth
                                label="Name of Depot"
                                value={generalInfo.depotName}
                                onChange={(e) =>
                                    handleGeneralInfoChange(
                                        "depotName",
                                        e.target.value
                                    )
                                }
                                // disabled={isDepot}
                                disabled={!canEditAnnexure}
                            />
                        </Grid>

                        {/* 2. Name & Phone no. of Depot Incharge */}
                        <Grid item xs={12}>
                            <TextField
                                fullWidth
                                label="Name & Phone No. of Depot Incharge"
                                value={generalInfo.depotIncharge}
                                onChange={(e) =>
                                    handleGeneralInfoChange(
                                        "depotIncharge",
                                        e.target.value
                                    )
                                }
                                // disabled={isDepot}
                                disabled={!canEditAnnexure}
                            />
                        </Grid>

                        {/* 3. Go down Address */}
                        <Grid item xs={12}>
                            <TextField
                                fullWidth
                                multiline
                                rows={2}
                                label="Go down Address"
                                value={generalInfo.godownAddress}
                                onChange={(e) =>
                                    handleGeneralInfoChange(
                                        "godownAddress",
                                        e.target.value
                                    )
                                }
                                // disabled={isDepot}
                                disabled={!canEditAnnexure}
                            />
                        </Grid>

                        {/* 4. Office Address */}
                        <Grid item xs={12}>
                            <TextField
                                fullWidth
                                multiline
                                rows={2}
                                label="Office Address"
                                value={generalInfo.officeAddress}
                                onChange={(e) =>
                                    handleGeneralInfoChange(
                                        "officeAddress",
                                        e.target.value
                                    )
                                }
                                // disabled={isDepot}
                                disabled={!canEditAnnexure}
                            />
                        </Grid>

                        {/* 5. Visited/Audited By */}
                        <Grid item xs={12}>
                            <TextField
                                fullWidth
                                label="Visited / Audited By"
                                value={generalInfo.visitedAuditedBy}
                                onChange={(e) =>
                                    handleGeneralInfoChange(
                                        "visitedAuditedBy",
                                        e.target.value
                                    )
                                }
                                // disabled={isDepot}
                                disabled={!canEditAnnexure}
                            />
                        </Grid>

                        {/* 6. Date of Visit/Audit */}
                        {/* <Grid item xs={12}>
                            <TextField
                                fullWidth
                                type="date"
                                label="Date of Visit / Audit"
                                value={generalInfo.dateOfVisitAudit}
                                onChange={(e) =>
                                    handleGeneralInfoChange(
                                        "dateOfVisitAudit",
                                        e.target.value
                                    )
                                }
                                disabled={isDepot}
                                InputLabelProps={{
                                    shrink: true,
                                }}
                            />
                        </Grid> */}

                        {/* <Grid item xs={12} md={isAuditorTablet ? 12 : 4}>
                            <TextField
                                label="Date of Visit / Audit"
                                type="date"
                                fullWidth
                                value={selectedAudit?.auditDate || ""}
                                onChange={(e) => {
                                    const value = e.target.value;

                                    const updatedAudits = audits.map((audit) =>
                                        audit.id === Number(id)
                                            ? {
                                                ...audit,
                                                auditDate: value,
                                            }
                                            : audit
                                    );

                                    setAudits(updatedAudits);

                                    localStorage.setItem(
                                        "audits",
                                        JSON.stringify(updatedAudits)
                                    );
                                }}
                                InputLabelProps={{
                                    shrink: true,
                                }}
                            />
                        </Grid> */}

                        <Grid item xs={12} md={isAuditorTablet ? 12 : 4}>
                            <TextField
                                fullWidth
                                type="date"
                                label="Date of Visit / Audit"
                                value={
                                    generalInfo.dateOfVisitAudit || ""
                                }
                                onChange={(e) =>
                                    handleGeneralInfoChange(
                                        "dateOfVisitAudit",
                                        e.target.value
                                    )
                                }
                                // disabled={isDepot}
                                disabled={!canEditAnnexure}
                                slotProps={{
                                    inputLabel: {
                                        shrink: true,
                                    },
                                }}
                            />

                            {/* <TextField
                                fullWidth
                                type="date"
                                label="Date of Visit / Audit"
                                // value={selectedAudit?.auditDate || ""}
                                // value={
                                //     selectedAudit?.auditDate
                                //         ? selectedAudit.auditDate.split("T")[0]
                                //         : ""
                                // }
                                // value={generalInfo.dateOfVisitAudit || ""}
                                
                                onChange={async (e) => {
                                    const value = e.target.value;

                                    try {
                                        const updatedAudit = await updateAudit(Number(id), {
                                            auditDate: value,
                                        });

                                        setSelectedAudit(updatedAudit);


                                        setAudits((previous) =>
                                            previous.map((audit) =>
                                                audit.id === Number(id) ? updatedAudit : audit
                                            )
                                        );
                                    } catch (error) {
                                        console.error(error);
                                    }
                                }}
                                slotProps={{
                                    inputLabel: {
                                        shrink: true,
                                    },
                                }}
                            /> */}
                        </Grid>

                        {/* 7. Purpose of Visit/Audit */}
                        <Grid item xs={12}>
                            <TextField
                                fullWidth
                                multiline
                                rows={2}
                                label="Purpose of Visit / Audit"
                                value={generalInfo.purposeOfVisitAudit}
                                onChange={(e) =>
                                    handleGeneralInfoChange(
                                        "purposeOfVisitAudit",
                                        e.target.value
                                    )
                                }
                                // disabled={isDepot}
                                disabled={!canEditAnnexure}
                            />
                        </Grid>

                        {/* 8. Lay out display */}
                        <Grid item xs={12}>
                            <TextField
                                fullWidth
                                label="Lay out display"
                                value={generalInfo.layoutDisplay}
                                onChange={(e) =>
                                    handleGeneralInfoChange(
                                        "layoutDisplay",
                                        e.target.value
                                    )
                                }
                                // disabled={isDepot}
                                disabled={!canEditAnnexure}
                            />
                        </Grid>

                        {/* 9. Display of statutory licences */}
                        <Grid item xs={12}>
                            <TextField
                                fullWidth
                                multiline
                                rows={2}
                                label="Display of Statutory Licences"
                                value={generalInfo.statutoryLicences}
                                onChange={(e) =>
                                    handleGeneralInfoChange(
                                        "statutoryLicences",
                                        e.target.value
                                    )
                                }
                                // disabled={isDepot}
                                disabled={!canEditAnnexure}
                            />
                        </Grid>

                        {/* 10. Copy of insurance coverage */}
                        <Grid item xs={12}>
                            <TextField
                                fullWidth
                                multiline
                                rows={2}
                                label="Copy of Insurance Coverage of Building & Goods"
                                value={generalInfo.insuranceCoverage}
                                onChange={(e) =>
                                    handleGeneralInfoChange(
                                        "insuranceCoverage",
                                        e.target.value
                                    )
                                }
                                // disabled={isDepot}
                                disabled={!canEditAnnexure}
                            />
                        </Grid>

                    </Grid>
                </CardContent>
            </Card>

            <Box
                sx={{
                    display: "flex",
                    // justifyContent: "flex-end",
                    justifyContent:
                        isTablet
                            ? "stretch"
                            : "flex-end",

                    mb: 3,
                }}
            >
                <TextField
                    size="small"
                    placeholder="Search Question..."
                    value={searchText}
                    onChange={(e) =>
                        setSearchText(
                            e.target.value
                        )
                    }
                    sx={{
                        // width: isTablet ? "100%" : 320,
                        width:
                            isAuditorTablet
                                ? "100%"
                                : 320,
                        bgcolor: "white",

                        "& .MuiOutlinedInput-root": {
                            borderRadius: 3,
                        },
                    }}
                    InputProps={{
                        startAdornment: (
                            <InputAdornment position="start">
                                <SearchIcon />
                            </InputAdornment>
                        ),
                    }}
                />
            </Box>

            {/* Sticky Tablet Summary */}
            {
                isAuditorTablet && (
                    <Card
                        sx={{
                            mb: 2,
                            position: "sticky",
                            top: 0,
                            zIndex: 100,
                            bgcolor: "white",
                            borderRadius: 2,
                            boxShadow: 2,
                        }}
                    >
                        {/* <CardContent> */}
                        <CardContent
                            sx={{
                                py: 1,
                            }}
                        >
                            <Grid container spacing={2}>
                                <Grid item xs={4}>
                                    <Typography variant="caption">
                                        Questions
                                    </Typography>

                                    {/* <Typography variant="h6"> */}
                                    <Typography
                                        variant="body1"
                                        fontWeight={700}
                                    >
                                        {auditItems.length}
                                    </Typography>
                                </Grid>

                                <Grid item xs={4}>
                                    <Typography variant="caption">
                                        Findings
                                    </Typography>

                                    <Typography
                                        variant="body1"
                                        fontWeight={700}
                                        color="error.main"
                                    >
                                        {nonComplianceCount}
                                    </Typography>
                                </Grid>

                                <Grid item xs={4}>
                                    <Typography variant="caption">
                                        Compliance
                                    </Typography>

                                    <Typography
                                        variant="body1"
                                        fontWeight={700}
                                        color="primary.main"
                                    >
                                        {compliancePercentage}%
                                    </Typography>
                                </Grid>
                            </Grid>
                            <LinearProgress
                                variant="determinate"
                                value={Number(compliancePercentage)}
                                sx={{
                                    mt: 2,
                                    height: 10,
                                    borderRadius: 5,

                                    "& .MuiLinearProgress-bar": {
                                        borderRadius: 5,
                                    },
                                }}
                            />
                            <Typography
                                variant="body2"
                                sx={{
                                    mt: 1,
                                    textAlign: "right",
                                    fontWeight: 600,
                                }}
                            >
                                {compliancePercentage}% Complete
                            </Typography>
                        </CardContent>
                    </Card>
                )
            }


            {/*the Accordions  */}
            {
                Object.entries(groupedItems).map(
                    ([category, items]) => (
                        <Accordion
                            key={category}
                            expanded={
                                expandedCategory === category
                            }
                            onChange={() =>
                                setExpandedCategory(
                                    expandedCategory === category
                                        ? false
                                        : category
                                )
                            }
                            sx={{
                                mb: 3,

                                boxShadow: 2,

                                border:
                                    expandedCategory === category
                                        ? "2px solid #4F46E5"
                                        : "1px solid #E5E7EB",
                            }}
                        >

                            <AccordionSummary
                                expandIcon={<ExpandMoreIcon />}
                            >
                                <Box
                                    sx={{
                                        width: "100%",
                                        display: "flex",
                                        justifyContent: "space-between",
                                        alignItems: "center",
                                        pr: 2,
                                    }}
                                >
                                    {/* <Typography
                                        variant="h6"
                                        fontWeight="bold"
                                    >
                                        {category} ({items.length})
                                    </Typography> */}

                                    <Box
                                        sx={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 1,
                                        }}
                                    >
                                        {getCategoryIcon(category)}

                                        {/* <Typography
                                            variant="h6"
                                            fontWeight="bold"
                                        >
                                            {category} ({items.length})
                                        </Typography> */}
                                        <Typography
                                            fontWeight={700}
                                            sx={{
                                                fontSize:
                                                    isAuditorTablet
                                                        ? "1.15rem"
                                                        : "1rem",
                                            }}
                                        >
                                            {category} ({items.length})
                                        </Typography>
                                    </Box>
                                    {!isDepot && (
                                        <Button

                                            // variant="contained"
                                            variant="text"
                                            // size="large"
                                            size={
                                                isAuditorTablet
                                                    ? "large"
                                                    : "medium"
                                            }

                                            sx={{
                                                // minHeight: 50,
                                                // minHeight:
                                                //     isAuditorTablet
                                                //         ? 50
                                                //         : 36,

                                                fontSize:
                                                    isAuditorTablet
                                                        ? "0.85rem"
                                                        : "0.75rem",

                                                minWidth: "auto",

                                                fontWeight: 600,
                                                px: 1,

                                            }}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleAddQuestion(category);
                                            }}
                                        >
                                            + Add
                                        </Button>
                                    )}
                                </Box>
                            </AccordionSummary>

                            <AccordionDetails>
                                {/* {!isDepot && (
                                    <Button

                                        variant="contained"
                                        // size="large"
                                        size={
                                            isAuditorTablet
                                                ? "large"
                                                : "medium"
                                        }
                                        sx={{
                                            // minHeight: 50,
                                            minHeight:
                                                isAuditorTablet
                                                    ? 50
                                                    : 36,
                                            px: 3,
                                        }}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleAddQuestion(category);
                                        }}
                                    >
                                        + Add Question
                                    </Button>
                                )} */}

                                {/* {items.map((item) => (
                                    <AuditQuestionCard
                                        key={item.id}
                                        item={item}
                                        handleStatusChange={
                                            handleStatusChange
                                        }
                                        handleObservationChange={
                                            handleObservationChange
                                        }
                                        handleQuestionChange={
                                            handleQuestionChange
                                        }
                                        handleDeleteQuestion={
                                            handleDeleteQuestion
                                        }
                                        handleEvidenceUpload={
                                            handleEvidenceUpload
                                        }
                                    />
                                ))} */}

                                {Object.entries(
                                    items.reduce((acc, item) => {
                                        const sectionName =
                                            item.section || "General";

                                        if (!acc[sectionName]) {
                                            acc[sectionName] = [];
                                        }

                                        acc[sectionName].push(item);

                                        return acc;
                                    }, {})
                                ).map(([section, sectionItems]) => (
                                    <Card
                                        key={section}
                                        sx={{
                                            mb: 3,
                                            borderRadius: 3,
                                            border: "1px solid #D1D5DB",
                                            borderLeft: `6px solid ${sectionColors[section] || "#2563EB"
                                                }`,
                                            boxShadow:
                                                "0px 3px 12px rgba(0,0,0,0.06)",
                                            overflow: "hidden",
                                            backgroundColor: "#FFFFFF",
                                        }}
                                    >
                                        {/* SUBSECTION HEADER */}
                                        <Box
                                            sx={{
                                                px: 2.5,
                                                py: 1.5,
                                                backgroundColor: "#F8FAFC",
                                                borderBottom:
                                                    "1px solid #E2E8F0",
                                            }}
                                        >
                                            <Typography
                                                fontWeight={700}
                                                sx={{
                                                    fontSize:
                                                        isAuditorTablet
                                                            ? "1.15rem"
                                                            : "1rem",
                                                    color: "#1E293B",
                                                }}
                                            >
                                                {section}
                                            </Typography>
                                        </Box>

                                        {/* QUESTIONS */}
                                        <Box sx={{ p: 2 }}>
                                            {sectionItems.map((item) => (
                                                <AuditQuestionCard
                                                    key={item.id}
                                                    item={item}
                                                    auditType={selectedAudit?.auditType}
                                                    canEditAnnexure={canEditAnnexure}
                                                    handleStatusChange={
                                                        handleStatusChange
                                                    }
                                                    handleObservationChange={
                                                        handleObservationChange
                                                    }
                                                    handleActionPlanChange={
                                                        handleActionPlanChange
                                                    }
                                                    handleResponsibilityChange={
                                                        handleResponsibilityChange
                                                    }
                                                    handleTargetDateChange={
                                                        handleTargetDateChange
                                                    }
                                                    handleQuestionChange={
                                                        handleQuestionChange
                                                    }
                                                    handleDeleteQuestion={
                                                        handleDeleteQuestion
                                                    }
                                                    handleEvidenceUpload={
                                                        handleEvidenceUpload
                                                    }
                                                />
                                            ))}
                                        </Box>
                                    </Card>
                                ))}
                            </AccordionDetails>
                        </Accordion>
                    )
                )
            }


            {/* <Card
                sx={{
                    mb: 3,
                    borderRadius: 1,
                    boxShadow:
                        "0px 10px 30px rgba(15,23,42,0.08)",
                }}
            >
                <CardContent>

                    <Typography
                        variant="h6"
                        fontWeight={700}
                        gutterBottom
                    >
                        Audit Summary
                    </Typography>

                    <Grid
                        container
                        spacing={3}
                    >

                        <Grid item xs={12} sm={4} md={2}>
                            <Box textAlign="center">
                                <Typography
                                    color="text.secondary"
                                >
                                    Questions
                                </Typography>

                                <Typography
                                    variant="h4"
                                    fontWeight={400}
                                >
                                    {auditItems.length}
                                </Typography>
                            </Box>
                        </Grid>

                        <Grid item xs={12} sm={4} md={2}>
                            <Box textAlign="center">
                                <Typography
                                    color="success.main"
                                >
                                    Compliance
                                </Typography>

                                <Typography
                                    variant="h4"
                                    fontWeight={400}
                                    color="success.main"
                                >
                                    {
                                        auditItems.filter(
                                            item =>
                                                item.status ===
                                                "Compliance"
                                        ).length
                                    }
                                </Typography>
                            </Box>
                        </Grid>

                        <Grid item xs={12} sm={4} md={2}>
                            <Box textAlign="center">
                                <Typography
                                    color="error.main"
                                >
                                    Findings
                                </Typography>

                                <Typography
                                    variant="h4"
                                    fontWeight={400}
                                    color="error.main"
                                >
                                    {
                                        auditItems.filter(
                                            item =>
                                                item.status ===
                                                "Non Compliance"
                                        ).length
                                    }
                                </Typography>
                            </Box>
                        </Grid>

                        <Grid item xs={12} sm={4} md={2}>
                            <Box textAlign="center">
                                <Typography
                                    color="text.secondary"
                                >
                                    Max Score
                                </Typography>

                                <Typography
                                    variant="h4"
                                    fontWeight={400}
                                >
                                    {totalMaxScore}
                                </Typography>
                            </Box>
                        </Grid>

                        <Grid item xs={12} sm={4} md={2}>
                            <Box textAlign="center">
                                <Typography
                                    color="text.secondary"
                                >
                                    Actual Score
                                </Typography>

                                <Typography
                                    variant="h4"
                                    fontWeight={400}
                                >
                                    {totalActualScore}
                                </Typography>
                            </Box>
                        </Grid>

                        <Grid item xs={12} sm={4} md={2}>
                            <Box textAlign="center">
                                <Typography
                                    color="primary.main"
                                >
                                    Compliance %
                                </Typography>

                                <Typography
                                    variant="h4"
                                    fontWeight={400}
                                    color={
                                        compliancePercentage >= 90
                                            ? "success.main"
                                            : compliancePercentage >= 70
                                                ? "warning.main"
                                                : "error.main"
                                    }
                                >
                                    {compliancePercentage}%
                                </Typography>

                            </Box>

                        </Grid>
                    </Grid>
                </CardContent>
            </Card> */}


            <Card
                sx={{
                    mb: 3,
                    borderRadius: 2,
                    boxShadow: 2,
                }}
            >
                <CardContent>


                    {/* console.log("selectedAudit", selectedAudit); */}
                    <TextField
                        label="Name of Auditor"
                        value={selectedAudit?.auditor || ""}

                        InputProps={{
                            readOnly: true,
                        }}
                        sx={{
                            width: 300,
                            mb: 2,
                        }}
                    />

                    <Typography
                        fontWeight={600}
                        sx={{ mb: 1 }}
                    >
                        Auditor Signature
                    </Typography>

                    {
                        selectedAudit?.auditorSignatureSubmitted ? (
                            <>
                                <Box
                                    sx={{
                                        width: 300,
                                        height: 90,
                                        border: "1px solid #d1d5db",
                                        borderRadius: 2,
                                        bgcolor: "#E5E7EB",
                                        overflow: "hidden",
                                        mb: 1,
                                    }}
                                >
                                    <img
                                        src={selectedAudit?.auditorSignature}
                                        alt="Auditor Signature"
                                        style={{
                                            width: "100%",
                                            height: "100%",
                                            objectFit: "contain",
                                            backgroundColor: "#fff",
                                        }}
                                    />
                                </Box>

                                <Typography
                                    color="success.main"
                                    fontWeight={600}
                                    sx={{ mt: 1, mb: 2 }}
                                >
                                    ✓ Auditor Signature Submitted
                                </Typography>
                            </>
                        ) : (
                            <>
                                <Box
                                    sx={{
                                        width: 300,
                                        height: 90,
                                        border: "1px solid #d1d5db",
                                        borderRadius: 2,
                                        bgcolor: "#FFFFFF",
                                        overflow: "hidden",
                                        mb: 1,
                                    }}
                                >
                                    <SignatureCanvas
                                        ref={auditorSigRef}
                                        disabled={isDepot}
                                        penColor="black"
                                        canvasProps={{
                                            width: 300,
                                            height: 90,
                                        }}
                                    />
                                </Box>

                                {!isDepot && (
                                    <>
                                        <Button
                                            size="small"
                                            color="error"
                                            onClick={() =>
                                                auditorSigRef.current?.clear()
                                            }
                                        >
                                            Clear Signature
                                        </Button>

                                        <Button
                                            component="label"
                                            size="small"
                                            sx={{ ml: 1 }}
                                        >
                                            Upload Signature
                                            <input
                                                hidden
                                                type="file"
                                                accept="image/*"
                                                onChange={handleAuditorSignatureUpload}
                                            />
                                        </Button>

                                        <Button
                                            variant="contained"
                                            size="small"
                                            sx={{ ml: 1 }}
                                            onClick={handleAuditorSignatureSubmit}
                                        >
                                            Submit Signature
                                        </Button>
                                    </>
                                )}
                            </>
                        )
                    }

                    {/* {
                        selectedAudit?.auditorSignatureSubmitted ? (

                            <Box
                                sx={{
                                    width: 300,
                                    height: 90,
                                    border: "1px solid #d1d5db",
                                    borderRadius: 2,
                                    bgcolor: "#E5E7EB",
                                    overflow: "hidden",
                                    mb: 1,
                                }}
                            >
                                <img
                                    src={
                                        selectedAudit?.auditorSignature
                                    }
                                    alt="Auditor Signature"
                                    style={{
                                        width: "100%",
                                        height: "100%", mb: 1,
                                    }}
                                />
                                <SignatureCanvas
                                    ref={auditorSigRef}
                                    disabled={isDepot}
                                    penColor="black"
                                    canvasProps={{
                                        width: 300,
                                        height: 90,
                                    }}
                                />
                            </Box>

                        )
                    } */}

                    {/* {
    selectedAudit?.auditorSignatureSubmitted ??(
       <Box
            sx={{
                width: 300,
                height: 90,
                border: "1px solid #d1d5db",
                borderRadius: 2,
                bgcolor: "#E5E7EB",
                overflow: "hidden",
                mb: 1,
            }}
        >
            <img
                src={selectedAudit?.auditorSignature}
                alt="Auditor Signature"
                style={{
                    width: "100%",
           border:"1px solid #d1d5db",
                borderRadius: 2,
                bgcolor: "#fff",
                mb: 1,
            }}
        />
            <SignatureCanvas
                ref={auditorSigRef}
                disabled={isDepot}
                penColor="black"
                canvasProps={{
                    width: 300,
                    height: 90,
                }}
            />
        </Box>
       
    )
}
                    {
                        !isDepot &&
                        !selectedAudit?.auditorSignatureSubmitted && (
                            <>
                                <Button
                                    size="small"
                                    color="error"
                                    onClick={() =>
                                        // auditorSigRef.current.clear()
                                        auditorSigRef.current?.clear()
                                    }
                                >
                                    Clear Signature
                                </Button>

                                <Button
                                    component="label"
                                    size="small"
                                    sx={{ ml: 1 }}
                                >
                                    Upload Signature
                                    <input
                                        hidden
                                        type="file"
                                        accept="image/*"
                                    />
                                </Button>

                                <Button
                                    variant="contained"
                                    size="small"
                                    sx={{ ml: 1 }}
                                    onClick={
                                        handleAuditorSignatureSubmit
                                    }
                                >
                                    Submit Signature
                                </Button>
                            </>
                        )
                    }

                    {
                        selectedAudit?.auditorSignatureSubmitted && (
                            <Typography
                                color="success.main"
                                fontWeight={600}
                                sx={{ mt: 1, mb: 2 }}
                            >
                                ✓ Auditor Signature Submitted
                            </Typography>
                        )
                    } */}

                    {/* Depot */}

                    {/* <TextField
                        label="Name of Depot Incharge"

                        value={
                            selectedAudit?.depotInchargeName || ""
                        }
                        disabled={!isDepot}
                        sx={{ mb: 2, width: 300 }}
                    /> */}

                    <Box
                        sx={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "flex-start",
                            mt: 3,
                        }}
                    >
                        <TextField
                            label="Name of Depot Incharge"
                            value={
                                selectedAudit?.depotInchargeName || ""
                            }
                            disabled={
                                !isDepot ||
                                selectedAudit?.depotSignatureSubmitted
                            }
                            sx={{ mb: 2 }}
                            onChange={async (e) => {
                                try {
                                    const updatedAudit = await updateAudit(Number(id), {
                                        depotInchargeName: e.target.value,
                                    });

                                    setSelectedAudit(updatedAudit);

                                    setAudits((previous) =>
                                        previous.map((audit) =>
                                            audit.id === Number(id) ? updatedAudit : audit
                                        )
                                    );
                                } catch (error) {
                                    console.error(error);
                                }
                            }}
                        />

                        <Typography
                            fontWeight={600}
                            sx={{ mb: 1 }}
                        >
                            Depot Incharge Signature
                        </Typography>

                    </Box>

                    {
                        selectedAudit?.depotSignatureSubmitted ? (
                            <>
                                <Box
                                    sx={{
                                        width: 300,
                                        height: 90,
                                        border: "1px solid #d1d5db",
                                        borderRadius: 2,
                                        bgcolor: "#E5E7EB",
                                        overflow: "hidden",
                                        mb: 1,
                                    }}
                                >
                                    <img
                                        src={selectedAudit?.depotSignature}
                                        alt="Depot Signature"
                                        style={{
                                            width: "100%",
                                            height: "100%",
                                            objectFit: "contain",
                                            backgroundColor: "#fff",
                                        }}
                                    />
                                </Box>

                                <Typography
                                    color="success.main"
                                    fontWeight={600}
                                    sx={{ mt: 1, mb: 2 }}
                                >
                                    ✓ Depot Signature Submitted
                                </Typography>
                            </>
                        ) : (
                            <>
                                <Box
                                    sx={{
                                        width: 300,
                                        height: 90,
                                        border: "1px solid #d1d5db",
                                        borderRadius: 2,
                                        bgcolor: "#FFFFFF",
                                        overflow: "hidden",
                                        mb: 1,
                                    }}
                                >
                                    <SignatureCanvas
                                        ref={depotSigRef}
                                        disabled={!isDepot}
                                        penColor="black"
                                        canvasProps={{
                                            width: 300,
                                            height: 90,
                                        }}
                                    />
                                </Box>

                                {isDepot && (
                                    <>
                                        <Button
                                            size="small"
                                            color="error"
                                            onClick={() =>
                                                depotSigRef.current?.clear()
                                            }
                                        >
                                            Clear Signature
                                        </Button>

                                        <Button
                                            component="label"
                                            size="small"
                                            sx={{ ml: 1 }}
                                        >
                                            Upload Signature
                                            <input
                                                hidden
                                                type="file"
                                                accept="image/*"
                                            />
                                        </Button>

                                        <Button
                                            variant="contained"
                                            size="small"
                                            sx={{ ml: 1 }}
                                            onClick={handleDepotSignatureSubmit}
                                        >
                                            Submit Signature
                                        </Button>
                                    </>
                                )}
                            </>
                        )
                    }

                    {/* {
                        selectedAudit?.depotSignatureSubmitted ?? (

                            <Box
                                sx={{
                                    width: 300,
                                    height: 90,
                                    border: "1px solid #d1d5db",
                                    borderRadius: 2,
                                    bgcolor: "#E5E7EB",
                                    overflow: "hidden",
                                    mb: 1,
                                }}
                            >
                                <img
                                    src={selectedAudit?.depotSignature}
                                    alt="Depot Signature"
                                    sx={{
                                        width: 300,
                                        height: 90,
                                        border: "1px solid #d1d5db",
                                        borderRadius: 2,
                                        bgcolor: "#FFFFFF",
                                        mb: 1,
                                    }}
                                />
                                <SignatureCanvas
                                    ref={depotSigRef}
                                    disabled={!isDepot}
                                    penColor="black"
                                    canvasProps={{
                                        width: 300,
                                        height: 90,
                                    }}
                                />
                            </Box>

                        )
                    }

                    {
                        isDepot &&
                        !selectedAudit?.depotSignatureSubmitted && (
                            <>
                                <Button
                                    size="small"
                                    color="error"
                                    onClick={() =>
                                        // depotSigRef.current.clear()
                                        depotSigRef.current?.clear()
                                    }
                                >
                                    Clear Signature
                                </Button>

                                <Button
                                    component="label"
                                    size="small"
                                    sx={{ ml: 1 }}
                                >
                                    Upload Signature
                                    <input
                                        hidden
                                        type="file"
                                        accept="image/*"
                                    />
                                </Button>

                                <Button
                                    variant="contained"
                                    size="small"
                                    sx={{ ml: 1 }}
                                    onClick={
                                        handleDepotSignatureSubmit
                                    }
                                >
                                    Submit Signature
                                </Button>
                            </>
                        )
                    }

                    {
                        selectedAudit?.depotSignatureSubmitted && (
                            <Typography
                                color="success.main"
                                fontWeight={600}
                                sx={{ mt: 1 }}
                            >
                                ✓ Depot Signature Submitted
                            </Typography>
                        )
                    } */}

                </CardContent>
            </Card>

            <Box
                sx={{
                    position: "sticky",
                    bottom: 0,
                    bgcolor: "white",
                    p: 2,
                    mt: 3,
                    borderTop: "1px solid #e0e0e0",

                    display: "flex",

                    flexDirection:
                        isAuditorTablet
                            ? "column"
                            : "row",

                    gap: 2,

                    justifyContent:
                        "space-between",

                    alignItems:
                        isAuditorTablet
                            ? "stretch"
                            : "center",

                    zIndex: 10,
                }}
            >
                <Typography>
                    Current Compliance:
                    <strong>
                        {" "}
                        {compliancePercentage}%
                    </strong>
                </Typography>

                {/* <Box> */}
                <Box
                    sx={{
                        display: "flex",

                        flexDirection:
                            isAuditorTablet
                                ? "column"
                                : "row",

                        gap: 1,

                        width:
                            isAuditorTablet
                                ? "100%"
                                : "auto",
                    }}
                >
                    {/* {!isDepot && ( */}
                    {/* {canEditAnnexure && ( */}
                    {(
                        (isDesktopAudit && isDepot) ||
                        (isOnsiteAudit && !isDepot)
                    ) && (

                            <Button
                                // variant="outlined"

                                // fullWidth={isAuditorTablet}

                                variant="contained"
                                size={
                                    isAuditorTablet
                                        ? "large"
                                        : "medium"
                                }
                                // sx={{
                                //     // minHeight: 50,
                                //     minHeight:
                                //         isAuditorTablet
                                //             ? 50
                                //             : 36,
                                //     px: 3,
                                // }}
                                sx={{
                                    width:
                                        isAuditorTablet
                                            ? "100%"
                                            : "auto",
                                    minHeight:
                                        isAuditorTablet
                                            ? 50
                                            : 36,
                                }}
                                // sx={{ mr: 2 }}
                                onClick={async () => {

                                    try {
                                        const updatedAudit = await updateAudit(Number(id), {
                                            checklist: auditItems,
                                            generalInfo,
                                        });

                                        setSelectedAudit(updatedAudit);

                                        setAudits((previous) =>
                                            previous.map((audit) =>
                                                audit.id === Number(id) ? updatedAudit : audit
                                            )
                                        );

                                        alert("Checklist draft saved successfully.");
                                    } catch (error) {
                                        console.error(error);
                                        alert("Unable to save checklist draft.");
                                    }
                                }}
                            >
                                Save Draft
                            </Button>
                        )}
                    {/* {!isDepot &&
                        nonComplianceCount === 0 && ( */}
                    {isOnsiteAudit &&
                        !isDepot &&
                        nonComplianceCount === 0 && (
                            <Button
                                variant="contained"
                                // fullWidth={isAuditorTablet}
                                size={
                                    isAuditorTablet
                                        ? "large"
                                        : "medium"
                                }
                                // sx={{
                                //     // minHeight: 50,
                                //     minHeight:
                                //         isAuditorTablet
                                //             ? 50
                                //             : 36,
                                //     px: 3,
                                // }}
                                sx={{
                                    width:
                                        isAuditorTablet
                                            ? "100%"
                                            : "auto",
                                    minHeight:
                                        isAuditorTablet
                                            ? 50
                                            : 36,
                                }}
                                color="success"
                                // sx={{ mr: 2 }}
                                onClick={async () => {

                                    try {
                                        const updatedAudit = await updateAudit(Number(id), {
                                            compliance: Number(compliancePercentage),
                                            status: "Closed",
                                            checklist: auditItems,
                                            generalInfo,
                                        });

                                        setSelectedAudit(updatedAudit);

                                        setAudits((previous) =>
                                            previous.map((audit) =>
                                                audit.id === Number(id) ? updatedAudit : audit
                                            )
                                        );
                                    } catch (error) {
                                        console.error(error);
                                        alert("Unable to complete audit.");
                                        return;
                                    }

                                    alert(
                                        "Audit completed successfully. No CAPA required."
                                    );

                                    navigate("/audits");
                                }}
                            >
                                Complete Audit
                            </Button>
                        )}

                    {/* {isDesktopAudit && isDepot && ( */}
                    {isDesktopAudit &&
                        isDepot &&
                        // selectedAudit?.status !==
                        // "Self Assessment Submitted" 
                        ["Open", "In Progress", "Rework Required"]
                            .includes(selectedAudit?.status)
                        && (
                            <Button
                                variant="contained"
                                color="primary"
                                onClick={handleSelfAssessmentSubmit}
                                sx={{
                                    width:
                                        isAuditorTablet
                                            ? "100%"
                                            : "auto",
                                    minHeight:
                                        isAuditorTablet
                                            ? 50
                                            : 36,
                                }}
                            >
                                Submit Self Assessment
                            </Button>
                        )}

                    {isDesktopAudit &&
                        isCQA &&
                        selectedAudit?.status ===
                        "Self Assessment Submitted" && (

                            <>
                                <Button
                                    variant="contained"
                                    color="success"
                                    onClick={handleApproveSelfAssessment}
                                >
                                    Approve Assessment
                                </Button>

                                <Button
                                    variant="contained"
                                    color="error"
                                    onClick={handleRejectSelfAssessment}
                                >
                                    Send For Rework
                                </Button>
                            </>
                        )}

                    {/* {!isDepot && ( */}
                    {!isDepot && isOnsiteAudit && (
                        <Button
                            variant="contained"
                            // fullWidth={isAuditorTablet}
                            size={
                                isAuditorTablet
                                    ? "large"
                                    : "medium"
                            }
                            // sx={{
                            //     // minHeight: 50,
                            //     minHeight:
                            //         isAuditorTablet
                            //             ? 50
                            //             : 36,
                            //     px: 3,
                            // }}
                            sx={{
                                width:
                                    isAuditorTablet
                                        ? "100%"
                                        : "auto",
                                minHeight:
                                    isAuditorTablet
                                        ? 50
                                        : 36,
                            }}
                            color="warning"
                            disabled={
                                nonComplianceCount === 0
                            }
                            onClick={async () => {

                                // const missingActionPlan =
                                //     auditItems.some(
                                //         item =>
                                //             item.actualScore < 2 &&
                                //             item.status !== "NA" &&
                                //             !item.actionPlan?.trim()
                                //     );

                                // if (missingActionPlan) {
                                //     alert(
                                //         "Action Plan is mandatory for Non-Compliance findings."
                                //     );
                                //     return;
                                // }

                                const missingFields =
                                    auditItems.some(
                                        item =>
                                            item.actualScore < 2 &&
                                            item.status !== "NA" &&
                                            (
                                                !item.actionPlan?.trim() ||
                                                !item.responsibility?.trim() ||
                                                !item.targetDate
                                            )
                                    );

                                if (missingFields) {
                                    alert(
                                        "Action Plan, Responsibility and Target Date are mandatory for Non-Compliance findings."
                                    );
                                    return;
                                }

                                const capaRecords =
                                    generateCAPA(auditItems);

                                const capaRecordsWithAuditId =
                                    capaRecords.map(
                                        (capa) => ({
                                            ...capa,
                                            auditId: Number(id),
                                        })
                                    );

                                const existingCAPAs =
                                    await getCAPAs(Number(id));

                                if (existingCAPAs.length > 0) {
                                    alert(
                                        "CAPA already generated for this audit."
                                    );
                                    return;
                                }

                                await saveCAPAs(
                                    capaRecordsWithAuditId
                                );

                                await addNotification({

                                    role: "Depot",

                                    auditId: Number(id),

                                    title:
                                        "CAPA Assigned",

                                    message:
                                        `${capaRecordsWithAuditId.length}
                                            CAPA(s) have been assigned.
                                            Please review and submit.`,

                                    link:
                                        `/capa/${id}`,
                                });

                                // saveCAPAs(capaRecords);



                                try {
                                    const updatedAudit = await updateAudit(Number(id), {
                                        compliance: Number(compliancePercentage),
                                        status: "CAPA Open",
                                        checklist: auditItems,
                                        generalInfo,
                                    });

                                    setSelectedAudit(updatedAudit);


                                    setAudits((previous) =>
                                        previous.map((audit) =>
                                            audit.id === Number(id) ? updatedAudit : audit
                                        )
                                    );

                                    navigate(`/capa/${id}`);
                                } catch (error) {
                                    console.error(error);
                                    alert("Unable to update audit.");
                                }
                            }}
                        >
                            Generate CAPA
                        </Button>
                    )}
                </Box>
            </Box>
        </Box >
    );
}