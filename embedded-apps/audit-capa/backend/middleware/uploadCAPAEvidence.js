const crypto = require("crypto");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { uploadsRoot } = require("../config/uploads");

const uploadDirectory = path.join(
    uploadsRoot,
    "capa-evidence"
);

console.log("UPLOAD __dirname:", __dirname);
console.log("UPLOAD DIRECTORY:", uploadDirectory);
console.log(
    "UPLOAD DIRECTORY EXISTS:",
    fs.existsSync(uploadDirectory)
);

if (!fs.existsSync(uploadDirectory)) {
    fs.mkdirSync(uploadDirectory, {
        recursive: true,
    });
}

try {
    const testFile = path.join(
        uploadDirectory,
        "test-upload.txt"
    );

    fs.writeFileSync(
        testFile,
        "upload directory test"
    );

    console.log(
        "UPLOAD DIRECTORY WRITE TEST: SUCCESS"
    );

    fs.unlinkSync(testFile);
} catch (error) {
    console.error(
        "UPLOAD DIRECTORY WRITE TEST FAILED:",
        error
    );
}

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_FILES_PER_UPLOAD = 10;

const makeStorage = (directory) => multer.diskStorage({

    destination: (req, file, cb) => {
        cb(null, directory);
    },

    // Stored name is random so a file's /uploads URL can't be guessed (it used to be
    // `${Date.now()}-${originalname}`). The original name is still saved and returned as
    // evidenceFileName (controllers/capaController.js), which is what the UI shows and downloads
    // as. Files already on disk keep their old names.
    filename: (req, file, cb) => {

        const extension =
            path.extname(file.originalname).toLowerCase();

        const safeExtension =
            /^\.[a-z0-9]{1,8}$/.test(extension)
                ? extension
                : "";

        // A random UUID per file also keeps names unique when several files
        // arrive in the same request.
        cb(null, `${crypto.randomUUID()}${safeExtension}`);
    },
});

// Checked on top of the extension list below, LOG-ONLY unless ENFORCE_AUTH=on (same convention
// as middleware/requireAuth.js). Covers everything the evidence picker's `accept` allows
// (src/pages/CAPAManagement.js: pdf, jpg/jpeg, png, doc/docx, xls/xlsx) plus txt/csv/zip.
const allowedMimeTypes = [
    "application/pdf",
    "application/msword",
    "application/vnd.ms-excel",
    "application/vnd.ms-powerpoint",
    "text/plain",
    "text/csv",
    "application/zip",
    "application/x-zip-compressed"
];

const isAllowedMimeType = (mimeType) => {

    const type =
        String(mimeType || "").toLowerCase();

    // Browsers send this (or nothing) when the OS has no type registered for the extension, e.g.
    // .xlsx on a machine without Office — the extension check below is what decides then.
    if (!type || type === "application/octet-stream") {
        return true;
    }

    return (
        type.startsWith("image/") ||
        type.startsWith("application/vnd.openxmlformats-officedocument.") ||
        allowedMimeTypes.includes(type)
    );
};

const fileFilter = (req, file, cb) => {

    const allowedTypes = [
        ".pdf",
        ".jpg",
        ".jpeg",
        ".png",
        ".doc",
        ".docx",
        ".xls",
        ".xlsx"
    ];

    const extension =
        path.extname(
            file.originalname
        ).toLowerCase();

    if (!isAllowedMimeType(file.mimetype)) {

        console.warn(
            `[auth-would-reject] upload-mime ${req.method} ${req.originalUrl.split("?")[0]} mimetype=${file.mimetype} ext=${extension}`
        );

        if (String(process.env.ENFORCE_AUTH || "").trim().toLowerCase() === "on") {
            return cb(
                new Error(
                    "Unsupported evidence file type."
                ),
                false
            );
        }
    }

    if (allowedTypes.includes(extension)) {
        cb(null, true);
    } else {
        cb(
            new Error(
                "Unsupported evidence file type."
            ),
            false
        );
    }
};

const makeUploader = (directory) => multer({
    storage: makeStorage(directory),
    fileFilter,
    limits: {
        fileSize: MAX_FILE_SIZE_BYTES,
        files: MAX_FILES_PER_UPLOAD,
    },
});

const uploadCAPAEvidence = makeUploader(uploadDirectory);

const checklistUploadDirectory = path.join(
    uploadsRoot,
    "checklist-evidence"
);

if (!fs.existsSync(checklistUploadDirectory)) {
    fs.mkdirSync(checklistUploadDirectory, {
        recursive: true,
    });
}

const uploadChecklistEvidence = makeUploader(checklistUploadDirectory);

// Runs multer's .array("evidence") and turns its errors (size, count, type)
// into a JSON 400 the frontend can show, instead of Express's HTML 500 page.
const evidenceArray = (uploader) => (req, res, next) =>
    uploader.array("evidence", MAX_FILES_PER_UPLOAD)(req, res, (err) => {
        if (!err) return next();

        const message =
            err.code === "LIMIT_FILE_SIZE"
                ? "Each evidence file must be 10 MB or smaller."
                : err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE"
                    ? `You can upload up to ${MAX_FILES_PER_UPLOAD} files at a time.`
                    : err.message || "Unable to upload evidence.";

        return res.status(400).json({ message });
    });

module.exports = uploadCAPAEvidence;
module.exports.MAX_EVIDENCE_FILES = MAX_FILES_PER_UPLOAD;
module.exports.capaEvidenceArray = evidenceArray(uploadCAPAEvidence);
module.exports.checklistEvidenceArray = evidenceArray(uploadChecklistEvidence);
