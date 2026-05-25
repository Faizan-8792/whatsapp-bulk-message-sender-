const fs = require("fs");
const path = require("path");
const Campaign = require("../models/Campaign");
const Contact = require("../models/Contact");
const Log = require("../models/Log");
const asyncHandler = require("../utils/asyncHandler");
const HttpError = require("../utils/httpError");
const { parseAndExtractContacts } = require("../services/csvService");
const { recalculateCampaignStats } = require("../services/campaignStatsService");
const sendEngine = require("../services/sendEngine");

function normalizeUploadPath(filePath) {
  const relative = path.relative(process.cwd(), filePath);
  return relative.split(path.sep).join("/");
}

function makeCampaignName(inputName) {
  const trimmed = String(inputName || "").trim();
  if (trimmed) {
    return trimmed;
  }
  const dateText = new Date().toISOString().slice(0, 10);
  return `Campaign ${dateText}`;
}

const getDashboardSummary = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const [totals, activeCampaign, recentLogs] = await Promise.all([
    Contact.aggregate([
      { $match: { user: userId } },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]),
    Campaign.findOne({ user: userId }).sort({ updatedAt: -1 }),
    Log.find({ user: userId }).sort({ createdAt: -1 }).limit(8),
  ]);

  const counts = {
    total: totals.reduce((acc, item) => acc + item.count, 0),
    sent: totals.find((x) => x._id === "sent")?.count || 0,
    failed: totals.find((x) => x._id === "failed")?.count || 0,
    pending:
      (totals.find((x) => x._id === "pending")?.count || 0) +
      (totals.find((x) => x._id === "sending")?.count || 0),
  };
  const successRate =
    counts.total > 0 ? Number(((counts.sent / counts.total) * 100).toFixed(2)) : 0;

  return res.json({
    metrics: {
      totalContacts: counts.total,
      sentSuccessfully: counts.sent,
      failed: counts.failed,
      pending: counts.pending,
      successRate,
    },
    activeCampaign,
    recentLogs,
  });
});

const uploadContacts = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new HttpError(400, "CSV/XLSX file is required");
  }

  const countryCode = String(req.body.countryCode || "91").replace(/[^\d]/g, "");
  const campaignName = makeCampaignName(req.body.campaignName);
  const parsed = parseAndExtractContacts(req.file.path, req.file.originalname, countryCode);

  if (!parsed.contacts.length) {
    throw new HttpError(400, "No valid contacts found in uploaded file", parsed.meta);
  }

  const campaign = await Campaign.create({
    user: req.user._id,
    name: campaignName,
    countryCode,
    status: "draft",
    stats: {
      total: parsed.contacts.length,
      processed: 0,
      sent: 0,
      failed: 0,
      pending: parsed.contacts.length,
      successRate: 0,
    },
    meta: {
      sourceFileName: req.file.originalname,
      sourceFileType: req.file.mimetype,
      invalidRows: parsed.meta.invalid,
      duplicateRows: parsed.meta.duplicates,
    },
  });

  const contactDocs = parsed.contacts.map((contact) => ({
    ...contact,
    user: req.user._id,
    campaign: campaign._id,
  }));
  await Contact.insertMany(contactDocs, { ordered: false });
  await recalculateCampaignStats(campaign._id);

  fs.unlink(req.file.path, () => {});

  const previewContacts = await Contact.find({ campaign: campaign._id }).limit(50).sort({ createdAt: 1 });
  return res.status(201).json({
    campaign,
    previewContacts,
    parsing: {
      ...parsed.meta,
      invalidRows: parsed.invalidRows.slice(0, 25),
      duplicateRows: parsed.duplicateRows.slice(0, 25),
    },
  });
});

const listCampaigns = asyncHandler(async (req, res) => {
  const campaigns = await Campaign.find({ user: req.user._id }).sort({ updatedAt: -1 });
  return res.json({ campaigns });
});

const getCampaignById = asyncHandler(async (req, res) => {
  const campaign = await Campaign.findOne({
    _id: req.params.campaignId,
    user: req.user._id,
  });
  if (!campaign) {
    throw new HttpError(404, "Campaign not found");
  }
  return res.json({ campaign });
});

const updateCampaignMessage = asyncHandler(async (req, res) => {
  const { message } = req.body || {};
  const campaign = await Campaign.findOne({
    _id: req.params.campaignId,
    user: req.user._id,
  });
  if (!campaign) {
    throw new HttpError(404, "Campaign not found");
  }

  campaign.message = String(message || "");
  await campaign.save();
  return res.json({ campaign });
});

