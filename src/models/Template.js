const mongoose = require("mongoose");

const templateSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    body: {
      type: String,
      default: "",
      maxlength: 4000,
    },
    images: {
      type: [String],
      default: [],
    },
    lastUsedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

templateSchema.index({ user: 1, updatedAt: -1 });

module.exports = mongoose.model("Template", templateSchema);
