const mongoose = require("mongoose");

const noticeSchema = new mongoose.Schema(
  {
    createdByAdminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    target: {
      type: String,
      enum: ["students", "advisors", "students_advisors"],
      required: true,
      default: "students",
      index: true,
    },
    priority: {
      type: String,
      enum: ["normal", "important", "urgent"],
      required: true,
      default: "normal",
      index: true,
    },
    status: {
      type: String,
      enum: ["draft", "published", "archived"],
      default: "published",
      index: true,
    },
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: 5000,
    },
    publishedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: "notices",
  }
);

noticeSchema.index({ publishedAt: -1, priority: 1 });

module.exports = mongoose.model("Notice", noticeSchema);