const uploadCampaignImages = asyncHandler(async (req, res) => {
  const campaign = await Campaign.findOne({
    _id: req.params.campaignId,
    user: req.user._id,
  });
  if (!campaign) {
    throw new HttpError(404, "Campaign not found");
  }

  const files = req.files || [];
  if (!files.length) {
    throw new HttpError(400, "No images uploaded");
  }

  const imagePaths = files.map((file) => normalizeUploadPath(file.path));
  campaign.imagePaths = [...campaign.imagePaths, ...imagePaths];
  await campaign.save();

  return res.json({
    imagePaths: campaign.imagePaths,
  });
});

const deleteCampaignImage = asyncHandler(async (req, res) => {
  const { imagePath } = req.body || {};
  const campaign = await Campaign.findOne({
    _id: req.params.campaignId,
    user: req.user._id,
  });
  if (!campaign) {
    throw new HttpError(404, "Campaign not found");
  }
  if (!imagePath) {
    throw new HttpError(400, "imagePath is required");
  }

  campaign.imagePaths = campaign.imagePaths.filter((storedPath) => storedPath !== imagePath);
  await campaign.save();

  const absolutePath = path.resolve(process.cwd(), imagePath);
  if (fs.existsSync(absolutePath)) {
    fs.unlink(absolutePath, () => {});
  }

  return res.json({ imagePaths: campaign.imagePaths });
});

const updateCampaignSettings = asyncHandler(async (req, res) => {
  const campaign = await Campaign.findOne({
    _id: req.params.campaignId,
    user: req.user._id,
  });
  if (!campaign) {
    throw new HttpError(404, "Campaign not found");
  }

  const { delayMinMs, delayMaxMs, retryLimit } = req.body || {};
  if (delayMinMs !== undefined) {
    campaign.delayMinMs = Number(delayMinMs);
  }
  if (delayMaxMs !== undefined) {
    campaign.delayMaxMs = Number(delayMaxMs);
  }
  if (retryLimit !== undefined) {
    campaign.retryLimit = Number(retryLimit);
  }

  if (campaign.delayMinMs > campaign.delayMaxMs) {
    throw new HttpError(400, "Minimum delay cannot be greater than maximum delay");
  }

  await campaign.save();
  return res.json({ campaign });
});

const scheduleCampaign = asyncHandler(async (req, res) => {
  const { scheduleAt } = req.body || {};
  if (!scheduleAt) {
    throw new HttpError(400, "scheduleAt is required");
  }

  const campaign = await Campaign.findOne({
    _id: req.params.campaignId,
    user: req.user._id,
  });
  if (!campaign) {
    throw new HttpError(404, "Campaign not found");
  }

  campaign.status = "scheduled";
  campaign.scheduleAt = new Date(scheduleAt);
  await campaign.save();

  return res.json({ campaign });
});

const startSending = asyncHandler(async (req, res) => {
  const result = await sendEngine.startCampaign({
    campaignId: req.params.campaignId,
    userId: req.user._id,
  });
  return res.json(result);
});

const pauseSending = asyncHandler(async (req, res) => {
  const result = await sendEngine.pauseCampaign(req.params.campaignId);
  return res.json(result);
});

const resumeSending = asyncHandler(async (req, res) => {
  const result = await sendEngine.resumeCampaign(req.params.campaignId, req.user._id);
  return res.json(result);
});

const stopSending = asyncHandler(async (req, res) => {
  const result = await sendEngine.stopCampaign(req.params.campaignId);
  return res.json(result);
});

const retryFailedContacts = asyncHandler(async (req, res) => {
  const campaign = await Campaign.findOne({
    _id: req.params.campaignId,
    user: req.user._id,
  });
  if (!campaign) {
    throw new HttpError(404, "Campaign not found");
  }

  await Contact.updateMany(
    { campaign: campaign._id, status: "failed" },
    { $set: { status: "pending", processingAt: null } },
  );
  const stats = await recalculateCampaignStats(campaign._id);

  return res.json({
    success: true,
    stats,
  });
});

const exportCampaignReport = asyncHandler(async (req, res) => {
  const campaign = await Campaign.findOne({
    _id: req.params.campaignId,
    user: req.user._id,
  });
  if (!campaign) {
    throw new HttpError(404, "Campaign not found");
  }

  const contacts = await Contact.find({ campaign: campaign._id }).sort({ createdAt: 1 });
  const header = "Name,Phone,Status,Attempts,Error,SentAt\n";
  const rows = contacts
    .map((c) =>
      [
        `"${String(c.name || "").replace(/"/g, '""')}"`,
        `"${c.e164}"`,
        c.status,
        c.attempts,
        `"${String(c.lastError || "").replace(/"/g, '""')}"`,
        c.sentAt ? c.sentAt.toISOString() : "",
      ].join(","),
    )
    .join("\n");

  const fileName = `${campaign.name.replace(/[^\w.-]/g, "_")}_report.csv`;
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
  return res.send(`${header}${rows}\n`);
});

module.exports = {
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
};
