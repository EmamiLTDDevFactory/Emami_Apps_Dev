import { showMessage } from "../../context/MessageContext";
import { useEffect, useState } from "react";
import {
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    Grid,
    MenuItem,
    TextField,
} from "@mui/material";
import dayjs from "dayjs";

import { getAuditors, getDepots } from "../../api/userApi";

const toInputDate = (value) =>
    value && dayjs(value).isValid() ? dayjs(value).format("YYYY-MM-DD") : "";

// Same options as Create Audit; the audit's current value is kept selectable
// even if it's no longer in the list.
const withCurrent = (options, current) =>
    current && !options.includes(current) ? [current, ...options] : options;

// Edit an audit's details (CQA, only before CAPA is generated).
export function EditAuditDialog({ audit, onClose, onSave }) {

    const [form, setForm] = useState(null);
    const [saving, setSaving] = useState(false);
    const [auditors, setAuditors] = useState([]);
    const [depots, setDepots] = useState([]);

    useEffect(() => {
        if (!audit) return;

        getAuditors()
            .then(setAuditors)
            .catch((error) => console.error("Unable to load auditors:", error));

        getDepots()
            .then(setDepots)
            .catch((error) => console.error("Unable to load depots:", error));
    }, [audit]);

    useEffect(() => {
        if (!audit) return;

        setForm({
            auditCategory: audit.auditCategory || "Depot",
            auditType: audit.auditType || "Onsite",
            depot: audit.depot || "",
            auditor: audit.auditor || "",
            auditDate: toInputDate(audit.auditDate),
            dueDate: toInputDate(audit.dueDate),
        });
    }, [audit]);

    if (!audit || !form) return null;

    const set = (field) => (e) =>
        setForm((previous) => ({ ...previous, [field]: e.target.value }));

    const handleSave = async () => {
        const missing = Object.entries(form).find(([, value]) => !value);

        if (missing) {
            showMessage("All fields are mandatory.", "warning");
            return;
        }

        if (form.dueDate < form.auditDate) {
            showMessage("Due Date cannot be before the Audit Date.", "warning");
            return;
        }

        try {
            setSaving(true);
            await onSave(form);
        } finally {
            setSaving(false);
        }
    };

    const depotNames = withCurrent(depots.map((d) => d.name), audit.depot);
    const auditorNames = withCurrent(auditors.map((u) => u.name), audit.auditor);

    return (
        <Dialog open onClose={() => !saving && onClose()} fullWidth maxWidth="sm">
            <DialogTitle>Edit Audit - {audit.auditNo}</DialogTitle>

            <DialogContent>
                <DialogContentText sx={{ mb: 2 }}>
                    Editable until CAPA is generated. The Audit No. stays the same.
                </DialogContentText>

                <Grid container spacing={2} sx={{ mt: 0.5 }}>
                    <Grid item xs={12} sm={6}>
                        <TextField select fullWidth required label="Audit Category"
                            value={form.auditCategory} onChange={set("auditCategory")}>
                            {["Depot", "Unit", "Supplier"].map((option) => (
                                <MenuItem key={option} value={option}>{option}</MenuItem>
                            ))}
                        </TextField>
                    </Grid>

                    <Grid item xs={12} sm={6}>
                        <TextField select fullWidth required label="Audit Type"
                            value={form.auditType} onChange={set("auditType")}>
                            {["Onsite", "Desktop"].map((option) => (
                                <MenuItem key={option} value={option}>{option}</MenuItem>
                            ))}
                        </TextField>
                    </Grid>

                    <Grid item xs={12} sm={6}>
                        <TextField select fullWidth required label="Depot"
                            value={form.depot} onChange={set("depot")}>
                            {depotNames.map((name) => (
                                <MenuItem key={name} value={name}>{name}</MenuItem>
                            ))}
                        </TextField>
                    </Grid>

                    <Grid item xs={12} sm={6}>
                        <TextField select fullWidth required label="Auditor"
                            value={form.auditor} onChange={set("auditor")}>
                            {auditorNames.map((name) => (
                                <MenuItem key={name} value={name}>{name}</MenuItem>
                            ))}
                        </TextField>
                    </Grid>

                    <Grid item xs={12} sm={6}>
                        <TextField type="date" fullWidth required label="Audit Date"
                            value={form.auditDate} onChange={set("auditDate")}
                            slotProps={{ inputLabel: { shrink: true } }} />
                    </Grid>

                    <Grid item xs={12} sm={6}>
                        <TextField type="date" fullWidth required label="Due Date"
                            value={form.dueDate} onChange={set("dueDate")}
                            slotProps={{ inputLabel: { shrink: true } }} />
                    </Grid>
                </Grid>
            </DialogContent>

            <DialogActions>
                <Button onClick={onClose} disabled={saving}>Cancel</Button>
                <Button variant="contained" onClick={handleSave} disabled={saving}>
                    {saving ? "Saving..." : "Save Changes"}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

// Deactivate an audit (CQA). Reason is mandatory; nothing is deleted.
export function DeactivateAuditDialog({ audit, onClose, onConfirm }) {

    const [reason, setReason] = useState("");
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setReason("");
    }, [audit]);

    if (!audit) return null;

    const handleConfirm = async () => {
        if (!reason.trim()) {
            showMessage("Reason for deactivation is mandatory.", "warning");
            return;
        }

        try {
            setSaving(true);
            await onConfirm(reason.trim());
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open onClose={() => !saving && onClose()} fullWidth maxWidth="sm">
            <DialogTitle>Deactivate Audit - {audit.auditNo}</DialogTitle>

            <DialogContent>
                <DialogContentText sx={{ mb: 2 }}>
                    The audit will be greyed out and read-only for everyone, and left
                    out of dashboard and report counts. Nothing is deleted - it can be
                    activated again at any time.
                </DialogContentText>

                <TextField
                    label="Reason for deactivation"
                    required
                    fullWidth
                    multiline
                    rows={3}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                />
            </DialogContent>

            <DialogActions>
                <Button onClick={onClose} disabled={saving}>Cancel</Button>
                <Button variant="contained" color="error" onClick={handleConfirm} disabled={saving}>
                    {saving ? "Deactivating..." : "Deactivate"}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
