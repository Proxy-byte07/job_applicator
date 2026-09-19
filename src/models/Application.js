const mongoose = require("mongoose");

const applicationSchema = new mongoose.Schema(
  {
    company: {
      type: String,
      required: [true, "Company name is required"],
      trim: true,
      minlength: [2, "Company name must be at least 2 characters"],
      maxlength: [100, "Company name cannot exceed 100 characters"],
    },
    jobTitle: {
      type: String,
      required: [true, "Job title is required"],
      trim: true,
      minlength: [2, "Job title must be at least 2 characters"],
      maxlength: [100, "Job title cannot exceed 100 characters"],
    },
    location: {
      type: String,
      trim: true,
      maxlength: [100, "Location cannot exceed 100 characters"],
      default: "",
    },
    status: {
      type: String,
      enum: {
        values: ["Applied", "Interview", "Offer", "Rejected", "Accepted"],
        message: "{VALUE} is not a valid status",
      },
      default: "Applied",
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [500, "Notes cannot exceed 500 characters"],
      default: "",
    },
    appliedDate: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Compound unique index — prevents duplicate applications to the same role at the same company
applicationSchema.index({ company: 1, jobTitle: 1 }, { unique: true });

module.exports = mongoose.model("Application", applicationSchema);
