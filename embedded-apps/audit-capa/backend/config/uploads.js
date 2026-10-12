const path = require("path");

// Root folder served at /uploads (server.js) and written to by multer
// (middleware/uploadCAPAEvidence.js). Defaults to backend/uploads exactly as before; UPLOADS_DIR
// only exists so it can be pointed somewhere else (e.g. a temp folder when testing locally).
const uploadsRoot = process.env.UPLOADS_DIR
    ? path.resolve(process.env.UPLOADS_DIR)
    : path.join(__dirname, "..", "uploads");

module.exports = {
    uploadsRoot
};
