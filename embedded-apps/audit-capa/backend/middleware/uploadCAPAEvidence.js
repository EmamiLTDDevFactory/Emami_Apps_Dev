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

const storage = multer.diskStorage({

    destination: (req, file, cb) => {
        cb(null, uploadDirectory);
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

        const uniqueName =
            `${Date.now()}-${baseName}${extension}`;

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

const uploadCAPAEvidence = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024,
    },
});

module.exports = uploadCAPAEvidence;