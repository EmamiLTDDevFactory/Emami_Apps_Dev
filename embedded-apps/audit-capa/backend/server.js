const express = require("express");
const path = require("path");
const cors = require("cors");
require("dotenv").config();
require("./services/notificationListener");

const auditRoutes = require("./routes/audits");
const capaRoutes = require("./routes/capas");
const notificationRoutes = require("./routes/notifications");
const sapNotifyRoutes = require("./routes/sapNotify");
const authRoutes = require("./routes/auth");
const internalRoutes = require("./routes/internal");
const userRoutes = require("./routes/users");
const requireAuth = require("./middleware/requireAuth");
const { uploadsRoot } = require("./config/uploads");
const pool = require("./postgres");

// Fire-and-forget on module load — idempotent, so a request racing ahead of it is harmless.
pool.runMigrations();

const app = express();

app.disable("x-powered-by");

// Behind nginx every request's socket address is the proxy's, so req.ip (used only by the login
// rate limiter, middleware/rateLimit.js) is the same for everyone. Set TRUST_PROXY to Express's
// "trust proxy" value (e.g. "loopback" or "1") to key on the client's X-Forwarded-For address
// instead — only when nginx really sets that header. Unset keeps Express's default.
if (process.env.TRUST_PROXY) {
  const trustProxy = process.env.TRUST_PROXY.trim();
  app.set("trust proxy", /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy);
}

// Single JSON parser. There used to be a second express.json({ limit: "10mb" }) further down, but
// the default-limit (100kb) one registered first always parsed the body, so the 10mb limit was
// dead. Evidence files go through multer (multipart), not this parser.
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

const allowedOrigins = (process.env.CLIENT_URL || "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        // No CORS headers for an unknown origin (the browser blocks it), but answer normally —
        // passing an Error here turned every such request into a 500.
        callback(null, false);
      }
    },
  })
);

// const path = require("path");

// Stays public (the UI downloads evidence with a plain fetch, see src/utils/storage.js); the
// stored names are random UUIDs (middleware/uploadCAPAEvidence.js). Images and PDFs still open
// inline in the browser; anything else is sent as a download so it can never render as a page.
const INLINE_UPLOAD_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".pdf"];

app.use(
  "/uploads",
  express.static(
    uploadsRoot,
    {
      setHeaders: (res, filePath) => {
        res.setHeader("X-Content-Type-Options", "nosniff");

        if (!INLINE_UPLOAD_EXTENSIONS.includes(path.extname(filePath).toLowerCase())) {
          res.setHeader("Content-Disposition", "attachment");
        }
      }
    }
  )
);

app.get("/", (req, res) => {
  res.json({
    message: "Audit Management API Running",
    database: "temporary-json",
  });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/health/db", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW() AS current_time");

    res.json({
      status: "ok",
      database: "connected",
      serverTime: result.rows[0].current_time
    });
  } catch (error) {
    console.error("Database connection failed:", error);

    res.status(500).json({
      status: "error",
      database: "disconnected",
      message: error.message
    });
  }
});
app.use("/api/auth", authRoutes);
app.use("/api/internal", internalRoutes);

// requireAuth is log-only unless ENFORCE_AUTH=on — see middleware/requireAuth.js.
app.use("/api/audits", requireAuth, auditRoutes);
app.use("/api/capas", requireAuth, capaRoutes);
app.use("/api/notifications", requireAuth, notificationRoutes);
app.use("/api/sap-notify", requireAuth, sapNotifyRoutes);
app.use("/api/users", requireAuth, userRoutes);

// Unknown /api routes get a JSON 404 instead of Express's HTML page. Scoped to /api so it can
// never shadow /uploads or anything else.
app.use("/api", (req, res) => {
  res.status(404).json({ message: "Not found" });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: "Internal server error" });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
