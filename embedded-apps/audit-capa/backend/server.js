const express = require("express");
const path = require("path");
const cors = require("cors");
require("dotenv").config();
require("./services/notificationListener");

const auditRoutes = require("./routes/audits");
const capaRoutes = require("./routes/capas");
const notificationRoutes = require("./routes/notifications");
const authRoutes = require("./routes/auth");
const pool = require("./postgres");

const app = express();

app.use(express.json());
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
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      }
    },
  })
);
app.use(express.json({ limit: "10mb" }));

// const path = require("path");

app.use(
  "/uploads",
  express.static(
    path.join(__dirname, "uploads")
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

app.use("/api/audits", auditRoutes);
app.use("/api/capas", capaRoutes);
app.use("/api/notifications", notificationRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: "Internal server error" });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
