const mongoose = require("mongoose");

const courseSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 180,
    },
    credit: {
      type: Number,
      required: true,
      min: 0,
      max: 6,
    },
    courseType: {
      type: String,
      enum: ["theory", "lab"],
      required: true,
      default: "theory",
      index: true,
    },
    department: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },
    teacherName: {
      type: String,
      trim: true,
      default: "",
    },
    teacherNames: {
      type: [
        {
          type: String,
          trim: true,
        },
      ],
      default: [],
    },
    totalClasses: {
      type: Number,
      min: 1,
      default: 39,
    },
    semesterLabel: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },
  },
  {
    timestamps: true,
    collection: "courses",
  }
);

courseSchema.index({ code: 1, semesterLabel: 1 }, { unique: true });

module.exports = mongoose.model("Course", courseSchema);
