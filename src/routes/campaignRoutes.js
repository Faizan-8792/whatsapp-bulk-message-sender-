const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { contactUpload, imageUpload } = require("../middleware/upload");
const {
  getDashboardSummary,
  uploadContacts,
  listCampaigns,
  getCampaignById,
  updateCampaignMessage,
  uploadCampaignImages,
  deleteCampaignImage,
  updateCampaignSettings,
  scheduleCampaign,
  startSending,
  pauseSending,
  resumeSending,
  stopSending,
  retryFailedContacts,
  exportCampaignReport,
} = require("../controllers/campaignController");

const router = express.Router();

router.use(requireAuth);

router.get("/dashboard-summary", getDashboardSummary);
router.get("/", listCampaigns);
router.post("/upload", contactUpload.single("file"), uploadContacts);
router.get("/:campaignId", getCampaignById);
router.patch("/:campaignId/message", updateCampaignMessage);
router.patch("/:campaignId/settings", updateCampaignSettings);
router.patch("/:campaignId/schedule", scheduleCampaign);
router.post("/:campaignId/images", imageUpload.array("images", 10), uploadCampaignImages);
router.delete("/:campaignId/images", deleteCampaignImage);
router.post("/:campaignId/start", startSending);
router.post("/:campaignId/pause", pauseSending);
router.post("/:campaignId/resume", resumeSending);
router.post("/:campaignId/stop", stopSending);
router.post("/:campaignId/retry-failed", retryFailedContacts);
router.get("/:campaignId/export", exportCampaignReport);

module.exports = router;
