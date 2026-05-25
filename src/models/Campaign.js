const mongoose = require("mongoose");
const env = require("../config/env");

const campaignSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    message: {
      type: String,
      default: "",
      maxlength: 4000,
    },
    imagePaths: {
      type: [String],
      default: [],
    },
    countryCode: {
      type: String,
      default: env.defaultCountryCode,
    },
    delayMinMs: {
      type: Number,
      default: env.defaultDelayMinMs,
    },
    delayMaxMs: {
      type: Number,
      default: env.defaultDelayMaxMs,
    },
    retryLimit: {
      type: Number,
      default: env.defaultRetryLimit,
    },
    status: {
      type: String,
      enum: ["draft", "scheduled", "sending", "paused", "stopped", "completed"],
      default: "draft",
      index: true,
    },
    scheduleAt: {
      type: Date,
      default: null,
    },
    startedAt: {
      type: Date,
      default: null,
    },
    finishedAt: {
      type: Date,
      default: null,
    },
    stats: {
      total: { type: Number, default: 0 },
      processed: { type: Number, default: 0 },
      sent: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
      pending: { type: Number, default: 0 },
      successRate: { type: Number, default: 0 },
    },
    meta: {
      sourceFileName: { type: String, default: "" },
      sourceFileType: { type: String, default: "" },
      invalidRows: { type: Number, default: 0 },
      duplicateRows: { type: Number, default: 0 },
      lastError: { type: String, default: "" },
    },
  },
  { timestamps: true },
);

campaignSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model("Campaign", campaignSchema);
