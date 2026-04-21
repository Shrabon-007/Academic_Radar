const mongoose = require("mongoose");
const User = require("../models/user.model");
const Student = require("../models/student.model");
const Advisor = require("../models/advisor.model");
const Admin = require("../models/admin.model");

const Course = require("../models/course.model");
const StudentCourse = require("../models/student-course.model");
const Attendance = require("../models/attendance.model");
const CtMark = require("../models/ct-mark.model");
const SemesterSetup = require("../models/semester-setup.model");
const SemesterCgpa = require("../models/semester-cgpa.model");
const Notice = require("../models/notice.model");
const AdvisorAssignment = require("../models/advisor-assignment.model");
const Message = require("../models/message.model");

const normalize = (value) => String(value || "").trim();
const normalizeLower = (value) => normalize(value).toLowerCase();

const escapeRegex = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalizeBatchValue = (value) => normalize(value).replace(/^batch\s*/i, "").trim();

const toBatchPattern = (batchValue) => {
  const normalized = normalizeBatchValue(batchValue);
  const escaped = escapeRegex(normalized);
  return new RegExp("^(batch\\s*)?" + escaped + "$", "i");
};

const toComparableStudentNumber = (student) => {
  if (!student) return null;
  if (Number.isFinite(Number(student.serialNo)) && Number(student.serialNo) > 0) {
    return Number(student.serialNo);
  }
  const numeric = String(student.studentId || "").replace(/\D/g, "");
  return numeric ? Number(numeric) : null;
};

const toNoticeTarget = (target) => {
  const value = normalizeLower(target);
  if (value === "advisors") return "advisors";
  if (value === "students + advisors" || value === "students_advisors") return "students_advisors";
  return "students";
};

const toNoticePriority = (priority) => {
  const value = normalizeLower(priority);
  if (value === "urgent") return "urgent";
  if (value === "important") return "important";
  return "normal";
};

const allowedTheoryCredits = [2, 3, 4];
const allowedLabCredits = [0.75, 1.5];

const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value || 0)));

const getCtPolicy = (courseType, credit) => {
  const type = String(courseType || "theory").toLowerCase();
  const c = Number(credit || 0);

  if (type === "lab") {
    return { totalCt: 0, bestCount: 0, maxMarks: 0, label: "No CT (Lab)" };
  }
  if (c >= 4) {
    return { totalCt: 5, bestCount: 4, maxMarks: 80, label: "5 CT, best 4 (80)" };
  }
  if (c >= 3) {
    return { totalCt: 4, bestCount: 3, maxMarks: 60, label: "4 CT, best 3 (60)" };
  }
  if (c >= 2) {
    return { totalCt: 3, bestCount: 2, maxMarks: 40, label: "3 CT, best 2 (40)" };
  }
  return { totalCt: 0, bestCount: 0, maxMarks: 0, label: "No CT" };
};

const getAttendanceMaxMark = (credit, courseType) => {
  const type = String(courseType || "theory").toLowerCase();
  const value = Number(credit || 0);
  if (type === "lab") return Math.round(value * 10);
  if (value >= 4) return 40;
  if (value >= 3) return 30;
  if (value >= 2) return 20;
  return Math.round(value * 10);
};

const getAttendanceMark = (percentage, credit, courseType) => {
  const maxMark = getAttendanceMaxMark(credit, courseType);
  if (percentage >= 90) return Math.round(maxMark * 1.0);
  if (percentage >= 85) return Math.round(maxMark * 0.9);
  if (percentage >= 80) return Math.round(maxMark * 0.8);
  if (percentage >= 75) return Math.round(maxMark * 0.7);
  if (percentage >= 70) return Math.round(maxMark * 0.6);
  if (percentage >= 65) return Math.round(maxMark * 0.5);
  if (percentage >= 60) return Math.round(maxMark * 0.4);
  return 0;
};

const getAttendanceRisk = (percentage) => {
  if (percentage >= 90) return "good";
  if (percentage >= 75) return "watch";
  if (percentage >= 60) return "watch";
  return "critical";
};

const getCtPerformance = (earned, maxMarks) => {
  if (!maxMarks) return "average";
  const ratio = earned / maxMarks;
  if (ratio >= 0.8) return "strong";
  if (ratio >= 0.6) return "average";
  return "low";
};

const resolveCourseForStudent = async (studentId, semesterLabel, courseCode) => {
  const normalizedCode = normalize(courseCode).toUpperCase();
  if (!normalizedCode) return null;

  const studentCourse = await StudentCourse.findOne({ studentId, semesterLabel })
    .populate({
      path: "courseId",
      match: { code: normalizedCode },
    });

  if (studentCourse && studentCourse.courseId) {
    return studentCourse.courseId;
  }

  return Course.findOne({ code: normalizedCode, semesterLabel });
};

const withContext = async (req) => {
  const user = await User.findById(req.auth.sub);
  if (!user) return { user: null, student: null, advisor: null, admin: null };

  const [student, advisor, admin] = await Promise.all([
    Student.findOne({ userId: user._id }),
    Advisor.findOne({ userId: user._id }),
    Admin.findOne({ userId: user._id }),
  ]);

  return { user, student, advisor, admin };
};

const ensureRole = (res, user, roles) => {
  if (!user || !roles.includes(user.role)) {
    res.status(403).json({ success: false, message: "Forbidden for this role." });
    return false;
  }
  return true;
};

const getStudentCourses = async (req, res) => {
  try {
    const ctx = await withContext(req);
    if (!ensureRole(res, ctx.user, ["student"])) return;
    if (!ctx.student) {
      return res.status(404).json({ success: false, message: "Student profile not found." });
    }

    const rows = await StudentCourse.find({ studentId: ctx.student._id })
      .populate("courseId")
      .sort({ createdAt: -1 });

    const items = rows.map((row) => ({
      id: row._id,
      semesterLabel: row.semesterLabel,
      status: row.status,
      course: row.courseId
        ? {
            id: row.courseId._id,
            code: row.courseId.code,
            name: row.courseId.name,
            credit: row.courseId.credit,
            courseType: row.courseId.courseType,
            teacherName: row.courseId.teacherName,
            teacherNames: row.courseId.teacherNames || [],
          }
        : null,
    }));

    return res.status(200).json({ success: true, data: { items } });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Could not load courses.", error: error.message });
  }
};

