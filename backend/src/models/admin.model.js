const mongoose = require("mongoose");

const adminSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: "admins",
  }
);

module.exports = mongoose.model("Admin", adminSchema);
