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
app.use(express.static("public"));        // Serve static frontend UI from public folder

// HTTP request logging (only in development)
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

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

app.get("/", (req, res, next) => {
  if (req.headers.accept && req.headers.accept.includes("application/json")) {
    return res.status(200).json({
      success: true,
      message: "Job Application Tracker API is running",
      version: "1.0.0",
    });
  }
  next(); // Pass to express.static / public/index.html
});

// ─── API Routes (auth required) ──────────────────────────────────────

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

app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV || "development"} mode on port ${PORT}`);
});
