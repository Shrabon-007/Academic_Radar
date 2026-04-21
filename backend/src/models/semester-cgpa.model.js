const mongoose = require("mongoose");

const semesterCgpaSchema = new mongoose.Schema(
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
    cgpa: {
      type: Number,
      min: 0,
      max: 4,
      required: true,
    },
    trend: {
      type: String,
      enum: ["up", "down", "stable"],
      default: "stable",
    },
    note: {
      type: String,
      trim: true,
      default: "",
      maxlength: 1000,
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
    collection: "semester_cgpa",
  }
);

semesterCgpaSchema.index({ studentId: 1, semesterLabel: 1 }, { unique: true });
semesterCgpaSchema.index({ studentId: 1, updatedAt: -1 });

module.exports = mongoose.model("SemesterCgpa", semesterCgpaSchema);
