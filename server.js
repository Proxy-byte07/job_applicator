const path = require("path");
const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const morgan = require("morgan");

const connectDB = require("./src/config/db");
const authMiddleware = require("./src/middlewares/authMiddleware");
const errorHandler = require("./src/middlewares/errorHandler");
const applicationRoutes = require("./src/routes/applicationRoutes");

// Load environment variables
dotenv.config();

// Connect to MongoDB
connectDB();

const app = express();

// ─── Global Middleware ───────────────────────────────────────────────

app.use(cors());                         // Enable CORS for all origins
app.use(express.json());                  // Parse JSON request bodies
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, "public"))); // Serve static frontend UI

// HTTP request logging (only in development)
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

// Ignore favicon requests or return 204 No Content
app.get("/favicon.ico", (req, res) => res.status(204).end());

// ─── Health Check (no auth required) ─────────────────────────────────

app.get("/api/health", (req, res) => {
  const mongoose = require("mongoose");
  res.status(200).json({
    success: true,
    message: "Job Application Tracker API is running",
    version: "1.0.0",
    dbState: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
  });
});

app.get("/", (req, res) => {
  const acceptHeader = req.headers.accept || "";
  // If client specifically requests pure JSON and NOT HTML (e.g. API client), return JSON
  if (acceptHeader.includes("application/json") && !acceptHeader.includes("text/html")) {
    return res.status(200).json({
      success: true,
      message: "Job Application Tracker API is running",
      version: "1.0.0",
    });
  }
  // Otherwise, serve the TrackFlow HTML Single Page App
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ─── Middleware: Ensure DB Connection on Serverless Invocations ───────

app.use(async (req, res, next) => {
  await connectDB();
  next();
});

// ─── API Routes (auth required) ──────────────────────────────────────

// Check if DB is ready for API routes
app.use("/api/applications", (req, res, next) => {
  const mongoose = require("mongoose");
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      success: false,
      message: "Database connection unavailable. If running on Vercel, please set MONGO_URI in your Vercel Project Environment Variables.",
    });
  }
  next();
});

app.use("/api/applications", authMiddleware, applicationRoutes);

// ─── 404 Handler ─────────────────────────────────────────────────────

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

// ─── Global Error Handler ────────────────────────────────────────────

app.use(errorHandler);

// ─── Start Server ────────────────────────────────────────────────────

const PORT = process.env.PORT || 5000;

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Server running in ${process.env.NODE_ENV || "development"} mode on port ${PORT}`);
  });
}

module.exports = app;
