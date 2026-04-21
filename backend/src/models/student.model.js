const mongoose = require("mongoose");

const studentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    studentId: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true,
    },
    serialNo: {
      type: Number,
      min: 1,
      sparse: true,
      index: true,
    },
    batch: {
      type: String,
      required: true,
      trim: true,
    },
    department: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    timestamps: true,
    collection: "students",
  }
);

module.exports = mongoose.model("Student", studentSchema);
