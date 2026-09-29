const multer = require("multer");
const path = require("path");
const fs = require("fs");

const uploadDirectory = path.join(
    __dirname,
    "../uploads/capa-evidence"
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

    filename: (req, file, cb) => {

        const extension =
            path.extname(file.originalname);

        const baseName =
            path
                .basename(
                    file.originalname,
                    extension
                )
                .replace(/[^a-zA-Z0-9-_]/g, "_");

        // Random suffix: several files can arrive in the same millisecond now.
        const uniqueName =
            `${Date.now()}-${Math.round(Math.random() * 1e6)}-${baseName}${extension}`;

        cb(null, uniqueName);
    },
});

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
    __dirname,
    "../uploads/checklist-evidence"
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
