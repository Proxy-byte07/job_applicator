const express = require("express");
const router = express.Router();

const {
  createApplication,
  getAllApplications,
  getApplicationById,
  updateApplication,
  deleteApplication,
  getStatistics,
} = require("../controllers/applicationController");

const {
  createValidation,
  updateValidation,
} = require("../validators/applicationValidator");

// Statistics route MUST come before /:id to avoid "stats" being parsed as an ObjectId
router.get("/stats", getStatistics);

router.route("/")
  .post(createValidation, createApplication)
  .get(getAllApplications);

router.route("/:id")
  .get(getApplicationById)
  .put(updateValidation, updateApplication)
  .delete(deleteApplication);

module.exports = router;
