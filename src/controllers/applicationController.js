const Application = require("../models/Application");
const mongoose = require("mongoose");

/**
 * Valid status transitions — enforces the business workflow.
 * Terminal states (Rejected, Accepted) have no outgoing transitions.
 */
const STATUS_TRANSITIONS = {
  Applied: ["Interview", "Rejected"],
  Interview: ["Offer", "Rejected"],
  Offer: ["Accepted", "Rejected"],
  Rejected: [],
  Accepted: [],
};

// In-Memory Storage Fallback when MongoDB is disconnected or in serverless without MONGO_URI
let inMemoryApps = [];

const isDbConnected = () => mongoose.connection.readyState === 1;

// Helper to generate a MongoDB-like ObjectId string for in-memory records
const generateId = () => {
  const timestamp = Math.floor(Date.now() / 1000).toString(16).padStart(8, '0');
  return timestamp + 'f'.repeat(16);
};

// ─── CREATE ──────────────────────────────────────────────────────────

/**
 * @desc    Create a new job application
 * @route   POST /api/applications
 * @access  Protected (API key)
 */
const createApplication = async (req, res, next) => {
  try {
    const { company, jobTitle, location, status, notes, appliedDate } = req.body;

    if (isDbConnected()) {
      const application = await Application.create({
        company,
        jobTitle,
        location,
        status,
        notes,
        appliedDate,
      });

      return res.status(201).json({
        success: true,
        message: "Application created successfully",
        data: application,
      });
    }

    // --- Fallback: In-Memory Storage ---
    const existing = inMemoryApps.find(
      (a) => a.company.toLowerCase() === company.toLowerCase() && a.jobTitle.toLowerCase() === jobTitle.toLowerCase()
    );

    if (existing) {
      return res.status(409).json({
        success: false,
        message: `Duplicate entry — a record with company "${company}" and jobTitle "${jobTitle}" already exists.`,
      });
    }

    const newApp = {
      _id: generateId(),
      company,
      jobTitle,
      location: location || "",
      status: status || "Applied",
      notes: notes || "",
      appliedDate: appliedDate ? new Date(appliedDate) : new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    inMemoryApps.unshift(newApp);

    res.status(201).json({
      success: true,
      message: "Application created successfully (In-Memory Store)",
      data: newApp,
    });
  } catch (error) {
    next(error);
  }
};

// ─── READ ALL ────────────────────────────────────────────────────────

/**
 * @desc    Get all applications with optional filtering, sorting, and pagination
 * @route   GET /api/applications
 */
const getAllApplications = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
    const skip = (page - 1) * limit;

    if (isDbConnected()) {
      const filter = {};
      if (req.query.status) filter.status = req.query.status;
      if (req.query.company) filter.company = { $regex: req.query.company, $options: "i" };
      if (req.query.jobTitle) filter.jobTitle = { $regex: req.query.jobTitle, $options: "i" };

      let sortOption = { appliedDate: -1 };
      if (req.query.sort) {
        sortOption = {};
        req.query.sort.split(",").forEach((field) => {
          if (field.startsWith("-")) sortOption[field.substring(1)] = -1;
          else sortOption[field] = 1;
        });
      }

      const [applications, totalCount] = await Promise.all([
        Application.find(filter).sort(sortOption).skip(skip).limit(limit),
        Application.countDocuments(filter),
      ]);

      return res.status(200).json({
        success: true,
        count: applications.length,
        pagination: {
          page,
          limit,
          totalPages: Math.ceil(totalCount / limit),
          totalCount,
        },
        data: applications,
      });
    }

    // --- Fallback: In-Memory Storage ---
    let result = [...inMemoryApps];

    if (req.query.status) {
      result = result.filter((a) => a.status === req.query.status);
    }
    if (req.query.company) {
      const q = req.query.company.toLowerCase();
      result = result.filter((a) => a.company.toLowerCase().includes(q));
    }
    if (req.query.jobTitle) {
      const q = req.query.jobTitle.toLowerCase();
      result = result.filter((a) => a.jobTitle.toLowerCase().includes(q));
    }

    // Sorting
    const sortField = req.query.sort || "-appliedDate";
    const desc = sortField.startsWith("-");
    const cleanField = desc ? sortField.substring(1) : sortField;

    result.sort((a, b) => {
      let valA = a[cleanField] || "";
      let valB = b[cleanField] || "";
      if (cleanField === "appliedDate") {
        valA = new Date(valA).getTime();
        valB = new Date(valB).getTime();
      }
      if (valA < valB) return desc ? 1 : -1;
      if (valA > valB) return desc ? -1 : 1;
      return 0;
    });

    const totalCount = result.length;
    const paginated = result.slice(skip, skip + limit);

    res.status(200).json({
      success: true,
      count: paginated.length,
      pagination: {
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit) || 1,
        totalCount,
      },
      data: paginated,
    });
  } catch (error) {
    next(error);
  }
};

// ─── READ ONE ────────────────────────────────────────────────────────

/**
 * @desc    Get a single application by ID
 * @route   GET /api/applications/:id
 */
const getApplicationById = async (req, res, next) => {
  try {
    if (isDbConnected()) {
      const application = await Application.findById(req.params.id);
      if (!application) {
        return res.status(404).json({
          success: false,
          message: "Application not found",
        });
      }
      return res.status(200).json({
        success: true,
        data: application,
      });
    }

    // --- Fallback: In-Memory ---
    const application = inMemoryApps.find((a) => a._id === req.params.id);
    if (!application) {
      return res.status(404).json({
        success: false,
        message: "Application not found",
      });
    }

    res.status(200).json({
      success: true,
      data: application,
    });
  } catch (error) {
    next(error);
  }
};