const addStudentCourse = async (req, res) => {
  try {
    const ctx = await withContext(req);
    if (!ensureRole(res, ctx.user, ["student"])) return;
    if (!ctx.student) {
      return res.status(404).json({ success: false, message: "Student profile not found." });
    }

    const code = normalize(req.body.code).toUpperCase();
    const name = normalize(req.body.name);
    const teacherPrimary = normalize(req.body.teacherPrimary || req.body.teacherName || req.body.teacher);
    const teacherSecondary = normalize(req.body.teacherSecondary);
    const teacherNames = [teacherPrimary, teacherSecondary].filter(Boolean);
    const teacherName = teacherNames.join(", ");
    const semesterLabel = normalize(req.body.semesterLabel || req.body.semester) || "Level-1 Term-1";
    const credit = Number(req.body.credit || 0);
    const courseType = normalizeLower(req.body.courseType || "theory");

    if (!code || !name || !teacherPrimary || !credit) {
      return res.status(400).json({ success: false, message: "code, name, credit and teacher are required." });
    }

    if (!["theory", "lab"].includes(courseType)) {
      return res.status(400).json({ success: false, message: "courseType must be theory or lab." });
    }

    if (courseType === "theory" && !allowedTheoryCredits.includes(credit)) {
      return res.status(400).json({ success: false, message: "Theory course credit must be 2, 3 or 4." });
    }

    if (courseType === "lab" && !allowedLabCredits.includes(credit)) {
      return res.status(400).json({ success: false, message: "Lab course credit must be 1.5 or 0.75." });
    }

    const course = await Course.findOneAndUpdate(
      { code, semesterLabel },
      {
        $set: {
          code,
          name,
          credit,
          courseType,
          teacherName,
          teacherNames,
          department: ctx.student.department || "",
          semesterLabel,
        },
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    );

    const studentCourse = await StudentCourse.findOneAndUpdate(
      { studentId: ctx.student._id, courseId: course._id, semesterLabel },
      { $set: { status: "active" } },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    );

    return res.status(201).json({
      success: true,
      message: "Course saved.",
      data: {
        id: studentCourse._id,
        semesterLabel,
        status: studentCourse.status,
        course: {
          id: course._id,
          code: course.code,
          name: course.name,
          credit: course.credit,
          courseType: course.courseType,
          teacherName: course.teacherName,
          teacherNames: course.teacherNames || [],
        },
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Could not save course.", error: error.message });
  }
};

const getSemesterSetup = async (req, res) => {
  try {
    const ctx = await withContext(req);
    if (!ensureRole(res, ctx.user, ["student"])) return;
    if (!ctx.student) {
      return res.status(404).json({ success: false, message: "Student profile not found." });
    }

    const items = await SemesterSetup.find({ studentId: ctx.student._id }).sort({ updatedAt: -1 });
    return res.status(200).json({ success: true, data: { items } });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Could not load semester setup.", error: error.message });
  }
};

const saveSemesterSetup = async (req, res) => {
  try {
    const ctx = await withContext(req);
    if (!ensureRole(res, ctx.user, ["student"])) return;
    if (!ctx.student) {
      return res.status(404).json({ success: false, message: "Student profile not found." });
    }

    const semesterLabel = normalize(req.body.semesterLabel || req.body.semester);
    const totalCredit = Number(req.body.totalCredit || 0);
    const targetCgpa = Number(req.body.targetCgpa || 0);

    if (!semesterLabel) {
      return res.status(400).json({ success: false, message: "semester is required." });
    }

    const setup = await SemesterSetup.findOneAndUpdate(
      { studentId: ctx.student._id, semesterLabel },
      {
        $set: {
          totalCredit,
          targetCgpa,
          updatedByUserId: ctx.user._id,
        },
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    );

    return res.status(200).json({ success: true, message: "Semester setup saved.", data: setup });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Could not save semester setup.", error: error.message });
  }
};

const getSemesterCgpa = async (req, res) => {
  try {
    const ctx = await withContext(req);
    if (!ensureRole(res, ctx.user, ["student"])) return;
    if (!ctx.student) {
      return res.status(404).json({ success: false, message: "Student profile not found." });
    }

    const items = await SemesterCgpa.find({ studentId: ctx.student._id }).sort({ updatedAt: -1 });
    return res.status(200).json({ success: true, data: { items } });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Could not load semester CGPA.", error: error.message });
  }
};

const saveSemesterCgpa = async (req, res) => {
  try {
    const ctx = await withContext(req);
    if (!ensureRole(res, ctx.user, ["student"])) return;
    if (!ctx.student) {
      return res.status(404).json({ success: false, message: "Student profile not found." });
    }

    const semesterLabel = normalize(req.body.semesterLabel || req.body.semester);
    const cgpa = Number(req.body.cgpa || 0);
    const note = normalize(req.body.note);

    if (!semesterLabel || !cgpa) {
      return res.status(400).json({ success: false, message: "semester and cgpa are required." });
    }

    const previous = await SemesterCgpa.findOne({ studentId: ctx.student._id, semesterLabel: { $ne: semesterLabel } }).sort({ updatedAt: -1 });
    let trend = "stable";
    if (previous) {
      if (cgpa > previous.cgpa) trend = "up";
      if (cgpa < previous.cgpa) trend = "down";
    }

    const item = await SemesterCgpa.findOneAndUpdate(
      { studentId: ctx.student._id, semesterLabel },
      {
        $set: {
          cgpa,
          note,
          trend,
          updatedByUserId: ctx.user._id,
        },
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    );

    return res.status(200).json({ success: true, message: "Semester CGPA saved.", data: item });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Could not save semester CGPA.", error: error.message });
  }
};

const getStudentAttendance = async (req, res) => {
  try {
    const ctx = await withContext(req);
    if (!ensureRole(res, ctx.user, ["student"])) return;
    if (!ctx.student) {
      return res.status(404).json({ success: false, message: "Student profile not found." });
    }

    const semesterLabel = normalize(req.query.semesterLabel || req.query.semester || "");
    const query = { studentId: ctx.student._id };
    if (semesterLabel) query.semesterLabel = semesterLabel;

    const rows = await Attendance.find(query).populate("courseId").sort({ updatedAt: -1 });
    const items = rows.map((row) => {
      const credit = row.courseId ? row.courseId.credit : 0;
      const courseType = row.courseId ? row.courseId.courseType : "theory";
      return {
        id: row._id,
        semesterLabel: row.semesterLabel,
        course: row.courseId
          ? {
              id: row.courseId._id,
              code: row.courseId.code,
              name: row.courseId.name,
              credit: row.courseId.credit,
              courseType: row.courseId.courseType,
            }
          : null,
        classStates: row.classStates,
        classesHeld: row.classesHeld,
        attended: row.attended,
        percentage: row.percentage,
        predictedMark: row.predictedMark,
        maxMark: getAttendanceMaxMark(credit, courseType),
        risk: row.risk,
      };
    });

    return res.status(200).json({ success: true, data: { items } });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Could not load attendance.", error: error.message });
  }
};

const saveStudentAttendance = async (req, res) => {
  try {
    const ctx = await withContext(req);
    if (!ensureRole(res, ctx.user, ["student"])) return;
    if (!ctx.student) {
      return res.status(404).json({ success: false, message: "Student profile not found." });
    }

    const semesterLabel = normalize(req.body.semesterLabel || req.body.semester);
    const courseCode = normalize(req.body.courseCode || req.body.code).toUpperCase();
    const statesRaw = Array.isArray(req.body.classStates) ? req.body.classStates : [];

    if (!semesterLabel || !courseCode) {
      return res.status(400).json({ success: false, message: "semesterLabel and courseCode are required." });
    }

    const course = await resolveCourseForStudent(ctx.student._id, semesterLabel, courseCode);
    if (!course) {
      return res.status(404).json({ success: false, message: "Course not found for this student/semester." });
    }

    const classStates = statesRaw.map((state) => {
      const normalized = normalize(state).toUpperCase();
      if (normalized === "P" || normalized === "A") return normalized;
      return "-";
    });

    const present = classStates.filter((x) => x === "P").length;
    const absent = classStates.filter((x) => x === "A").length;
    const held = present + absent;
    const percentage = held ? Math.round((present / held) * 100) : 0;
    const predictedMark = getAttendanceMark(percentage, course.credit, course.courseType);
    const risk = getAttendanceRisk(percentage);

    const item = await Attendance.findOneAndUpdate(
      { studentId: ctx.student._id, courseId: course._id, semesterLabel },
      {
        $set: {
          classStates,
          classesHeld: held,
          attended: present,
          percentage,
          predictedMark,
          risk,
        },
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    );

    return res.status(200).json({
      success: true,
      message: "Attendance saved.",
      data: {
        id: item._id,
        semesterLabel,
        course: {
          id: course._id,
          code: course.code,
          name: course.name,
          credit: course.credit,
          courseType: course.courseType,
        },
        classStates: item.classStates,
        classesHeld: item.classesHeld,
        attended: item.attended,
        percentage: item.percentage,
        predictedMark: item.predictedMark,
        maxMark: getAttendanceMaxMark(course.credit, course.courseType),
        risk: item.risk,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Could not save attendance.", error: error.message });
  }
};

const getStudentCtMarks = async (req, res) => {
  try {
    const ctx = await withContext(req);
    if (!ensureRole(res, ctx.user, ["student"])) return;
    if (!ctx.student) {
      return res.status(404).json({ success: false, message: "Student profile not found." });
    }

    const semesterLabel = normalize(req.query.semesterLabel || req.query.semester || "");
    const query = { studentId: ctx.student._id };
    if (semesterLabel) query.semesterLabel = semesterLabel;

    const rows = await CtMark.find(query).populate("courseId").sort({ updatedAt: -1 });
    const items = rows.map((row) => ({
      id: row._id,
      semesterLabel: row.semesterLabel,
      course: row.courseId
        ? {
            id: row.courseId._id,
            code: row.courseId.code,
            name: row.courseId.name,
            credit: row.courseId.credit,
            courseType: row.courseId.courseType,
          }
        : null,
      ct: [row.ct1, row.ct2, row.ct3, row.ct4, row.ct5],
      totalCt: row.totalCt,
      bestCount: row.bestCount,
      maxMarks: row.maxMarks,
      total: row.total,
      performance: row.performance,
    }));

    return res.status(200).json({ success: true, data: { items } });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Could not load CT marks.", error: error.message });
  }
};

const saveStudentCtMarks = async (req, res) => {
  try {
    const ctx = await withContext(req);
    if (!ensureRole(res, ctx.user, ["student"])) return;
    if (!ctx.student) {
      return res.status(404).json({ success: false, message: "Student profile not found." });
    }

    const semesterLabel = normalize(req.body.semesterLabel || req.body.semester);
    const courseCode = normalize(req.body.courseCode || req.body.code).toUpperCase();

    if (!semesterLabel || !courseCode) {
      return res.status(400).json({ success: false, message: "semesterLabel and courseCode are required." });
    }

    const course = await resolveCourseForStudent(ctx.student._id, semesterLabel, courseCode);
    if (!course) {
      return res.status(404).json({ success: false, message: "Course not found for this student/semester." });
    }

    const ctArrayInput = Array.isArray(req.body.ct) ? req.body.ct : [];
    const ct1 = clamp(ctArrayInput[0] !== undefined ? ctArrayInput[0] : req.body.ct1, 0, 20);
    const ct2 = clamp(ctArrayInput[1] !== undefined ? ctArrayInput[1] : req.body.ct2, 0, 20);
    const ct3 = clamp(ctArrayInput[2] !== undefined ? ctArrayInput[2] : req.body.ct3, 0, 20);
    const ct4 = clamp(ctArrayInput[3] !== undefined ? ctArrayInput[3] : req.body.ct4, 0, 20);
    const ct5 = clamp(ctArrayInput[4] !== undefined ? ctArrayInput[4] : req.body.ct5, 0, 20);

    const policy = getCtPolicy(course.courseType, course.credit);
    const values = [ct1, ct2, ct3, ct4, ct5];
    const activeValues = values.slice(0, policy.totalCt);
    const sorted = activeValues.slice().sort((a, b) => b - a);
    const total = sorted.slice(0, policy.bestCount).reduce((sum, value) => sum + value, 0);
    const performance = getCtPerformance(total, policy.maxMarks);

    const item = await CtMark.findOneAndUpdate(
      { studentId: ctx.student._id, courseId: course._id, semesterLabel },
      {
        $set: {
          ct1,
          ct2,
          ct3,
          ct4,
          ct5,
          totalCt: policy.totalCt,
          bestCount: policy.bestCount,
          maxMarks: policy.maxMarks,
          total,
          performance,
        },
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    );

    return res.status(200).json({
      success: true,
      message: "CT marks saved.",
      data: {
        id: item._id,
        semesterLabel,
        course: {
          id: course._id,
          code: course.code,
          name: course.name,
          credit: course.credit,
          courseType: course.courseType,
        },
        ct: [item.ct1, item.ct2, item.ct3, item.ct4, item.ct5],
        totalCt: item.totalCt,
        bestCount: item.bestCount,
        maxMarks: item.maxMarks,
        total: item.total,
        performance: item.performance,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Could not save CT marks.", error: error.message });
  }
};

const getStudentCumulativeCgpa = async (req, res) => {
  try {
    const ctx = await withContext(req);
    if (!ensureRole(res, ctx.user, ["student"])) return;
    if (!ctx.student) {
      return res.status(404).json({ success: false, message: "Student profile not found." });
    }

    const rows = await SemesterCgpa.find({ studentId: ctx.student._id }).sort({ semesterLabel: 1, updatedAt: 1 });
    const timeline = [];
    let sum = 0;
    rows.forEach((row, idx) => {
      sum += Number(row.cgpa || 0);
      timeline.push({
        semesterLabel: row.semesterLabel,
        semesterCgpa: row.cgpa,
        cumulativeCgpa: Number((sum / (idx + 1)).toFixed(2)),
      });
    });

    const cumulativeCgpa = timeline.length ? timeline[timeline.length - 1].cumulativeCgpa : 0;

    return res.status(200).json({
      success: true,
      data: {
        cumulativeCgpa,
        semesterCount: timeline.length,
        timeline,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Could not load cumulative CGPA.", error: error.message });
  }
};

const getStudentRanking = async (req, res) => {
  try {
    const ctx = await withContext(req);
    if (!ensureRole(res, ctx.user, ["student"])) return;
    if (!ctx.student) {
      return res.status(404).json({ success: false, message: "Student profile not found." });
    }

    const scope = normalizeLower(req.query.scope || "batch");
    const studentFilter = {};

    if (scope === "department") {
      studentFilter.department = ctx.student.department;
    } else {
      studentFilter.batch = ctx.student.batch;
    }

    const studentsInScope = await Student.find(studentFilter).select("_id studentId batch department");
    if (!studentsInScope.length) {
      return res.status(200).json({
        success: true,
        data: {
          scope,
          rank: 0,
          classSize: 0,
          percentile: 0,
          cumulativeCgpa: 0,
          latestSemesterCgpa: 0,
        },
      });
    }

    const studentIds = studentsInScope.map((s) => s._id);

    const cgpaAgg = await SemesterCgpa.aggregate([
      { $match: { studentId: { $in: studentIds } } },
      {
        $group: {
          _id: "$studentId",
          cumulativeCgpa: { $avg: "$cgpa" },
          latestUpdatedAt: { $max: "$updatedAt" },
        },
      },
      {
        $lookup: {
          from: "semester_cgpa",
          let: { sid: "$_id", lu: "$latestUpdatedAt" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$studentId", "$$sid"] },
                    { $eq: ["$updatedAt", "$$lu"] },
                  ],
                },
              },
            },
            { $project: { _id: 0, cgpa: 1 } },
          ],
          as: "latestRows",
        },
      },
      {
        $project: {
          cumulativeCgpa: { $round: ["$cumulativeCgpa", 2] },
          latestSemesterCgpa: {
            $round: [{ $ifNull: [{ $arrayElemAt: ["$latestRows.cgpa", 0] }, 0] }, 2],
          },
        },
      },
    ]);

    const scoreByStudent = new Map();
    cgpaAgg.forEach((row) => {
      scoreByStudent.set(String(row._id), {
        cumulativeCgpa: Number(row.cumulativeCgpa || 0),
        latestSemesterCgpa: Number(row.latestSemesterCgpa || 0),
      });
    });

    const ranked = studentsInScope
      .map((student) => {
        const score = scoreByStudent.get(String(student._id)) || { cumulativeCgpa: 0, latestSemesterCgpa: 0 };
        return {
          studentId: String(student._id),
          cumulativeCgpa: score.cumulativeCgpa,
          latestSemesterCgpa: score.latestSemesterCgpa,
        };
      })
      .sort((a, b) => {
        if (b.cumulativeCgpa !== a.cumulativeCgpa) return b.cumulativeCgpa - a.cumulativeCgpa;
        return b.latestSemesterCgpa - a.latestSemesterCgpa;
      });

    const myStudentId = String(ctx.student._id);
    const myIndex = ranked.findIndex((row) => row.studentId === myStudentId);
    const classSize = ranked.length;
    const rank = myIndex >= 0 ? myIndex + 1 : classSize;
    const percentile = classSize ? Math.round(((classSize - rank + 1) / classSize) * 100) : 0;
    const me = ranked[myIndex] || { cumulativeCgpa: 0, latestSemesterCgpa: 0 };

    return res.status(200).json({
      success: true,
      data: {
        scope,
        rank,
        classSize,
        percentile,
        cumulativeCgpa: me.cumulativeCgpa,
        latestSemesterCgpa: me.latestSemesterCgpa,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Could not load student ranking.", error: error.message });
  }
};

const getNotices = async (req, res) => {
  try {
    const ctx = await withContext(req);
    if (!ctx.user) {
      return res.status(401).json({ success: false, message: "Unauthorized." });
    }

    const role = ctx.user.role;
    const targets = role === "advisor" ? ["advisors", "students_advisors"] : role === "student" ? ["students", "students_advisors"] : ["students", "advisors", "students_advisors"];

    const items = await Notice.find({ target: { $in: targets }, status: { $ne: "archived" } }).sort({ publishedAt: -1 });
    return res.status(200).json({ success: true, data: { items } });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Could not load notices.", error: error.message });
  }
};

const createNotice = async (req, res) => {
  try {
    const ctx = await withContext(req);
    if (!ensureRole(res, ctx.user, ["admin"])) return;
    if (!ctx.admin) {
      return res.status(404).json({ success: false, message: "Admin profile not found." });
    }

    const title = normalize(req.body.title);
    const content = normalize(req.body.content);
    if (!title || !content) {
      return res.status(400).json({ success: false, message: "title and content are required." });
    }

    const item = await Notice.create({
      createdByAdminId: ctx.admin._id,
      title,
      content,
      target: toNoticeTarget(req.body.target),
      priority: toNoticePriority(req.body.priority),
      status: "published",
      publishedAt: new Date(),
    });

    return res.status(201).json({ success: true, message: "Notice published.", data: item });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Could not publish notice.", error: error.message });
  }
};

const getAdvisorAssignments = async (req, res) => {
  try {
    const ctx = await withContext(req);
    if (!ensureRole(res, ctx.user, ["admin"])) return;

    const items = await AdvisorAssignment.find({}).sort({ createdAt: -1 });
    return res.status(200).json({ success: true, data: { items } });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Could not load assignments.", error: error.message });
  }
};

const getAdminAdvisors = async (req, res) => {
  try {
    const ctx = await withContext(req);
    if (!ensureRole(res, ctx.user, ["admin"])) return;

    const advisors = await Advisor.find({}).populate("userId", "name").sort({ createdAt: -1 });
    const assignments = await AdvisorAssignment.find({ status: "assigned" }).select("advisorName startSerial endSerial");

    const adviseeCountByAdvisor = {};
    assignments.forEach((item) => {
      const name = normalize(item.advisorName);
      const count = Math.max(0, Number(item.endSerial || 0) - Number(item.startSerial || 0) + 1);
      adviseeCountByAdvisor[name] = (adviseeCountByAdvisor[name] || 0) + count;
    });

    const items = advisors.map((advisor) => {
      const advisorName = advisor.userId && advisor.userId.name ? advisor.userId.name : "Advisor";
      return {
        id: advisor._id,
        advisorId: advisor.advisorId,
        name: advisorName,
        department: advisor.department || "",
        batchFocus: advisor.batchFocus || "",
        adviseeCount: adviseeCountByAdvisor[advisorName] || 0,
      };
    });

    return res.status(200).json({ success: true, data: { items } });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Could not load advisors.", error: error.message });
  }
};

const getStudentAssignedAdvisor = async (req, res) => {
  try {
    const ctx = await withContext(req);
    if (!ensureRole(res, ctx.user, ["student"])) return;
    if (!ctx.student) {
      return res.status(404).json({ success: false, message: "Student profile not found." });
    }

    const comparable = toComparableStudentNumber(ctx.student);
    if (!Number.isFinite(comparable)) {
      return res.status(200).json({ success: true, data: { advisor: null } });
    }

    const assignment = await AdvisorAssignment.findOne({
      batch: toBatchPattern(ctx.student.batch),
      status: "assigned",
      startSerial: { $lte: comparable },
      endSerial: { $gte: comparable },
    }).sort({ createdAt: -1 });

    if (!assignment) {
      return res.status(200).json({ success: true, data: { advisor: null } });
    }

    return res.status(200).json({
      success: true,
      data: {
        advisor: {
          advisorName: assignment.advisorName,
          batch: assignment.batch,
          startSerial: assignment.startSerial,
          endSerial: assignment.endSerial,
        },
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Could not resolve assigned advisor.", error: error.message });
  }
};

const getAdvisorStudentsByBatch = async (req, res) => {
  try {
    const ctx = await withContext(req);
    if (!ensureRole(res, ctx.user, ["advisor"])) return;

    const batchQuery = normalize(req.query.batch);
    const assignmentsFilter = {
      advisorName: ctx.user.name,
      status: "assigned",
    };

    if (batchQuery) {
      assignmentsFilter.batch = toBatchPattern(batchQuery);
    }

    const assignments = await AdvisorAssignment.find(assignmentsFilter).sort({ createdAt: -1 });
    const availableBatches = Array.from(new Set(assignments.map((item) => normalizeBatchValue(item.batch)).filter(Boolean)));

    if (!assignments.length) {
      return res.status(200).json({ success: true, data: { batches: availableBatches, items: [] } });
    }

    const assignmentByBatch = {};
    assignments.forEach((assignment) => {
      var key = normalizeBatchValue(assignment.batch);
      if (!assignmentByBatch[key]) assignmentByBatch[key] = [];
      assignmentByBatch[key].push(assignment);
    });

    const targetBatchKeys = Object.keys(assignmentByBatch);
    const students = await Student.find({}).populate("userId", "name");

    const matchedStudents = students.filter((student) => {
      var batchKey = normalizeBatchValue(student.batch);
      if (targetBatchKeys.indexOf(batchKey) < 0) return false;

      var comparable = toComparableStudentNumber(student);
      if (!Number.isFinite(comparable)) return false;

      return assignmentByBatch[batchKey].some((assignment) => {
        return comparable >= Number(assignment.startSerial || 0) && comparable <= Number(assignment.endSerial || 0);
      });
    });

    const studentIds = matchedStudents.map((student) => student._id);
    const cgpaRows = await SemesterCgpa.find({ studentId: { $in: studentIds } }).sort({ updatedAt: -1 });

    const cgpaMap = new Map();
    cgpaRows.forEach((row) => {
      const key = String(row.studentId);
      const current = cgpaMap.get(key) || { latest: null, sum: 0, count: 0 };
      if (current.latest === null) {
        current.latest = Number(row.cgpa || 0);
      }
      current.sum += Number(row.cgpa || 0);
      current.count += 1;
      cgpaMap.set(key, current);
    });

    const items = matchedStudents.map((student) => {
      const cgpa = cgpaMap.get(String(student._id)) || { latest: 0, sum: 0, count: 0 };
      const overall = cgpa.count ? Number((cgpa.sum / cgpa.count).toFixed(2)) : 0;

      return {
        userId: student.userId ? String(student.userId._id) : "",
        studentId: student.studentId,
        name: (student.userId && student.userId.name) ? student.userId.name : "Student",
        batch: normalizeBatchValue(student.batch),
        currentCgpa: Number(Number(cgpa.latest || 0).toFixed(2)),
        overallCgpa: overall,
      };
    }).sort((a, b) => {
      if (a.batch !== b.batch) return String(a.batch).localeCompare(String(b.batch));
      if (b.currentCgpa !== a.currentCgpa) return b.currentCgpa - a.currentCgpa;
      return String(a.studentId || "").localeCompare(String(b.studentId || ""));
    }).map((item, idx) => {
      return {
        rank: idx + 1,
        userId: item.userId,
        studentId: item.studentId,
        name: item.name,
        batch: item.batch,
        currentCgpa: item.currentCgpa,
        overallCgpa: item.overallCgpa,
      };
    });

    return res.status(200).json({ success: true, data: { batches: availableBatches, items } });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Could not load advisor students.", error: error.message });
  }
};

const getAdminStudentsByBatch = async (req, res) => {
  try {
    const ctx = await withContext(req);
    if (!ensureRole(res, ctx.user, ["admin"])) return;

    const batchRaw = normalize(req.query.batch);
    if (!batchRaw) {
      return res.status(400).json({ success: false, message: "batch query is required." });
    }

    const batchNumber = batchRaw.replace(/^batch\s*/i, "").trim();
    const escapedBatch = batchNumber.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const batchPattern = new RegExp("^(batch\\s*)?" + escapedBatch + "$", "i");

    const [students, assignments] = await Promise.all([
      Student.find({ batch: batchPattern }).populate("userId", "name").sort({ studentId: 1 }),
      AdvisorAssignment.find({ batch: batchPattern, status: "assigned" }).sort({ createdAt: -1 }),
    ]);

    const toComparableNumber = (student) => {
      if (Number.isFinite(student.serialNo) && Number(student.serialNo) > 0) {
        return Number(student.serialNo);
      }
      const numeric = String(student.studentId || "").replace(/\D/g, "");
      return numeric ? Number(numeric) : null;
    };

    const normalizedStudents = students.map((student) => {
      const comparable = toComparableNumber(student);
      const activeAssignment = assignments.find((assignment) => {
        if (!Number.isFinite(comparable)) return false;
        return comparable >= Number(assignment.startSerial || 0) && comparable <= Number(assignment.endSerial || 0);
      });

      return {
        id: student._id,
        studentId: student.studentId,
        name: student.userId && student.userId.name ? student.userId.name : "Student",
        batch: student.batch,
        comparable,
        assignedAdvisor: activeAssignment ? activeAssignment.advisorName : null,
      };
    }).sort((a, b) => {
      const av = Number.isFinite(a.comparable) ? a.comparable : Number.MAX_SAFE_INTEGER;
      const bv = Number.isFinite(b.comparable) ? b.comparable : Number.MAX_SAFE_INTEGER;
      if (av !== bv) return av - bv;
      return String(a.studentId || "").localeCompare(String(b.studentId || ""));
    });

    const items = normalizedStudents.map((student, idx) => ({
      serial: idx + 1,
      studentId: student.studentId,
      name: student.name,
      batch: student.batch,
      assignedAdvisor: student.assignedAdvisor,
    }));

    return res.status(200).json({ success: true, data: { batch: batchNumber, items } });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Could not load students by batch.", error: error.message });
  }
};

const createAdvisorAssignment = async (req, res) => {
  try {
    const ctx = await withContext(req);
    if (!ensureRole(res, ctx.user, ["admin"])) return;
    if (!ctx.admin) {
      return res.status(404).json({ success: false, message: "Admin profile not found." });
    }

    const batch = normalize(req.body.batch);
    const advisorName = normalize(req.body.advisorName || req.body.teacher);
    const startSerial = Number(req.body.startSerial || req.body.startId || 0);
    const endSerial = Number(req.body.endSerial || req.body.endId || 0);
    const studentCount = endSerial - startSerial + 1;

    if (!batch || !advisorName || !startSerial || !endSerial || endSerial < startSerial) {
      return res.status(400).json({ success: false, message: "Invalid assignment payload." });
    }

    if (studentCount !== 10) {
      return res.status(400).json({ success: false, message: "Each advisor assignment must include exactly 10 students." });
    }

    const advisorUser = await User.findOne({ role: "advisor", name: advisorName });
    let advisorId = null;
    if (advisorUser) {
      const advisorProfile = await Advisor.findOne({ userId: advisorUser._id });
      advisorId = advisorProfile ? advisorProfile._id : null;
    }

    const existingExact = await AdvisorAssignment.findOne({ batch, advisorName, startSerial, endSerial });

    if (!existingExact) {
      const overlapping = await AdvisorAssignment.findOne({
        batch,
        status: "assigned",
        startSerial: { $lte: endSerial },
        endSerial: { $gte: startSerial },
      });

      if (overlapping) {
        return res.status(409).json({
          success: false,
          message: "This student range overlaps with an existing advisor assignment in the same batch.",
        });
      }
    }

    const item = await AdvisorAssignment.findOneAndUpdate(
      { batch, advisorName, startSerial, endSerial },
      {
        $set: {
          advisorId,
          status: "assigned",
          createdByAdminId: ctx.admin._id,
        },
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    );

    return res.status(201).json({ success: true, message: "Advisor assigned.", data: item });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Could not save assignment.", error: error.message });
  }
};

const getAdvisorStudentReport = async (req, res) => {
  try {
    const ctx = await withContext(req);
    if (!ensureRole(res, ctx.user, ["advisor"])) return;

    const studentUserId = normalize(req.query.studentUserId);
    const studentIdValue = normalize(req.query.studentId);

    if (!studentUserId && !studentIdValue) {
      return res.status(400).json({ success: false, message: "studentUserId or studentId query is required." });
    }

    let targetStudent = null;
    if (studentUserId) {
      targetStudent = await Student.findOne({ userId: studentUserId }).populate("userId", "name");
    }
    if (!targetStudent && studentIdValue) {
      targetStudent = await Student.findOne({ studentId: studentIdValue }).populate("userId", "name");
    }

    if (!targetStudent) {
      return res.status(404).json({ success: false, message: "Student not found." });
    }

    const comparable = toComparableStudentNumber(targetStudent);
    if (!Number.isFinite(comparable)) {
      return res.status(403).json({ success: false, message: "Student is not assigned to this advisor." });
    }

    const advisorAssignments = await AdvisorAssignment.find({
      advisorName: ctx.user.name,
      batch: toBatchPattern(targetStudent.batch),
      status: "assigned",
      startSerial: { $lte: comparable },
      endSerial: { $gte: comparable },
    }).sort({ createdAt: -1 });

    if (!advisorAssignments.length) {
      return res.status(403).json({ success: false, message: "You can only view reports of your assigned students." });
    }

    const semesterRows = await SemesterCgpa.find({ studentId: targetStudent._id }).sort({ updatedAt: -1, semesterLabel: -1 });

    const semesterItems = semesterRows.map((row) => ({
      semesterLabel: row.semesterLabel,
      cgpa: Number(Number(row.cgpa || 0).toFixed(2)),
      trend: row.trend || "stable",
      updatedAt: row.updatedAt,
    }));

    const latestSemesterLabel = semesterItems.length ? semesterItems[0].semesterLabel : "";
    const currentSemesterCgpa = semesterItems.length ? Number(semesterItems[0].cgpa || 0) : 0;
    const overallCgpa = semesterItems.length
      ? Number((semesterItems.reduce((sum, item) => sum + Number(item.cgpa || 0), 0) / semesterItems.length).toFixed(2))
      : 0;

    const attendanceRows = latestSemesterLabel
      ? await Attendance.find({ studentId: targetStudent._id, semesterLabel: latestSemesterLabel }).populate("courseId").sort({ updatedAt: -1 })
      : [];
    const attendanceItems = attendanceRows.map((row) => ({
      courseCode: row.courseId ? row.courseId.code : "",
      courseName: row.courseId ? row.courseId.name : "Course",
      percentage: Number(row.percentage || 0),
      predictedMark: Number(row.predictedMark || 0),
      risk: row.risk || "watch",
    }));

    const ctRows = latestSemesterLabel
      ? await CtMark.find({ studentId: targetStudent._id, semesterLabel: latestSemesterLabel }).populate("courseId").sort({ updatedAt: -1 })
      : [];
    const ctItems = ctRows.map((row) => ({
      courseCode: row.courseId ? row.courseId.code : "",
      courseName: row.courseId ? row.courseId.name : "Course",
      total: Number(row.total || 0),
      maxMarks: Number(row.maxMarks || 0),
      performance: row.performance || "average",
    }));

    const avgAttendance = attendanceItems.length
      ? Number((attendanceItems.reduce((sum, item) => sum + Number(item.percentage || 0), 0) / attendanceItems.length).toFixed(1))
      : 0;
    const avgCtPercent = ctItems.length
      ? Number((ctItems.reduce((sum, item) => {
        var maxMarks = Number(item.maxMarks || 0);
        if (!maxMarks) return sum;
        return sum + (Number(item.total || 0) / maxMarks) * 100;
      }, 0) / ctItems.length).toFixed(1))
      : 0;

    const assignments = await AdvisorAssignment.find({ advisorName: ctx.user.name, status: "assigned" }).sort({ createdAt: -1 });
    const assignmentByBatch = {};
    assignments.forEach((assignment) => {
      const key = normalizeBatchValue(assignment.batch);
      if (!assignmentByBatch[key]) assignmentByBatch[key] = [];
      assignmentByBatch[key].push(assignment);
    });

    const students = await Student.find({}).select("_id studentId serialNo batch");
    const matchedStudentIds = students.filter((student) => {
      const key = normalizeBatchValue(student.batch);
      if (!assignmentByBatch[key]) return false;
      const studentComparable = toComparableStudentNumber(student);
      if (!Number.isFinite(studentComparable)) return false;
      return assignmentByBatch[key].some((assignment) => {
        return studentComparable >= Number(assignment.startSerial || 0) && studentComparable <= Number(assignment.endSerial || 0);
      });
    }).map((student) => String(student._id));

    const rankingRows = await SemesterCgpa.aggregate([
      { $match: { studentId: { $in: matchedStudentIds.map((id) => new mongoose.Types.ObjectId(id)) } } },
      {
        $group: {
          _id: "$studentId",
          overall: { $avg: "$cgpa" },
          latestUpdatedAt: { $max: "$updatedAt" },
        },
      },
      {
        $lookup: {
          from: "semester_cgpa",
          let: { sid: "$_id", lu: "$latestUpdatedAt" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$studentId", "$$sid"] },
                    { $eq: ["$updatedAt", "$$lu"] },
                  ],
                },
              },
            },
            { $project: { _id: 0, cgpa: 1 } },
          ],
          as: "latestRows",
        },
      },
      {
        $project: {
          overall: { $round: ["$overall", 2] },
          current: { $round: [{ $ifNull: [{ $arrayElemAt: ["$latestRows.cgpa", 0] }, 0] }, 2] },
        },
      },
    ]);

    const ranked = rankingRows
      .map((row) => ({
        studentId: String(row._id),
        overall: Number(row.overall || 0),
        current: Number(row.current || 0),
      }))
      .sort((a, b) => {
        if (b.overall !== a.overall) return b.overall - a.overall;
        return b.current - a.current;
      });

    const currentStudentRank = ranked.findIndex((item) => item.studentId === String(targetStudent._id)) + 1;
    const classSize = ranked.length || 0;

    const performanceSummary = {
      standing: overallCgpa >= 3.5 ? "Good" : overallCgpa >= 3 ? "Moderate" : "At Risk",
      overallCgpa,
      currentSemesterCgpa,
      avgAttendance,
      avgCtPercent,
      suggestion: overallCgpa < 3
        ? "Focus on weak courses and schedule regular advisor check-ins."
        : avgAttendance < 75
          ? "Improve class attendance consistency to stabilize performance."
          : "Performance is stable; maintain current effort and target stronger CT scores.",
    };

    return res.status(200).json({
      success: true,
      data: {
        student: {
          userId: targetStudent.userId ? String(targetStudent.userId._id) : "",
          studentId: targetStudent.studentId,
          name: targetStudent.userId && targetStudent.userId.name ? targetStudent.userId.name : "Student",
          batch: targetStudent.batch,
          department: targetStudent.department,
        },
        ranking: {
          rank: currentStudentRank > 0 ? currentStudentRank : classSize,
          classSize,
        },
        latestSemesterLabel,
        overallCgpa,
        currentSemesterCgpa,
        semesterCgpa: semesterItems,
        currentSemesterAttendance: attendanceItems,
        currentSemesterCtMarks: ctItems,
        performanceSummary,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Could not load advisor student report.", error: error.message });
  }
};

const getAdvisorPerformanceWatchlist = async (req, res) => {
  try {
    const ctx = await withContext(req);
    if (!ensureRole(res, ctx.user, ["advisor"])) return;

    const assignments = await AdvisorAssignment.find({ advisorName: ctx.user.name, status: "assigned" }).sort({ createdAt: -1 });
    if (!assignments.length) {
      return res.status(200).json({ success: true, data: { items: [] } });
    }

    const assignmentByBatch = {};
    assignments.forEach((assignment) => {
      const key = normalizeBatchValue(assignment.batch);
      if (!assignmentByBatch[key]) assignmentByBatch[key] = [];
      assignmentByBatch[key].push(assignment);
    });

    const students = await Student.find({}).populate("userId", "name");
    const assignedStudents = students.filter((student) => {
      const key = normalizeBatchValue(student.batch);
      const ranges = assignmentByBatch[key] || [];
      if (!ranges.length) return false;
      const comparable = toComparableStudentNumber(student);
      if (!Number.isFinite(comparable)) return false;
      return ranges.some((range) => comparable >= Number(range.startSerial || 0) && comparable <= Number(range.endSerial || 0));
    });

    if (!assignedStudents.length) {
      return res.status(200).json({ success: true, data: { items: [] } });
    }

    const studentIds = assignedStudents.map((student) => student._id);
    const semesterRows = await SemesterCgpa.find({ studentId: { $in: studentIds } }).sort({ updatedAt: -1 });
    const attendanceRows = await Attendance.find({ studentId: { $in: studentIds } }).sort({ updatedAt: -1 });
    const ctRows = await CtMark.find({ studentId: { $in: studentIds } }).sort({ updatedAt: -1 });

    const latestSemesterByStudent = new Map();
    const latestCgpaByStudent = new Map();
    const cgpaAggByStudent = new Map();

    semesterRows.forEach((row) => {
      const sid = String(row.studentId);
      const current = cgpaAggByStudent.get(sid) || { sum: 0, count: 0 };
      current.sum += Number(row.cgpa || 0);
      current.count += 1;
      cgpaAggByStudent.set(sid, current);

      if (!latestSemesterByStudent.has(sid)) {
        latestSemesterByStudent.set(sid, row.semesterLabel || "");
        latestCgpaByStudent.set(sid, Number(row.cgpa || 0));
      }
    });

    const attendanceAvgByStudentSemester = new Map();
    attendanceRows.forEach((row) => {
      const key = String(row.studentId) + "::" + String(row.semesterLabel || "");
      const current = attendanceAvgByStudentSemester.get(key) || { sum: 0, count: 0 };
      current.sum += Number(row.percentage || 0);
      current.count += 1;
      attendanceAvgByStudentSemester.set(key, current);
    });

    const ctAvgByStudentSemester = new Map();
    ctRows.forEach((row) => {
      const key = String(row.studentId) + "::" + String(row.semesterLabel || "");
      const maxMarks = Number(row.maxMarks || 0);
      if (!maxMarks) return;
      const percentage = (Number(row.total || 0) / maxMarks) * 100;
      const current = ctAvgByStudentSemester.get(key) || { sum: 0, count: 0 };
      current.sum += percentage;
      current.count += 1;
      ctAvgByStudentSemester.set(key, current);
    });

    const riskBucket = (value, thresholds) => {
      if (value <= thresholds.high) return "high";
      if (value <= thresholds.medium) return "medium";
      return "low";
    };

    const riskScore = (risk) => {
      if (risk === "high") return 3;
      if (risk === "medium") return 2;
      return 0;
    };

    const items = assignedStudents.map((student) => {
      const sid = String(student._id);
      const latestSemesterLabel = latestSemesterByStudent.get(sid) || "";
      const semKey = sid + "::" + latestSemesterLabel;

      const currentCgpa = Number(latestCgpaByStudent.get(sid) || 0);
      const cgpaAgg = cgpaAggByStudent.get(sid) || { sum: 0, count: 0 };
      const overallCgpa = cgpaAgg.count ? Number((cgpaAgg.sum / cgpaAgg.count).toFixed(2)) : 0;

      const attendanceAgg = attendanceAvgByStudentSemester.get(semKey) || { sum: 0, count: 0 };
      const attendancePercent = attendanceAgg.count ? Number((attendanceAgg.sum / attendanceAgg.count).toFixed(1)) : 0;

      const ctAgg = ctAvgByStudentSemester.get(semKey) || { sum: 0, count: 0 };
      const ctPercent = ctAgg.count ? Number((ctAgg.sum / ctAgg.count).toFixed(1)) : 0;

      const cgpaRisk = riskBucket(currentCgpa, { high: 2.5, medium: 3.0 });
      const attendanceRisk = riskBucket(attendancePercent, { high: 60, medium: 75 });
      const ctRisk = riskBucket(ctPercent, { high: 50, medium: 65 });
      const totalRiskScore = riskScore(cgpaRisk) + riskScore(attendanceRisk) + riskScore(ctRisk);

      return {
        userId: student.userId ? String(student.userId._id) : "",
        studentId: student.studentId,
        name: student.userId && student.userId.name ? student.userId.name : "Student",
        batch: normalizeBatchValue(student.batch),
        latestSemesterLabel,
        currentCgpa: Number(currentCgpa.toFixed(2)),
        overallCgpa,
        attendancePercent,
        ctPercent,
        cgpaRisk,
        attendanceRisk,
        ctRisk,
        riskScore: totalRiskScore,
      };
    }).filter((item) => item.riskScore >= 6)
      .sort((a, b) => {
        if (b.riskScore !== a.riskScore) return b.riskScore - a.riskScore;
        return a.currentCgpa - b.currentCgpa;
      });

    return res.status(200).json({ success: true, data: { items } });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Could not load performance watchlist.", error: error.message });
  }
};

const getMessages = async (req, res) => {
  try {
    const ctx = await withContext(req);
    if (!ctx.user) {
      return res.status(401).json({ success: false, message: "Unauthorized." });
    }

    const items = await Message.find({
      $or: [{ fromUserId: ctx.user._id }, { toUserId: ctx.user._id }],
    })
      .sort({ createdAt: -1 })
      .limit(100)
      .populate("fromUserId", "name role")
      .populate("toUserId", "name role");

    const mapped = items.map((item) => ({
      id: item._id,
      date: item.createdAt,
      from: item.fromRole,
      to: item.toRole,
      fromName: item.fromUserId ? item.fromUserId.name : "Unknown",
      toName: item.toUserId ? item.toUserId.name : "Unknown",
      subject: item.subject,
      message: item.content,
      status: item.status,
      channel: item.channel,
    }));

    return res.status(200).json({ success: true, data: { items: mapped } });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Could not load messages.", error: error.message });
  }
};

const sendMessage = async (req, res) => {
  try {
    const ctx = await withContext(req);
    if (!ctx.user) {
      return res.status(401).json({ success: false, message: "Unauthorized." });
    }

    const toRole = normalizeLower(req.body.toRole || (ctx.user.role === "student" ? "advisor" : "student"));
    const toUserId = normalize(req.body.toUserId);
    const toName = normalize(req.body.toName || req.body.studentName || req.body.advisorName || req.body.advisor || req.body.toStudent);
    const subject = normalize(req.body.subject);
    const content = normalize(req.body.content || req.body.message || req.body.sms);
    const channel = normalizeLower(req.body.channel || (ctx.user.role === "advisor" ? "sms" : "portal"));

    if (!subject || !content) {
      return res.status(400).json({ success: false, message: "subject and content are required." });
    }

    let targetUser = null;
    if (toUserId) {
      targetUser = await User.findOne({ _id: toUserId, role: toRole });
    }
    if (!targetUser && toName) {
      targetUser = await User.findOne({ role: toRole, name: toName });
    }
    if (!targetUser) {
      targetUser = await User.findOne({ role: toRole }).sort({ createdAt: 1 });
    }

    if (!targetUser) {
      return res.status(404).json({ success: false, message: `No ${toRole} account is available to receive this message.` });
    }

    const item = await Message.create({
      fromUserId: ctx.user._id,
      toUserId: targetUser._id,
      fromRole: ctx.user.role,
      toRole,
      channel: channel === "sms" ? "sms" : "portal",
      subject,
      content,
      status: "sent",
    });

    return res.status(201).json({
      success: true,
      message: "Message sent.",
      data: {
        id: item._id,
        date: item.createdAt,
        from: item.fromRole,
        to: item.toRole,
        subject: item.subject,
        message: item.content,
        status: item.status,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Could not send message.", error: error.message });
  }
};

module.exports = {
  getStudentCourses,
  addStudentCourse,
  getStudentAttendance,
  saveStudentAttendance,
  getStudentCtMarks,
  saveStudentCtMarks,
  getSemesterSetup,
  saveSemesterSetup,
  getSemesterCgpa,
  saveSemesterCgpa,
  getStudentCumulativeCgpa,
  getStudentRanking,
  getStudentAssignedAdvisor,
  getAdvisorStudentsByBatch,
  getAdvisorStudentReport,
  getAdvisorPerformanceWatchlist,
  getNotices,
  createNotice,
  getAdminAdvisors,
  getAdvisorAssignments,
  getAdminStudentsByBatch,
  createAdvisorAssignment,
  getMessages,
  sendMessage,
};
