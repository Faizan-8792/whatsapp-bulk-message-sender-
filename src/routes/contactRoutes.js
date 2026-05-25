const express = require("express");
const { requireAuth } = require("../middleware/auth");
const {
  listContacts,
  updateContact,
  deleteContact,
  clearCampaignContacts,
  sendSingleContact,
} = require("../controllers/contactController");

const router = express.Router();

router.use(requireAuth);
router.get("/campaign/:campaignId", listContacts);
router.delete("/campaign/:campaignId", clearCampaignContacts);
router.patch("/:contactId", updateContact);
router.delete("/:contactId", deleteContact);
router.post("/:contactId/send", sendSingleContact);

module.exports = router;
