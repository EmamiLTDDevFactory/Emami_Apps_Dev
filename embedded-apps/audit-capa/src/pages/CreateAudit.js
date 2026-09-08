import {
    Box,
    Grid,
    Button,
    MenuItem,
    Select,
    Typography,
    FormControl,
    InputLabel,
    Card,
    CardContent,
} from "@mui/material";
import emamiLogo from '../assets/emami-logo.jpg';
import { useState } from "react";

import depots from "../data/depots";
import auditors from "../data/users";
import { generateAuditNumber } from "../utils/auditGenerator";

import { LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { DatePicker } from "@mui/x-date-pickers";
import { Assignment as AssignmentIcon } from "@mui/icons-material";
import {
    useAppContext
} from "../context/AppContext";
import dayjs from "dayjs";
import {
    addNotification,
} from "../utils/notifications";
import {
    notifyAuditTypesSet,
    SAP_FLAG,
} from "../utils/sapNotify";

export default function CreateAudit() {
    const [auditCategory, setAuditCategory] =
        useState("Depot");

    const [auditType, setAuditType] =
        useState("Onsite");

    const [depot, setDepot] =
        useState("");

    const [auditor, setAuditor] =
        useState("");

    const [auditDate, setAuditDate] =
        useState(dayjs());

    const [auditNo, setAuditNo] =
        useState("");

    const [dueDate, setDueDate] =
        useState(dayjs());

    const [errors, setErrors] =
        useState({});

    const { addAudit } = useAppContext();

    // const handleSubmit = () => {
    //     const selectedDepot =
    //         depots.find(
    //             (d) => d.name === depot
    //         );

    //     const generatedNo =
    //         generateAuditNumber(
    //             auditType,
    //             selectedDepot?.code
    //         );

    //     setAuditNo(generatedNo);
    //     const newAudit = {
    //         id: Date.now(),

    //         auditNo: generatedNo,

    //         depot,

    //         auditor,

    //         auditType,

    //         auditDate: auditDate.format("DD-MM-YYYY"),

    //         dueDate: dueDate.format("DD-MM-YYYY"),

    //         createdDate: new Date().toLocaleDateString(),

    //         status: "Open",

    //         compliance: 0,

    //         checklist: [],

    //         capaRecords: [],
    //     };
    //     setAudits([
    //         ...audits,
    //         newAudit,
    //     ]);
    // };

    const handleSubmit = async () => {

        const validationErrors = {};

        if (!auditCategory)
            validationErrors.auditCategory = true;

        if (!auditType)
            validationErrors.auditType = true;

        if (!depot)
            validationErrors.depot = true;

        if (!auditor)
            validationErrors.auditor = true;

        if (!auditDate)
            validationErrors.auditDate = true;

        if (!dueDate)
            validationErrors.dueDate = true;

        setErrors(validationErrors);

        if (
            Object.keys(validationErrors)
                .length > 0
        ) {
            return;
        }

        const selectedDepot =
            depots.find(
                (d) => d.name === depot
            );

        // const generatedNo =
        //     generateAuditNumber(
        //         auditType,
        //         selectedDepot?.code
        //     );

        // setAuditNo(generatedNo);

        const newAudit = {
            // id: Date.now(),
            // auditNo: generatedNo,
            depot,
            auditor,
            auditCategory,
            auditorSignature: "",
            auditorSignatureSubmitted: false,
            auditorSignatureDate: "",
            depotInchargeName: "",

            depotSignature: "",
            depotSignatureSubmitted: false,
            depotSignatureDate: "",
            auditType,
            auditDate:
                auditDate.format(
                    "DD-MM-YYYY"
                ),
            dueDate:
                dueDate.format(
                    "DD-MM-YYYY"
                ),
            createdDate:
                new Date().toLocaleDateString(),
            status: "Open",
            compliance: 0,
            checklist: [],
            capaRecords: [],
        };

        try {
            // await addAudit(newAudit);

            // await addNotification({
            //     role: "Depot",
            //     auditId: newAudit.id,
            //     title:
            //         auditType === "Desktop"
            //             ? "Desktop Audit Assigned"
            //             : "Onsite Audit Scheduled",
            //     message:
            //         auditType === "Desktop"
            //             ? `You have been nominated for self assessment audit for ${depot}`
            //             : `Onsite audit has been scheduled for ${depot}`,
            //     link: `/annexure1/${newAudit.id}`,
            // });

            const createdAudit =
                await addAudit(newAudit);

            await addNotification({
                role: "Depot",
                auditId: createdAudit.id,
                title:
                    auditType === "Desktop"
                        ? "Desktop Audit Assigned"
                        : "Onsite Audit Scheduled",
                message:
                    auditType === "Desktop"
                        ? `You have been nominated for self assessment audit for ${depot}`
                        : `Onsite audit has been scheduled for ${depot}`,
                link: `/annexure1/${createdAudit.id}`,
            });

            // Notify SAP (NGD) so it can trigger the depot email off the Flag.
            notifyAuditTypesSet({
                flag:
                    auditType === "Desktop"
                        ? SAP_FLAG.DESKTOP_AUDIT_ASSIGNED
                        : SAP_FLAG.ONSITE_AUDIT_SCHEDULED,
                depot: selectedDepot?.code || depot,
                dueDate: dueDate.toDate(),
            });

            alert("Audit created successfully.");
        } catch (error) {
            console.error(error);
            alert("Unable to create audit. Please make sure the backend is running.");
        }
    };

    const handleReset = () => {
        setAuditCategory("Depot");
        setAuditType("Onsite");
        setDepot("");
        setAuditor("");
        setAuditDate(dayjs());
        setAuditNo("");
    };

    return (
        <Box
            sx={{
                maxWidth: 1200,
                mx: "auto",
            }}
        >
            {/* Header */}

            <Card
                sx={{
                    mb: 3,
                    // background:
                    //     "linear-gradient(135deg,#2563EB,#60A5FA)",
                    background: "linear-gradient(135deg,#4F46E5,#6366F1)",
                    // background:
                    //     "linear-gradient(135deg, #1565c0, #42a5f5)",
                    color: "white",
                    borderRadius: 1,
                }}
            >
                <CardContent>

                    <Box
                        sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 2,
                        }}
                    >
                        <AssignmentIcon
                            sx={{ fontSize: 40 }}
                        />

                        <Box>
                            <Typography variant="h4">
                                Create Audit
                            </Typography>

                            <Typography>
                                Create and assign audits to business locations
                            </Typography>
                        </Box>
                    </Box>
                </CardContent>
            </Card>

            {/* Form */}

            <Card
                sx={{
                    borderRadius: 3,
                    boxShadow: 2,
                    bgcolor: "#ffffff",
                }}
            >

                <CardContent sx={{ p: 4 }}>

                    <Typography
                        variant="h6"
                        fontWeight={700}
                        sx={{ mb: 3 }}
                    >
                        Audit Assignment Details
                    </Typography>
                    <Grid
                        container
                        spacing={4}
                    >
                        <Grid item xs={12} sm={6} lg={4}>
                            <FormControl fullWidth error={errors.auditCategory} size="medium">
                                <InputLabel>
                                    Audit Category
                                </InputLabel>

                                <Select
                                    value={auditCategory}
                                    sx={{
                                        minWidth: 250,
                                    }}
                                    label="Audit Category"
                                    // onChange={(e) =>
                                    //     setAuditCategory(
                                    //         e.target.value
                                    //     )
                                    // }
                                    onChange={(e) => {
                                        setAuditCategory(e.target.value);

                                        setErrors((prev) => ({
                                            ...prev,
                                            auditCategory: false,
                                        }));
                                    }}
                                >
                                    <MenuItem value="Depot">
                                        Depot
                                    </MenuItem>

                                    <MenuItem value="Unit">
                                        Unit
                                    </MenuItem>

                                    <MenuItem value="Supplier">
                                        Supplier
                                    </MenuItem>
                                </Select>
                            </FormControl>
                        </Grid>

                        <Grid item xs={12} sm={6} lg={4}>
                            <FormControl fullWidth error={errors.auditType} size="medium">
                                <InputLabel>
                                    Audit Type
                                </InputLabel>

                                <Select
                                    value={auditType}
                                    label="Audit Type"
                                    sx={{
                                        minWidth: 250,
                                    }}
                                    // onChange={(e) =>
                                    //     setAuditType(
                                    //         e.target.value
                                    //     )
                                    // }

                                    onChange={(e) => {
                                        setAuditType(e.target.value);

                                        setErrors((prev) => ({
                                            ...prev,
                                            auditType: false,
                                        }));
                                    }}
                                >
                                    <MenuItem value="Onsite">
                                        Onsite
                                    </MenuItem>

                                    <MenuItem value="Desktop">
                                        Desktop
                                    </MenuItem>
                                </Select>
                            </FormControl>
                        </Grid>

                        <Grid item xs={12} sm={6} lg={4}>
                            <FormControl fullWidth error={errors.depot} size="medium">
                                <InputLabel>
                                    Depot
                                </InputLabel>

                                <Select
                                    value={depot}
                                    label="Depot"
                                    sx={{
                                        minWidth: 250,
                                    }}
                                    onChange={(e) => {
                                        setDepot(e.target.value);

                                        setErrors((prev) => ({
                                            ...prev,
                                            depot: false,
                                        }));
                                    }}
                                >
                                    {depots.map((d) => (
                                        <MenuItem
                                            key={d.code}
                                            value={d.name}
                                        >
                                            {d.name}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </Grid>

                        <Grid item xs={12} sm={6} lg={4}>
                            <FormControl fullWidth error={errors.auditor} size="medium">
                                <InputLabel>
                                    Auditor
                                </InputLabel>

                                <Select
                                    value={auditor}
                                    label="Auditor"
                                    sx={{
                                        minWidth: 250,
                                    }}
                                    // onChange={(e) =>
                                    //     setAuditor(
                                    //         e.target.value
                                    //     )
                                    // }
                                    onChange={(e) => {
                                        setAuditor(e.target.value);

                                        setErrors((prev) => ({
                                            ...prev,
                                            auditor: false,
                                        }));
                                    }}
                                >
                                    {auditors.map(
                                        (user) => (
                                            <MenuItem
                                                key={user.id}
                                                value={
                                                    user.name
                                                }
                                            >
                                                {user.name}
                                            </MenuItem>
                                        )
                                    )}
                                </Select>
                            </FormControl>
                        </Grid>

                        <Grid item xs={12} sm={6} lg={4}>
                            <LocalizationProvider
                                dateAdapter={
                                    AdapterDayjs
                                }
                            >
                                <DatePicker
                                    label="Audit Date"
                                    format="DD/MM/YYYY"
                                    value={auditDate}
                                    onChange={(
                                        newValue
                                    ) =>
                                        setAuditDate(
                                            newValue
                                        )
                                    }
                                    slotProps={{
                                        textField: {
                                            fullWidth:
                                                true,
                                            error:
                                                errors.auditDate,
                                            helperText:
                                                errors.auditDate
                                                    ? "Audit Date is required"
                                                    : "",
                                        },
                                    }}
                                />
                            </LocalizationProvider>
                        </Grid>

                        <Grid item xs={12} sm={6} lg={4}>
                            <LocalizationProvider
                                dateAdapter={AdapterDayjs}
                            >
                                <DatePicker
                                    label="Due Date"
                                    format="DD/MM/YYYY"
                                    value={dueDate}
                                    onChange={(newValue) =>
                                        setDueDate(newValue)
                                    }
                                    slotProps={{
                                        textField: {
                                            fullWidth: true,
                                            error:
                                                errors.dueDate,
                                            helperText:
                                                errors.dueDate
                                                    ? "Due Date is required"
                                                    : "",
                                        },
                                    }}
                                />
                            </LocalizationProvider>
                        </Grid>
                    </Grid>

                    {/* Buttons */}

                    <Box
                        sx={{
                            display: "flex",
                            justifyContent: "space-between",
                            mt: 4,
                        }}
                    >
                        <Button
                            variant="outlined"
                            size="large"
                        >
                            Save Draft
                        </Button>

                        <Box>
                            <Button
                                variant="outlined"
                                sx={{ mr: 2 }}
                                onClick={
                                    handleReset
                                }
                            >
                                Reset
                            </Button>

                            <Button
                                variant="contained"
                                size="large"
                                sx={{
                                    px: 4,
                                    borderRadius: 2,
                                }}
                                onClick={handleSubmit}
                            >
                                Assign Audit
                            </Button>
                        </Box>
                    </Box>

                    {/* <Box
                        sx={{
                            display: "flex",
                            justifyContent:
                                "flex-end",
                            gap: 2,
                            mt: 4,
                        }}
                    >
                        <Button
                            variant="outlined"
                            onClick={
                                handleReset
                            }
                        >
                            Reset
                        </Button>

                        <Button
                            variant="contained"
                            onClick={
                                handleSubmit
                            }
                        >
                            Assign Audit
                        </Button>
                    </Box> */}

                    {/* Audit Number */}

                    {auditNo && (
                        <Card
                            sx={{
                                mt: 3,
                                bgcolor: "#f8fafc",
                                border: "1px solid #e2e8f0",
                                borderRadius: 3,
                            }}
                        >
                            <CardContent>
                                <Typography
                                    color="text.secondary"
                                >
                                    Audit Number Preview
                                </Typography>

                                <Typography
                                    variant="h5"
                                    fontWeight="bold"
                                    color="primary"
                                >
                                    {auditNo || "Not Generated"}
                                </Typography>
                            </CardContent>
                        </Card>
                        // <Card
                        //     sx={{
                        //         mt: 3,
                        //         bgcolor:
                        //             "#f5f5f5",
                        //     }}
                        // >
                        //     <CardContent>
                        //         <Typography
                        //             color="text.secondary"
                        //         >
                        //             Generated Audit
                        //             Number
                        //         </Typography>

                        //         <Typography
                        //             variant="h5"
                        //             color="primary"
                        //         >
                        //             {auditNo}
                        //         </Typography>
                        //     </CardContent>
                        // </Card>
                    )}
                </CardContent>
            </Card>
        </Box >
    );
}