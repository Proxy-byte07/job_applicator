const { body, validationResult } = require("express-validator");

/**
 * Collects validation errors from express-validator and returns a 400 response
 * with structured error details. If no errors, passes control to the next handler.
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: errors.array().map((err) => ({
        field: err.path,
        message: err.msg,
      })),
    });
  }

  next();
};

/**
 * Validation rules for creating a new application.
 * company and jobTitle are required; status defaults to "Applied".
 */
const createValidation = [
  body("company")
    .trim()
    .notEmpty()
    .withMessage("Company name is required")
    .isLength({ min: 2, max: 100 })
    .withMessage("Company name must be between 2 and 100 characters"),

  body("jobTitle")
    .trim()
    .notEmpty()
    .withMessage("Job title is required")
    .isLength({ min: 2, max: 100 })
    .withMessage("Job title must be between 2 and 100 characters"),

  body("location")
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage("Location cannot exceed 100 characters"),

  body("status")
    .optional()
    .isIn(["Applied", "Interview", "Offer", "Rejected", "Accepted"])
    .withMessage(
      "Status must be one of: Applied, Interview, Offer, Rejected, Accepted"
    ),

  body("notes")
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage("Notes cannot exceed 500 characters"),

  body("appliedDate")
    .optional()
    .isISO8601()
    .withMessage("Applied date must be a valid ISO 8601 date"),

  validate,
];

/**
 * Validation rules for updating an existing application.
 * All fields are optional, but any provided field must still pass its rules.
 * Status transition logic is enforced in the controller, not here.
 */
const updateValidation = [
  body("company")
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Company name must be between 2 and 100 characters"),

  body("jobTitle")
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Job title must be between 2 and 100 characters"),

  body("location")
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage("Location cannot exceed 100 characters"),

  body("status")
    .optional()
    .isIn(["Applied", "Interview", "Offer", "Rejected", "Accepted"])
    .withMessage(
      "Status must be one of: Applied, Interview, Offer, Rejected, Accepted"
    ),

  body("notes")
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage("Notes cannot exceed 500 characters"),

  body("appliedDate")
    .optional()
    .isISO8601()
    .withMessage("Applied date must be a valid ISO 8601 date"),

  validate,
];

module.exports = { createValidation, updateValidation };
