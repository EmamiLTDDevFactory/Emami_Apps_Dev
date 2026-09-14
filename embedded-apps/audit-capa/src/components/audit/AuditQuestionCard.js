import {
    Card,
    Grid,
    Typography,
    Select,
    MenuItem,
    TextField,
    Chip,
    Box,
    Button,
} from "@mui/material";
import Tooltip from "@mui/material/Tooltip";
import IconButton from "@mui/material/IconButton";
import DeleteIcon from "@mui/icons-material/Delete";
import useMediaQuery from "@mui/material/useMediaQuery";

export default function AuditQuestionCard({
    item,
    auditType,
    canEditAnnexure,
    handleStatusChange,
    handleObservationChange,
    handleActionPlanChange,
    handleResponsibilityChange,
    handleTargetDateChange,
    handleQuestionChange,
    handleDeleteQuestion,
    handleEvidenceUpload,
}) {

    const currentUser = JSON.parse(
        localStorage.getItem(
            "currentUser"
        )
    );

    const isTablet =
        useMediaQuery(
            "(min-width:768px) and (max-width:1200px)"
        );

    const isDepot =
        currentUser?.role ===
        "Depot";

    const isDesktopAudit =
        auditType === "Desktop";

    const isDepotSelfAssessment =
        isDesktopAudit && isDepot;

    const isAuditorTablet =
        !isDepot && isTablet;

    const isNA =
        item.status === "NA";

    // const isNA = item.status === "NA";

    const isCompliance =
        item.actualScore !== null &&
        item.actualScore >= 2;

    const disableFollowupField =
        isNA || isCompliance;

    // const getCardStyle = () => {

    //     if (item.status === "Compliance") {
    //         return {
    //             borderLeft:
    //                 "6px solid #22C55E",
    //             backgroundColor:
    //                 "#F0FDF4",
    //         };
    //     }

    //     // if (
    //     //     item.status ===
    //     //     "Non Compliance"
    //     // ) 
    //     if (
    //         item.actualScore !== null &&
    //         item.actualScore < 2
    //     ) {
    //         return {
    //             borderLeft:
    //                 "6px solid #EF4444",
    //             backgroundColor:
    //                 "#FEF2F2",
    //         };
    //     }

    //     if (item.status === "NA") {
    //         return {
    //             borderLeft:
    //                 "6px solid #94A3B8",
    //             backgroundColor:
    //                 "#F8FAFC",
    //             opacity: 0.75,
    //         };
    //     }

    //     return {
    //         borderLeft:
    //             "6px solid #CBD5E1",
    //         backgroundColor: "#FFF",
    //     };
    // };

    // const getChipColor = () => {

    //     if (
    //         item.status ===
    //         "Compliance"
    //     ) {
    //         return "success";
    //     }

    //     if (
    //         item.status ===
    //         "Non Compliance"
    //     ) {
    //         return "error";
    //     }

    //     if (item.status === "NA") {
    //         return "default";
    //     }

    //     return "warning";
    // };

    const getCardStyle = () => {

        if (item.status === "NA") {
            return {
                borderLeft: "6px solid #9CA3AF",
                backgroundColor: "#F3F4F6",
                opacity: 0.75,
            };
        }

        if (item.actualScore === 3 || item.actualScore === 2) {
            return {
                borderLeft: "6px solid #22C55E",
                backgroundColor: "#F0FDF4",
            };
        }

        if (
            item.actualScore !== null &&
            item.actualScore < 2
        ) {
            return {
                borderLeft: "6px solid #EF4444",
                backgroundColor: "#FEF2F2",
            };
        }

        return {
            borderLeft: "6px solid #CBD5E1",
            backgroundColor: "#FFF",
        };
    };

    // const getChipColor = () => {

    //     if (item.status === "NA") {
    //         return "default";
    //     }

    //     if (item.actualScore < 2) {
    //         return "error";
    //     }

    //     if (item.actualScore === 3) {
    //         return "success";
    //     }

    //     return "warning";
    // };

    const getChipColor = () => {

        if (!item.status) {
            return "warning";
        }

        if (item.status === "NA") {
            return "default";
        }

        if (item.actualScore < 2) {
            return "error";
        }

        return "success";
    };

    const disableFollowupFields =
        item.actualScore >= 2 &&
        item.actionPlan?.trim().toLowerCase() ===
        "not applicable";

    const isNonCompliance =
        item.actualScore !== null &&
        item.status !== "NA" &&
        item.actualScore < 2;

    return (
        <Card
            id={`question-${item.id}`}
            sx={{
                mb: 3,
                borderRadius: 4,
                // minHeight: isTablet ? 220 : "auto",
                // minHeight:
                //     isAuditorTablet
                //         ? 220
                //         : "auto",
                minHeight: "auto",

                boxShadow:
                    "0px 4px 15px rgba(0,0,0,0.06)",
                transition:
                    "all 0.3s ease",
                ...getCardStyle(),
            }}
        >
            {/* <Box
                sx={{
                    display: "flex",
                    justifyContent:
                        "space-between",
                    alignItems: "flex-start",
                    p: 2,
                    pb: 0,
                }}
            > */}
            <Box
                sx={{
                    display: "flex",
                    flexDirection:
                        isAuditorTablet
                            ? "column"
                            : "row",

                    gap: 2,

                    justifyContent:
                        "space-between",

                    alignItems:
                        isTablet
                            ? "stretch"
                            : "flex-start",

                    p: 2,
                    pb: 0,
                }}
            >
                {/* <Typography
                    variant="subtitle1"
                    fontWeight={600}
                    sx={{
                        maxWidth: "80%",
                    }}
                >
                    {item.parameter}
                </Typography> */}

                {item.isCustom ? (
                    // <TextField
                    <TextField
                        autoFocus={
                            item.isCustom &&
                            !item.parameter
                        }
                        fullWidth
                        size="small"
                        // disabled={isDepot || isNA}
                        disabled={!canEditAnnexure || isNA}
                        sx={{
                            width: "65%",
                        }}
                        label="Custom Question"
                        placeholder="Enter audit observation..."
                        value={item.parameter}
                        onChange={(e) =>
                            handleQuestionChange(
                                item.id,
                                e.target.value
                            )
                        }
                    />
                ) : (
                    <Typography
                        // variant={
                        //     isAuditorTablet
                        //         ? "h6"
                        //         : "subtitle1"
                        // }

                        fontWeight={600}
                        sx={{
                            flex: 1,
                            maxWidth: "100%",
                            wordBreak: "break-word",
                            fontSize:
                                isAuditorTablet
                                    ? "1.2rem"
                                    : "1rem",

                            // lineHeight: 1.7,

                            // maxWidth:
                            //     isAuditorTablet
                            //         ? "100%"
                            //         : "60%",

                        }}


                    // fontWeight={600}
                    // sx={{
                    //     fontSize: isAuditorTablet ? 20 : 18,
                    //     maxWidth: "60%",
                    // }}
                    >
                        {item.parameter}
                    </Typography>
                )}

                {/* <Chip
                    size="small"
                    label={
                        item.status ||
                        "Pending"
                    }
                    color={getChipColor()}
                /> */}

                {/* <Box
                    sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                    }}
                > */}

                <Box
                    sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                        flexShrink: 0,
                    }}
                >

                    {/* <Chip
                        size={
                            isAuditorTablet
                                ? "medium"
                                : "small"
                        }
                        label={
                            item.status ||
                            "Pending"
                        }
                        color={getChipColor()}
                    /> */}

                    <Chip
                        size={
                            isAuditorTablet
                                ? "medium"
                                : "small"
                        }
                        label={
                            item.status === ""
                                ? "Pending"
                                : item.status === "NA"
                                    ? "NA"
                                    : item.actualScore < 2
                                        ? "Non-Compliance"
                                        : "Compliance"
                        }
                        color={getChipColor()}
                    />

                    {/* {item.isCustom && ( */}
                    {/* {item.isCustom && canEditAnnexure && ( */}
                    {/* {item.isCustom && !isDepot && ( */}

                    {item.isCustom &&
                        !isDepot &&
                        auditType === "Onsite" && (

                            <Tooltip title="Delete Question">
                                <IconButton
                                    size="small"
                                    color="error"
                                    onClick={() =>
                                        handleDeleteQuestion(
                                            item.id
                                        )
                                    }
                                >
                                    <DeleteIcon />
                                </IconButton>
                            </Tooltip>
                        )}
                </Box>
            </Box>

            <Grid
                container
                spacing={2}
                sx={{ p: 2 }}
            >
                <Grid item xs={12} sm={6} md={2}>
                    {/* <Grid
                    item
                    xs={12}
                    lg={3}
                > */}



                    <Select
                        fullWidth

                        size={
                            isAuditorTablet
                                ? "medium"
                                : "small"
                        }
                        sx={{
                            fontSize:
                                isAuditorTablet
                                    ? "1rem"
                                    : "0.875rem",

                            minHeight:
                                isAuditorTablet
                                    ? 56
                                    : 40,
                        }}


                        // disabled={isDepot}
                        disabled={!canEditAnnexure}
                        value={item.status ?? ""}
                        onChange={(e) =>
                            handleStatusChange(
                                item.id,
                                e.target.value
                            )
                        }
                    >
                        {/* <MenuItem value="Compliance">
                            Compliance
                        </MenuItem>

                        <MenuItem value="Non Compliance">
                            Non Compliance
                        </MenuItem>

                        <MenuItem value="NA">
                            Not Applicable
                        </MenuItem> */}
                        <MenuItem value="NA">
                            NA - Not Applicable
                        </MenuItem>

                        <MenuItem value={0}>
                            0 - System Non-Existent
                        </MenuItem>

                        <MenuItem value={1}>
                            1 - System Improvement Needed
                        </MenuItem>

                        <MenuItem value={2}>
                            2 - System Acceptable
                        </MenuItem>

                        <MenuItem value={3}>
                            3 - System Outstanding
                        </MenuItem>

                    </Select>
                </Grid>

                {/* <Grid item xs={12} sm={6} md={5}> */}
                <Grid item xs={12} md={isAuditorTablet ? 12 : 5}>
                    {/* <Grid
                    item
                    xs={12}
                    lg={5}
                > */}
                    <TextField
                        label="Observation"
                        multiline
                        rows={
                            isAuditorTablet
                                ? 3
                                : 1
                        }
                        InputProps={{
                            sx: {
                                fontSize:
                                    isAuditorTablet
                                        ? "1rem"
                                        : "0.875rem",
                            },
                        }}
                        fullWidth
                        size="small"
                        required={isNonCompliance}
                        error={
                            isNonCompliance &&
                            !item.observation?.trim()
                        }
                        // disabled={isDepot || isNA}
                        disabled={!canEditAnnexure || isNA}
                        value={
                            item.observation
                        }
                        onChange={(e) =>
                            handleObservationChange(
                                item.id,
                                e.target.value
                            )
                        }
                    // disabled={
                    //     item.status ===
                    //     "NA"
                    // }
                    />
                </Grid>


                {/* <Grid item xs={12}> */}
                {/* <Grid item xs={12} md={4}> */}
                {!isDepotSelfAssessment && (
                    <>
                        <Grid
                            item
                            xs={12}
                            md={isAuditorTablet ? 6 : 12}
                        >
                            <TextField
                                fullWidth
                                // label={
                                //     isNonCompliance
                                //         ? "Action Plan"
                                //         : "Action Plan"
                                // }
                                // label="Action Plan"
                                // required={isNonCompliance}

                                label="Action Plan"
                                required={isNonCompliance}
                                // helperText={
                                //     isNonCompliance &&
                                //         !item.actionPlan?.trim()
                                //         ? "Action Plan is mandatory for Non-Compliance findings"
                                //         : ""
                                // }
                                error={
                                    isNonCompliance &&
                                    !item.actionPlan?.trim()
                                }
                                // helperText={
                                //     isNonCompliance &&
                                //         !item.actionPlan?.trim()
                                //         ? "Action Plan is mandatory for Non-Compliance findings"
                                //         : ""
                                // }


                                value={item.actionPlan || ""}
                                // disabled={
                                //     isDepot || disableFollowupField
                                //     // item.status === "NA" ||
                                //     // disableFollowupFields
                                // }
                                disabled={
                                    !canEditAnnexure ||
                                    disableFollowupField
                                }

                                // sx={{
                                //     backgroundColor:
                                //         disableFollowupFields
                                //             ? "#E5E7EB"
                                //             : "inherit",
                                // }}
                                onChange={(e) =>
                                    handleActionPlanChange(
                                        item.id,
                                        e.target.value
                                    )
                                }
                            />
                        </Grid>

                        {/* <Grid item xs={12}> */}
                        {/* <Grid item xs={12} md={4}> */}
                        <Grid
                            item
                            xs={12}
                            md={isAuditorTablet ? 3 : 12}
                        >
                            <TextField
                                fullWidth
                                label="Responsibility"
                                value={
                                    item.responsibility || ""
                                }
                                // disabled={
                                //     isDepot || disableFollowupField
                                //     // item.status === "NA" ||
                                //     // disableFollowupFields
                                // }
                                disabled={
                                    !canEditAnnexure ||
                                    disableFollowupField
                                }
                                sx={{
                                    "& .MuiInputBase-root": {
                                        backgroundColor:
                                            disableFollowupFields
                                                ? "#E5E7EB"
                                                // : "#FFFFFF",
                                                : "inherit",
                                    }
                                }}
                                onChange={(e) =>
                                    handleResponsibilityChange(
                                        item.id,
                                        e.target.value
                                    )
                                }
                            />
                        </Grid>

                        {/* <Grid item xs={12}> */}
                        {/* <Grid item xs={12} sm={6} md={2}> */}
                        {/* <Grid
                            item
                            xs={12}
                            md={isAuditorTablet ? 3 : 12}
                        > */}
                        <Grid
                            item
                            xs={12}
                            sm={6}
                            md={3}
                            lg={2}
                        >
                            {/* <TextField
                                fullWidth
                                type="date"
                                label="Target Date"
                                value={
                                    item.targetDate || ""
                                }
                                // disabled={
                                //     isDepot || disableFollowupField
                                //     // item.status === "NA" ||
                                //     // disableFollowupFields

                                // }

                                disabled={
                                    !canEditAnnexure ||
                                    disableFollowupField
                                }
                                // sx={{
                                //     backgroundColor:
                                //         disableFollowupFields
                                //             ? "#E5E7EB"
                                //             : "inherit",
                                // }}
                                onChange={(e) =>
                                    handleTargetDateChange(
                                        item.id,
                                        e.target.value
                                    )
                                }
                                // slotProps={{
                                //     inputLabel: {
                                //         shrink: true,
                                //     },
                                // }}
                                InputLabelProps={{
                                    shrink: true,
                                }}
                                sx={{
                                    minWidth: isAuditorTablet ? 180 : "auto",
                                    // 180,
                                    // "& .MuiInputBase-root": {
                                    //     minHeight: 56,
                                    // },
                                    backgroundColor:
                                        disableFollowupFields
                                            ? "#E5E7EB"
                                            : "inherit",
                                }}

                            /> */}
                            <TextField
                                fullWidth
                                type="date"
                                label="Target Date"
                                value={
                                    item.targetDate
                                        ? item.targetDate.substring(0, 10)
                                        : ""
                                }
                                disabled={
                                    !canEditAnnexure ||
                                    disableFollowupField
                                }
                                onChange={(e) =>
                                    handleTargetDateChange(
                                        item.id,
                                        e.target.value
                                    )
                                }
                                slotProps={{
                                    inputLabel: {
                                        shrink: true,
                                    },
                                }}
                                sx={{
                                    minWidth: 180,

                                    "& .MuiInputBase-root": {
                                        height: isAuditorTablet ? 56 : 40,
                                    },

                                    "& input": {
                                        fontSize: isAuditorTablet
                                            ? "1rem"
                                            : "0.875rem",
                                    },
                                }}
                            />
                        </Grid>
                    </>
                )}

                {/* <Grid item xs={12}>
    {!isDepot && (
        <Button
            component="label"
            variant="outlined"
            size="small"
        >
            Capture Evidence

            <input
                hidden
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) =>
                    handleEvidenceUpload(
                        item.id,
                        e.target.files?.[0]
                    )
                }
            />
        </Button>
    )}

    {item.evidence && (
        <Typography
            variant="body2"
            sx={{
                mt: 1,
                color: "success.main",
                fontWeight: 600,
            }}
        >
            📷 {item.evidence}
        </Typography>
    )}
</Grid> */}

                {/* <Grid item xs={12}> */}
                <Grid item xs={12} sm={6} md={2}>
                    {/* {!isDepot && ( */}
                    {canEditAnnexure && (
                        <Button
                            component="label"
                            variant="outlined"
                            fullWidth={isAuditorTablet}
                            sx={{
                                minWidth: isAuditorTablet ? 56 : "auto",
                            }}
                            disabled={disableFollowupField}
                        >
                            Capture Evidence

                            <input
                                hidden
                                type="file"
                                accept="image/*"
                                capture="environment"
                                // disabled={isDepot || disableFollowupField}
                                disabled={!canEditAnnexure || disableFollowupField}
                                onChange={(e) =>
                                    handleEvidenceUpload(
                                        item.id,
                                        e.target.files?.[0]
                                    )
                                }
                            />
                        </Button>
                    )}

                    {/* {item.evidence && (
                        <Box sx={{ mt: 2 }}> */}

                    {item.evidence && (
                        <Box
                            sx={{
                                mt: 2,
                                p: 2,
                                border: "1px solid #E5E7EB",
                                borderRadius: 2,
                                backgroundColor: "#F8FAFC",
                            }}
                        >
                            <Typography
                                variant="subtitle2"
                                fontWeight={700}
                                sx={{ mb: 1 }}
                            >
                                Evidence Details
                            </Typography>

                            {/* <Typography
                                variant="body2"
                                color="success.main"
                                fontWeight={600}
                            >
                                📷 {item.evidence.name}
                            </Typography> */}

                            <Typography variant="body2">
                                File: {item.evidence.fileName}
                            </Typography>

                            <Typography variant="body2">
                                Uploaded By: {item.evidence.uploadedBy}
                            </Typography>

                            <Typography variant="body2">
                                Uploaded On:
                                {" "}
                                {new Date(
                                    item.evidence.uploadedAt
                                ).toLocaleString()}
                            </Typography>

                            <Box
                                component="img"
                                src={item.evidence.preview}
                                alt="Evidence"
                                sx={{
                                    mt: 1,
                                    width: 200,
                                    maxWidth: "100%",
                                    height: "auto",
                                    borderRadius: 2,
                                    border: "1px solid #e0e0e0",
                                    boxShadow:
                                        "0px 2px 8px rgba(0,0,0,0.1)",
                                }}
                            />

                            {item.evidence.filePath && (
                                <Button
                                    size="small"
                                    variant="outlined"
                                    sx={{ mt: 1 }}
                                    onClick={() =>
                                        window.open(
                                            item.evidence.filePath,
                                            "_blank"
                                        )
                                    }
                                >
                                    View Evidence
                                </Button>
                            )}

                        </Box>
                    )}
                </Grid>



                {/* <Grid item xs={6} md={2}>
             */}
                <Grid
                    item
                    xs={6}
                    lg={2}
                >
                    <TextField
                        label="Max Score"
                        disabled={isNA}
                        InputProps={{
                            readOnly: true,
                            sx: {
                                fontSize:
                                    isAuditorTablet
                                        ? "1rem"
                                        : "0.875rem",
                            },
                        }}
                        // fullWidth
                        size="small"
                        value={
                            item.maxScore
                        }
                        sx={{
                            width:
                                isAuditorTablet
                                    ? 180
                                    : "100%",
                        }}
                    // InputProps={{
                    //     readOnly: true,
                    // }}
                    />
                </Grid>

                {/* <Grid item xs={6} md={2}>
             */}
                <Grid
                    item
                    xs={6}
                    lg={2}
                >
                    <TextField
                        label="Actual Score"
                        // fullWidth
                        size="small"
                        disabled={isNA}
                        // value={
                        //     item.actualScore
                        // }
                        value={item.actualScore ?? ""}
                        // InputProps={{
                        //     readOnly: true,
                        // }}
                        slotProps={{
                            inputLabel: {
                                shrink: true,
                            },
                        }}

                        InputProps={{
                            readOnly: true,
                            sx: {
                                fontSize:
                                    isAuditorTablet
                                        ? "1rem"
                                        : "0.875rem",
                            },
                        }}
                        sx={{
                            width:
                                isAuditorTablet
                                    ? 180
                                    : "100%",
                        }}
                    />
                </Grid>
            </Grid>
        </Card >
    );
}