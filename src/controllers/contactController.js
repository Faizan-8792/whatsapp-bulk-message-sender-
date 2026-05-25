const Campaign = require("../models/Campaign");
const Contact = require("../models/Contact");
const path = require("path");
const asyncHandler = require("../utils/asyncHandler");
const HttpError = require("../utils/httpError");
const { cleanString, normalizePhone, personalizeMessage } = require("../services/phoneService");
const { recalculateCampaignStats } = require("../services/campaignStatsService");
const whatsappService = require("../services/whatsappService");

const listContacts = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    search = "",
    sortBy = "createdAt",
    order = "asc",
    status = "",
  } = req.query;

  const query = {
    user: req.user._id,
    campaign: req.params.campaignId,
  };

  if (status) {
    query.status = status;
  }

  if (search) {
    const regex = new RegExp(String(search).trim(), "i");
    query.$or = [{ name: regex }, { e164: regex }, { phone: regex }];
  }

  const safeLimit = Math.min(100, Math.max(1, Number(limit)));
  const safePage = Math.max(1, Number(page));
  const skip = (safePage - 1) * safeLimit;
  const sortOrder = order === "desc" ? -1 : 1;
  const sortFieldWhitelist = new Set(["createdAt", "name", "e164", "status", "attempts"]);
  const sortField = sortFieldWhitelist.has(String(sortBy)) ? String(sortBy) : "createdAt";

  const [contacts, total] = await Promise.all([
    Contact.find(query)
      .sort({ [sortField]: sortOrder })
      .skip(skip)
      .limit(safeLimit),
    Contact.countDocuments(query),
  ]);

  return res.json({
    contacts,
    pagination: {
      total,
      page: safePage,
      limit: safeLimit,
      pages: Math.ceil(total / safeLimit) || 1,
    },
  });
});

const updateContact = asyncHandler(async (req, res) => {
  const contact = await Contact.findOne({
    _id: req.params.contactId,
    user: req.user._id,
  });
  if (!contact) {
    throw new HttpError(404, "Contact not found");
  }

  const campaign = await Campaign.findOne({ _id: contact.campaign, user: req.user._id });
  if (!campaign) {
    throw new HttpError(404, "Campaign not found");
  }

  const updates = {};
  if (req.body.name !== undefined) {
    updates.name = cleanString(req.body.name) || "Guest";
  }

  if (req.body.phone !== undefined) {
    const normalized = normalizePhone(req.body.phone, campaign.countryCode);
    if (!normalized.isValid) {
      throw new HttpError(400, normalized.reason || "Invalid phone number");
    }

    const existing = await Contact.findOne({
      campaign: campaign._id,
      phone: normalized.normalized,
      _id: { $ne: contact._id },
    });
    if (existing) {
      throw new HttpError(400, "This phone number already exists in campaign");
    }

    updates.phoneRaw = cleanString(req.body.phone);
    updates.phone = normalized.normalized;
    updates.e164 = normalized.e164;
  }

  const updated = await Contact.findByIdAndUpdate(contact._id, { $set: updates }, { new: true });
  await recalculateCampaignStats(campaign._id);
  return res.json({ contact: updated });
});

const deleteContact = asyncHandler(async (req, res) => {
  const contact = await Contact.findOne({
    _id: req.params.contactId,
    user: req.user._id,
  });
  if (!contact) {
    throw new HttpError(404, "Contact not found");
  }

  await Contact.deleteOne({ _id: contact._id });
  await recalculateCampaignStats(contact.campaign);
  return res.json({ success: true });
});

const clearCampaignContacts = asyncHandler(async (req, res) => {
  const campaign = await Campaign.findOne({
    _id: req.params.campaignId,
    user: req.user._id,
  });
  if (!campaign) {
    throw new HttpError(404, "Campaign not found");
  }

  if (campaign.status === "sending" || campaign.status === "paused") {
    throw new HttpError(409, "Stop the campaign before clearing contacts");
  }

  const result = await Contact.deleteMany({
    campaign: campaign._id,
    user: req.user._id,
  });

  await recalculateCampaignStats(campaign._id);
  return res.json({
    success: true,
    deletedCount: result.deletedCount || 0,
  });
});

const sendSingleContact = asyncHandler(async (req, res) => {
  const contact = await Contact.findOne({
    _id: req.params.contactId,
    user: req.user._id,
  });
  if (!contact) {
    throw new HttpError(404, "Contact not found");
  }

  const campaign = await Campaign.findOne({
    _id: contact.campaign,
    user: req.user._id,
  });
  if (!campaign) {
    throw new HttpError(404, "Campaign not found");
  }
  const hasMessage = Boolean(campaign.message?.trim());
  const hasImages = Array.isArray(campaign.imagePaths) && campaign.imagePaths.length > 0;
  if (!hasMessage && !hasImages) {
    throw new HttpError(400, "Campaign needs message text or at least one image");
  }

  await Contact.updateOne(
    { _id: contact._id },
    {
      $set: {
        status: "sending",
        processingAt: new Date(),
      },
    },
  );

  try {
    const text = personalizeMessage(campaign.message, contact);
    await whatsappService.sendMessage({
      chatId: `${contact.phone}@c.us`,
      message: text,
      imagePaths: (campaign.imagePaths || []).map((relativePath) =>
        path.resolve(process.cwd(), relativePath),
      ),
    });
    await Contact.updateOne(
      { _id: contact._id },
      {
        $set: {
          status: "sent",
          sentAt: new Date(),
          lastError: "",
          processingAt: null,
        },
        $inc: { attempts: 1 },
      },
    );
  } catch (error) {
    await Contact.updateOne(
      { _id: contact._id },
      {
        $set: {
          status: "failed",
          lastError: error.message || "Failed to send",
          processingAt: null,
        },
        $inc: { attempts: 1 },
      },
    );
    throw error;
  }

  await recalculateCampaignStats(campaign._id);
  const updatedContact = await Contact.findById(contact._id);
  return res.json({ contact: updatedContact });
});

module.exports = {
  listContacts,
  updateContact,
  deleteContact,
  clearCampaignContacts,
  sendSingleContact,
};
