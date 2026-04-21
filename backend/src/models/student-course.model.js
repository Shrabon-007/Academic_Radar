const mongoose = require("mongoose");

const studentCourseSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
      index: true,
    },
    semesterLabel: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["active", "dropped", "completed"],
      default: "active",
      index: true,
    },
  },
  {
    timestamps: true,
    collection: "student_courses",
  }
);

studentCourseSchema.index({ studentId: 1, courseId: 1, semesterLabel: 1 }, { unique: true });

module.exports = mongoose.model("StudentCourse", studentCourseSchema);
