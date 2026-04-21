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

    if (!batch || !advisorName || !startSerial || !endSerial || endSerial < startSerial) {
      return res.status(400).json({ success: false, message: "Invalid assignment payload." });
    }

    const advisorUser = await User.findOne({ role: "advisor", name: advisorName });
    let advisorId = null;
    if (advisorUser) {
      const advisorProfile = await Advisor.findOne({ userId: advisorUser._id });
      advisorId = advisorProfile ? advisorProfile._id : null;
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
    const toName = normalize(req.body.toName || req.body.studentName || req.body.advisorName || req.body.advisor || req.body.toStudent);
    const subject = normalize(req.body.subject);
    const content = normalize(req.body.content || req.body.message || req.body.sms);
    const channel = normalizeLower(req.body.channel || (ctx.user.role === "advisor" ? "sms" : "portal"));

    if (!subject || !content) {
      return res.status(400).json({ success: false, message: "subject and content are required." });
    }

    let targetUser = null;
    if (toName) {
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
      status: ctx.user.role === "student" ? "pending" : "sent",
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
  getNotices,
  createNotice,
  getAdvisorAssignments,
  createAdvisorAssignment,
  getMessages,
  sendMessage,
};
