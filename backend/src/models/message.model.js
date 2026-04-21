const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    fromUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    toUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    fromRole: {
      type: String,
      enum: ["student", "advisor", "admin"],
      required: true,
      index: true,
    },
    toRole: {
      type: String,
      enum: ["student", "advisor", "admin"],
      required: true,
      index: true,
    },
    channel: {
      type: String,
      enum: ["portal", "sms"],
      default: "portal",
      index: true,
    },
    subject: {
      type: String,
      trim: true,
      default: "",
      maxlength: 180,
    },
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: 5000,
    },
    status: {
      type: String,
      enum: ["pending", "new", "replied", "sent", "read"],
      default: "pending",
      index: true,
    },
    readAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: "messages",
  }
);

messageSchema.index({ toUserId: 1, createdAt: -1 });
messageSchema.index({ fromUserId: 1, createdAt: -1 });

module.exports = mongoose.model("Message", messageSchema);
