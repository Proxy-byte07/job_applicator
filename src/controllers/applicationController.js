const Application = require("../models/Application");

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

// ─── CREATE ──────────────────────────────────────────────────────────

/**
 * @desc    Create a new job application
 * @route   POST /api/applications
 * @access  Protected (API key)
 */
const createApplication = async (req, res, next) => {
  try {
    const { company, jobTitle, location, status, notes, appliedDate } = req.body;

    const application = await Application.create({
      company,
      jobTitle,
      location,
      status,
      notes,
      appliedDate,
    });

    res.status(201).json({
      success: true,
      message: "Application created successfully",
      data: application,
    });
  } catch (error) {
    next(error); // Handled by errorHandler (duplicate key, validation, etc.)
  }
};

// ─── READ ALL ────────────────────────────────────────────────────────

/**
 * @desc    Get all applications with optional filtering, sorting, and pagination
 * @route   GET /api/applications
 * @query   status, company, jobTitle  — filter by exact match (case-insensitive)
 * @query   sort    — comma-separated fields, prefix with - for descending (e.g. -appliedDate)
 * @query   page    — page number (default 1)
 * @query   limit   — results per page (default 10, max 100)
 * @access  Protected (API key)
 */
const getAllApplications = async (req, res, next) => {
  try {
    // --- Build filter object ---
    const filter = {};

    if (req.query.status) {
      filter.status = req.query.status;
    }
    if (req.query.company) {
      filter.company = { $regex: req.query.company, $options: "i" };
    }
    if (req.query.jobTitle) {
      filter.jobTitle = { $regex: req.query.jobTitle, $options: "i" };
    }

    // --- Sorting ---
    let sortOption = { appliedDate: -1 }; // default: newest first
    if (req.query.sort) {
      sortOption = {};
      req.query.sort.split(",").forEach((field) => {
        if (field.startsWith("-")) {
          sortOption[field.substring(1)] = -1;
        } else {
          sortOption[field] = 1;
        }
      });
    }

    // --- Pagination ---
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
    const skip = (page - 1) * limit;

    // --- Execute query ---
    const [applications, totalCount] = await Promise.all([
      Application.find(filter).sort(sortOption).skip(skip).limit(limit),
      Application.countDocuments(filter),
    ]);

    res.status(200).json({
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
  } catch (error) {
    next(error);
  }
};

// ─── READ ONE ────────────────────────────────────────────────────────

/**
 * @desc    Get a single application by ID
 * @route   GET /api/applications/:id
 * @access  Protected (API key)
 */
const getApplicationById = async (req, res, next) => {
  try {
    const application = await Application.findById(req.params.id);

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
 * @access  Protected (API key)
 */
const updateApplication = async (req, res, next) => {
  try {
    const application = await Application.findById(req.params.id);

    if (!application) {
      return res.status(404).json({
        success: false,
        message: "Application not found",
      });
    }

    // --- Status transition enforcement ---
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

    // --- Apply updates ---
    const allowedFields = ["company", "jobTitle", "location", "status", "notes", "appliedDate"];
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        application[field] = req.body[field];
      }
    });

    const updatedApplication = await application.save();

    res.status(200).json({
      success: true,
      message: "Application updated successfully",
      data: updatedApplication,
    });
  } catch (error) {
    next(error);
  }
};

// ─── DELETE ──────────────────────────────────────────────────────────

/**
 * @desc    Delete an application
 * @route   DELETE /api/applications/:id
 * @access  Protected (API key)
 */
const deleteApplication = async (req, res, next) => {
  try {
    const application = await Application.findById(req.params.id);

    if (!application) {
      return res.status(404).json({
        success: false,
        message: "Application not found",
      });
    }

    await application.deleteOne();

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
 * @access  Protected (API key)
 */
const getStatistics = async (req, res, next) => {
  try {
    const [statusCounts, total, mostRecent] = await Promise.all([
      Application.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      Application.countDocuments(),
      Application.findOne().sort({ appliedDate: -1 }).lean(),
    ]);

    // Convert aggregation result to a clean object
    const statusSummary = {};
    const allStatuses = ["Applied", "Interview", "Offer", "Rejected", "Accepted"];
    allStatuses.forEach((s) => (statusSummary[s] = 0));
    statusCounts.forEach((item) => (statusSummary[item._id] = item.count));

    res.status(200).json({
      success: true,
      data: {
        total,
        statusSummary,
        mostRecentApplication: mostRecent || null,
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
