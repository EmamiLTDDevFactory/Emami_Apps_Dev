import {
    Box,
    Card,
    CardContent,
    Grid,
    TextField,
    Typography,
} from "@mui/material";
import ChecklistIcon from "@mui/icons-material/Checklist";

import { calculateCategoryCompliance } from "../../utils/complianceUtils";
import { STATUTORY_LICENCE_FIELDS } from "../../utils/generalInfoFields";

const gridColumns = "2fr 0.8fr 0.8fr 0.8fr";

// Read-only copy of the checklist page's header for the CAPA page: Audit No +
// Element Compliance banner, then General Information. Mirrors Annexure1's
// markup (without the "DEPOT AUDIT CHECK LIST" title) so both pages match.
export default function CAPAAuditHeader({ audit }) {

    if (!audit) return null;

    const {
        rows,
        totalMaxPoints,
        totalActualPoints,
        totalCompliance,
    } = calculateCategoryCompliance(audit.checklist || []);

    const info = audit.generalInfo || {};

    const generalFields = [
        { label: "Name of Depot", value: info.depotName || audit.depot },
        { label: "Name & Phone No. of Depot Incharge", value: info.depotIncharge },
        { label: "Go down Address", value: info.godownAddress, multiline: true },
        { label: "Office Address", value: info.officeAddress, multiline: true },
        { label: "Visited / Audited By", value: info.visitedAuditedBy || audit.auditor },
        { label: "Date of Visit / Audit", value: info.dateOfVisitAudit, date: true },
        { label: "Purpose of Visit / Audit", value: info.purposeOfVisitAudit, multiline: true },
        { label: "Lay out display", value: info.layoutDisplay },
        ...STATUTORY_LICENCE_FIELDS.map((field) => ({
            label: field.label,
            value: info[field.key],
            date: field.date,
        })),
        { label: "Other Licences / Remarks", value: info.statutoryLicences },
        { label: "Copy of Insurance Coverage of Building & Goods", value: info.insuranceCoverage },
    ];

    return (
        <>
            <Card
                sx={{
                    mb: 3,
                    background: "linear-gradient(135deg,#3730A3,#7C3AED)",
                    color: "white",
                    boxShadow: "0px 4px 20px rgba(0,0,0,0.08)",
                }}
            >
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
                        <Box
                            sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: 3,
                            }}
                        >
                            <Box
                                sx={{
                                    width: 90,
                                    height: 90,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    background: "#fff",
                                    borderRadius: 2,
                                    p: 1,
                                }}
                            >
                                <ChecklistIcon sx={{ fontSize: 40, color: "#7C3AED" }} />
                            </Box>

                            <Typography variant="h5" fontWeight={700}>
                                Audit No: {audit.auditNo}
                            </Typography>
                        </Box>

                        <Card
                            sx={{
                                minWidth: 320,
                                bgcolor: "rgba(255,255,255,0.15)",
                                color: "#fff",
                                borderRadius: 2,
                            }}
                        >
                            <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
                                <Typography fontWeight={700} sx={{ mb: 1 }}>
                                    Element Compliance
                                </Typography>

                                <Box sx={{ mt: 1 }}>
                                    <Box
                                        sx={{
                                            display: "grid",
                                            gridTemplateColumns: gridColumns,
                                            gap: 1,
                                            borderBottom: "1px solid rgba(255,255,255,0.35)",
                                            pb: 1,
                                            mb: 1,
                                            fontWeight: 700,
                                        }}
                                    >
                                        <Typography variant="caption">Element</Typography>
                                        <Typography variant="caption">Max</Typography>
                                        <Typography variant="caption">Actual</Typography>
                                        <Typography variant="caption">%</Typography>
                                    </Box>

                                    {rows.map((row) => (
                                        <Box
                                            key={row.category}
                                            sx={{
                                                display: "grid",
                                                gridTemplateColumns: gridColumns,
                                                gap: 1,
                                                py: 0.5,
                                            }}
                                        >
                                            <Typography variant="caption">{row.category}</Typography>
                                            <Typography variant="caption">{row.maxPoints}</Typography>
                                            <Typography variant="caption">{row.actualPoints}</Typography>
                                            <Typography variant="caption" fontWeight={700}>
                                                {row.compliance}%
                                            </Typography>
                                        </Box>
                                    ))}

                                    <Box
                                        sx={{
                                            display: "grid",
                                            gridTemplateColumns: gridColumns,
                                            gap: 1,
                                            mt: 1,
                                            pt: 1,
                                            borderTop: "1px solid rgba(255,255,255,0.35)",
                                        }}
                                    >
                                        <Typography variant="body2" fontWeight={700}>Total</Typography>
                                        <Typography variant="body2" fontWeight={700}>{totalMaxPoints}</Typography>
                                        <Typography variant="body2" fontWeight={700}>{totalActualPoints}</Typography>
                                        <Typography variant="body2" fontWeight={700}>{totalCompliance}%</Typography>
                                    </Box>
                                </Box>
                            </CardContent>
                        </Card>
                    </Box>
                </CardContent>
            </Card>

            <Card
                sx={{
                    mb: 3,
                    borderRadius: 3,
                    border: "1px solid #D1D5DB",
                    borderLeft: "6px solid #2563EB",
                    boxShadow: "0px 4px 14px rgba(0,0,0,0.06)",
                    overflow: "hidden",
                }}
            >
                <CardContent sx={{ p: 3 }}>
                    <Typography
                        variant="h5"
                        fontWeight={700}
                        sx={{ mb: 3, color: "#1E293B" }}
                    >
                        General Information
                    </Typography>

                    <Grid container spacing={2.5}>
                        {generalFields.map((field) => (
                            <Grid item xs={12} md={4} key={field.label}>
                                <TextField
                                    fullWidth
                                    label={field.label}
                                    value={field.value || ""}
                                    type={field.date ? "date" : "text"}
                                    multiline={field.multiline}
                                    rows={field.multiline ? 2 : undefined}
                                    disabled
                                    slotProps={{
                                        inputLabel: { shrink: true },
                                    }}
                                />
                            </Grid>
                        ))}
                    </Grid>
                </CardContent>
            </Card>
        </>
    );
}
