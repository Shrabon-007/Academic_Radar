const mongoose = require("mongoose");
require("dotenv").config();

const User = require("../src/models/user.model");
const Student = require("../src/models/student.model");
const Advisor = require("../src/models/advisor.model");
const Admin = require("../src/models/admin.model");

const Course = require("../src/models/course.model");
const StudentCourse = require("../src/models/student-course.model");
const Attendance = require("../src/models/attendance.model");
const CtMark = require("../src/models/ct-mark.model");
const SemesterSetup = require("../src/models/semester-setup.model");
const SemesterCgpa = require("../src/models/semester-cgpa.model");
const Notice = require("../src/models/notice.model");
const AdvisorAssignment = require("../src/models/advisor-assignment.model");
const Message = require("../src/models/message.model");

const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/academicradar";

async function syncModel(model) {
  await model.createCollection().catch(() => {
    // Collection may already exist.
  });
  await model.syncIndexes();
  console.log("DB_SYNC:", model.collection.collectionName);
}

async function run() {
  await mongoose.connect(uri);

  const models = [
    User,
    Student,
    Advisor,
    Admin,
    Course,
    StudentCourse,
    Attendance,
    CtMark,
    SemesterSetup,
    SemesterCgpa,
    Notice,
    AdvisorAssignment,
    Message,
  ];

  for (const model of models) {
    await syncModel(model);
  }

  console.log("DB_SYNC_DONE: frontend-driven schema is ready");
  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error("DB_SYNC_ERROR:", error.message);
  try {
    await mongoose.disconnect();
  } catch (err) {
    // ignore disconnect errors
  }
  process.exit(1);
});
