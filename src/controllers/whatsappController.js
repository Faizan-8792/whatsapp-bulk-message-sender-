const asyncHandler = require("../utils/asyncHandler");
const whatsappService = require("../services/whatsappService");

const initializeWhatsApp = asyncHandler(async (req, res) => {
  await whatsappService.initialize(req.app.get("io"));
  return res.json({
    success: true,
    status: whatsappService.getStatus(),
  });
});

const getWhatsAppStatus = asyncHandler(async (req, res) => {
  let initError = "";
  try {
    await whatsappService.ensureInitialized(req.app.get("io"));
  } catch (error) {
    initError = error?.message || "WhatsApp initialization failed";
  }

  return res.json({
    status: {
      ...whatsappService.getStatus(),
      initError,
    },
  });
});

const logoutWhatsApp = asyncHandler(async (req, res) => {
  const status = await whatsappService.logoutSession();
  return res.json({
    success: true,
    status,
  });
});

const regenerateWhatsAppQr = asyncHandler(async (req, res) => {
  const status = await whatsappService.regenerateQr(req.app.get("io"));
  return res.json({
    success: true,
    status,
  });
});

module.exports = {
  initializeWhatsApp,
  getWhatsAppStatus,
  logoutWhatsApp,
  regenerateWhatsAppQr,
};