// ─── UPDATE ──────────────────────────────────────────────────────────

/**
 * @desc    Update an existing application (with status transition enforcement)
 * @route   PUT /api/applications/:id
 */
const updateApplication = async (req, res, next) => {
  try {
    if (isDbConnected()) {
      const application = await Application.findById(req.params.id);
      if (!application) {
        return res.status(404).json({
          success: false,
          message: "Application not found",
        });
      }

      if (req.body.status && req.body.status !== application.status) {
        const allowedTransitions = STATUS_TRANSITIONS[application.status];
        if (!allowedTransitions.includes(req.body.status)) {
          return res.status(400).json({
            success: false,
            message: `Invalid status transition: cannot move from "${application.status}" to "${req.body.status}"`,
            allowedTransitions: allowedTransitions.length
              ? allowedTransitions
              : "This is a terminal status — no further transitions allowed.",
          });
        }
      }

      const allowedFields = ["company", "jobTitle", "location", "status", "notes", "appliedDate"];
      allowedFields.forEach((field) => {
        if (req.body[field] !== undefined) {
          application[field] = req.body[field];
        }
      });

      const updatedApplication = await application.save();

      return res.status(200).json({
        success: true,
        message: "Application updated successfully",
        data: updatedApplication,
      });
    }

    // --- Fallback: In-Memory ---
    const index = inMemoryApps.findIndex((a) => a._id === req.params.id);
    if (index === -1) {
      return res.status(404).json({
        success: false,
        message: "Application not found",
      });
    }

    const application = inMemoryApps[index];

    if (req.body.status && req.body.status !== application.status) {
      const allowedTransitions = STATUS_TRANSITIONS[application.status];
      if (!allowedTransitions.includes(req.body.status)) {
        return res.status(400).json({
          success: false,
          message: `Invalid status transition: cannot move from "${application.status}" to "${req.body.status}"`,
          allowedTransitions: allowedTransitions.length
            ? allowedTransitions
            : "This is a terminal status — no further transitions allowed.",
        });
      }
    }

    const allowedFields = ["company", "jobTitle", "location", "status", "notes", "appliedDate"];
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        application[field] = req.body[field];
      }
    });
    application.updatedAt = new Date();

    res.status(200).json({
      success: true,
      message: "Application updated successfully",
      data: application,
    });
  } catch (error) {
    next(error);
  }
};

// ─── DELETE ──────────────────────────────────────────────────────────

/**
 * @desc    Delete an application
 * @route   DELETE /api/applications/:id
 */
const deleteApplication = async (req, res, next) => {
  try {
    if (isDbConnected()) {
      const application = await Application.findById(req.params.id);
      if (!application) {
        return res.status(404).json({
          success: false,
          message: "Application not found",
        });
      }
      await application.deleteOne();
      return res.status(200).json({
        success: true,
        message: "Application deleted successfully",
        data: {},
      });
    }

    // --- Fallback: In-Memory ---
    const index = inMemoryApps.findIndex((a) => a._id === req.params.id);
    if (index === -1) {
      return res.status(404).json({
        success: false,
        message: "Application not found",
      });
    }

    inMemoryApps.splice(index, 1);

    res.status(200).json({
      success: true,
      message: "Application deleted successfully",
      data: {},
    });
  } catch (error) {
    next(error);
  }
};

// ─── STATISTICS ──────────────────────────────────────────────────────

/**
 * @desc    Get dashboard statistics (counts per status, total, most recent)
 * @route   GET /api/applications/stats
 */
const getStatistics = async (req, res, next) => {
  try {
    if (isDbConnected()) {
      const [statusCounts, total, mostRecent] = await Promise.all([
        Application.aggregate([
          { $group: { _id: "$status", count: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ]),
        Application.countDocuments(),
        Application.findOne().sort({ appliedDate: -1 }).lean(),
      ]);

      const statusSummary = {};
      const allStatuses = ["Applied", "Interview", "Offer", "Rejected", "Accepted"];
      allStatuses.forEach((s) => (statusSummary[s] = 0));
      statusCounts.forEach((item) => (statusSummary[item._id] = item.count));

      return res.status(200).json({
        success: true,
        data: {
          total,
          statusSummary,
          mostRecentApplication: mostRecent || null,
        },
      });
    }

    // --- Fallback: In-Memory ---
    const total = inMemoryApps.length;
    const statusSummary = {
      Applied: 0,
      Interview: 0,
      Offer: 0,
      Accepted: 0,
      Rejected: 0,
    };

    inMemoryApps.forEach((app) => {
      if (statusSummary[app.status] !== undefined) {
        statusSummary[app.status]++;
      }
    });

    const sortedByDate = [...inMemoryApps].sort(
      (a, b) => new Date(b.appliedDate).getTime() - new Date(a.appliedDate).getTime()
    );

    res.status(200).json({
      success: true,
      data: {
        total,
        statusSummary,
        mostRecentApplication: sortedByDate[0] || null,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createApplication,
  getAllApplications,
  getApplicationById,
  updateApplication,
  deleteApplication,
  getStatistics,
};
