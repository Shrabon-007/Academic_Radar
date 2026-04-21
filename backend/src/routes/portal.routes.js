const express = require("express");

const { authGuard } = require("../middleware/auth.middleware");
const {
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
} = require("../controllers/portal.controller");

const router = express.Router();

router.use(authGuard);

router.get("/student/courses", getStudentCourses);
router.post("/student/courses", addStudentCourse);

router.get("/student/attendance", getStudentAttendance);
router.put("/student/attendance", saveStudentAttendance);

router.get("/student/ct-marks", getStudentCtMarks);
router.put("/student/ct-marks", saveStudentCtMarks);

router.get("/student/semester-setup", getSemesterSetup);
router.put("/student/semester-setup", saveSemesterSetup);

router.get("/student/semester-cgpa", getSemesterCgpa);
router.put("/student/semester-cgpa", saveSemesterCgpa);
router.get("/student/cumulative-cgpa", getStudentCumulativeCgpa);
router.get("/student/ranking", getStudentRanking);

router.get("/notices", getNotices);
router.post("/admin/notices", createNotice);

router.get("/admin/assignments", getAdvisorAssignments);
router.post("/admin/assignments", createAdvisorAssignment);

router.get("/messages", getMessages);
router.post("/messages", sendMessage);

module.exports = router;
