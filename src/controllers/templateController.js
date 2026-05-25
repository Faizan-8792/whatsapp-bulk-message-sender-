const Template = require("../models/Template");
const asyncHandler = require("../utils/asyncHandler");
const HttpError = require("../utils/httpError");

const listTemplates = asyncHandler(async (req, res) => {
  const templates = await Template.find({ user: req.user._id }).sort({ updatedAt: -1 });
  return res.json({ templates });
});

const saveTemplate = asyncHandler(async (req, res) => {
  const { title, body, images = [] } = req.body || {};
  const normalizedBody = String(body || "");
  const normalizedImages = Array.isArray(images) ? images : [];
  const normalizedTitle = String(title || "").trim() || `Template ${new Date().toLocaleString()}`;

  if (!normalizedBody.trim() && normalizedImages.length === 0) {
    throw new HttpError(400, "Template needs message text or at least one image");
  }

  const template = await Template.create({
    user: req.user._id,
    title: normalizedTitle,
    body: normalizedBody,
    images: normalizedImages,
  });

  return res.status(201).json({ template });
});

const applyTemplate = asyncHandler(async (req, res) => {
  const template = await Template.findOne({
    _id: req.params.templateId,
    user: req.user._id,
  });
  if (!template) {
    throw new HttpError(404, "Template not found");
  }

  template.lastUsedAt = new Date();
  await template.save();
  return res.json({ template });
});

const deleteTemplate = asyncHandler(async (req, res) => {
  const template = await Template.findOne({
    _id: req.params.templateId,
    user: req.user._id,
  });
  if (!template) {
    throw new HttpError(404, "Template not found");
  }
  await Template.deleteOne({ _id: template._id });
  return res.json({ success: true });
});

const clearTemplates = asyncHandler(async (req, res) => {
  const result = await Template.deleteMany({ user: req.user._id });
  return res.json({
    success: true,
    deletedCount: result.deletedCount || 0,
  });
});

module.exports = {
  listTemplates,
  saveTemplate,
  applyTemplate,
  deleteTemplate,
  clearTemplates,
};
