const Log = require("../models/Log");
const Contact = require("../models/Contact");
const asyncHandler = require("../utils/asyncHandler");
const HttpError = require("../utils/httpError");

const listLogs = asyncHandler(async (req, res) => {
  const logs = await Log.find({ user: req.user._id })
    .sort({ createdAt: -1 })
    .limit(100)
    .populate("campaign", "name status");
  return res.json({ logs });
});

const retryFailedFromLog = asyncHandler(async (req, res) => {
  const log = await Log.findOne({
    _id: req.params.logId,
    user: req.user._id,
  });
  if (!log) {
    throw new HttpError(404, "Log not found");
  }

  await Contact.updateMany(
    { campaign: log.campaign, status: "failed" },
    { $set: { status: "pending", processingAt: null } },
  );

  return res.json({ success: true, campaignId: log.campaign });
});

module.exports = {
  listLogs,
  retryFailedFromLog,
};
