const express = require("express");
const { requireAuth } = require("../middleware/auth");
const {
  initializeWhatsApp,
  getWhatsAppStatus,
  logoutWhatsApp,
  regenerateWhatsAppQr,
} = require("../controllers/whatsappController");

const router = express.Router();

router.use(requireAuth);
router.post("/initialize", initializeWhatsApp);
router.post("/logout", logoutWhatsApp);
router.post("/regenerate-qr", regenerateWhatsAppQr);
router.get("/status", getWhatsAppStatus);

module.exports = router;
