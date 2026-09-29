import {
    Box,
    Button,
    Stack,
    Typography,
} from "@mui/material";

import VisibilityIcon from "@mui/icons-material/Visibility";
import DownloadIcon from "@mui/icons-material/Download";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";

import {
    downloadCAPAEvidence,
    getEvidenceUrl,
} from "../../utils/storage";

const formatUploadedAt = (value) =>
    value ? new Date(value).toLocaleString() : "";

const formatSize = (bytes) => {
    if (!bytes) return "";
    return bytes >= 1024 * 1024
        ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
        : `${Math.max(1, Math.round(bytes / 1024))} KB`;
};

// Evidence files with View (new tab — images/PDF open in the browser) and
// Download for everyone, and Remove only where `canRemove(file)` allows it.
// Remove is a soft hide handled by the caller; nothing is deleted.
export default function EvidenceList({
    files = [],
    canRemove = () => false,
    onRemove,
    emptyText = "No evidence uploaded.",
}) {

    if (files.length === 0) {
        return (
            <Typography variant="body2" color="text.secondary">
                {emptyText}
            </Typography>
        );
    }

    const handleDownload = async (file) => {
        try {
            await downloadCAPAEvidence(file.filePath, file.fileName);
        } catch (error) {
            console.error(error);
            alert(error.message || "Unable to download evidence.");
        }
    };

    return (
        <Stack spacing={1}>
            {files.map((file) => (
                <Box
                    key={file.id || file.filePath}
                    sx={{
                        display: "flex",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: 1,
                        p: 1,
                        border: "1px solid #E5E7EB",
                        borderRadius: 2,
                        bgcolor: "#F9FAFB",
                    }}
                >
                    <InsertDriveFileIcon fontSize="small" color="action" />

                    <Box sx={{ flex: 1, minWidth: 160 }}>
                        <Typography
                            variant="body2"
                            fontWeight={600}
                            sx={{ wordBreak: "break-all" }}
                        >
                            {file.fileName}
                        </Typography>

                        <Typography variant="caption" color="text.secondary">
                            {[
                                file.uploadedBy && `By ${file.uploadedBy}`,
                                formatUploadedAt(file.uploadedAt),
                                formatSize(file.size),
                            ]
                                .filter(Boolean)
                                .join(" · ")}
                        </Typography>
                    </Box>

                    <Button
                        size="small"
                        startIcon={<VisibilityIcon />}
                        onClick={() =>
                            window.open(
                                getEvidenceUrl(file.filePath),
                                "_blank",
                                "noopener,noreferrer"
                            )
                        }
                    >
                        View
                    </Button>

                    <Button
                        size="small"
                        startIcon={<DownloadIcon />}
                        onClick={() => handleDownload(file)}
                    >
                        Download
                    </Button>

                    {canRemove(file) && onRemove && (
                        <Button
                            size="small"
                            color="error"
                            startIcon={<DeleteOutlineIcon />}
                            onClick={() => {
                                if (
                                    window.confirm(
                                        `Remove "${file.fileName}" from the evidence list?`
                                    )
                                ) {
                                    onRemove(file);
                                }
                            }}
                        >
                            Remove
                        </Button>
                    )}
                </Box>
            ))}
        </Stack>
    );
}
