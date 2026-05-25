const mongoose = require("mongoose");

const logSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    campaign: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Campaign",
      required: true,
      index: true,
    },
    campaignName: {
      type: String,
      required: true,
      trim: true,
    },
    totalContacts: {
      type: Number,
      default: 0,
    },
    sentCount: {
      type: Number,
      default: 0,
    },
    failedCount: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ["completed", "stopped"],
      default: "completed",
    },
    finishedAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true },
);

logSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model("Log", logSchema);
