const mongoose = require("mongoose");

const advisorSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    advisorId: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true,
    },
    department: {
      type: String,
      required: true,
      trim: true,
    },
    batchFocus: {
      type: String,
      trim: true,
      default: "",
    },
  },
  {
    timestamps: true,
    collection: "advisors",
  }
);

module.exports = mongoose.model("Advisor", advisorSchema);
