const mongoose = require("mongoose");

const semesterSetupSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },
    semesterLabel: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    totalCredit: {
      type: Number,
      min: 0,
      max: 30,
      default: 0,
    },
    targetCgpa: {
      type: Number,
      min: 0,
      max: 4,
      default: 0,
    },
    updatedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: "semester_setups",
  }
);

semesterSetupSchema.index({ studentId: 1, semesterLabel: 1 }, { unique: true });

module.exports = mongoose.model("SemesterSetup", semesterSetupSchema);
