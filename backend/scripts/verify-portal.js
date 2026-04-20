require("dotenv").config();

const app = require("../src/app");
const mongoose = require("mongoose");
const { connectDatabase } = require("../src/config/db");

const port = 5001;
const apiBase = "http://127.0.0.1:" + port + "/api";

async function request(path, method, body, token) {
  const res = await fetch(apiBase + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${method} ${path}: ${payload.message || res.status}`);
  }
  return payload;
}

async function login(role) {
  const suffix = Date.now();
  const email = `${role}_phase2_${suffix}@example.com`;
  const password = "Password123!";

  const base = {
    role,
    name: `${role} phase2`,
    email,
    password,
  };

  if (role === "student") {
    base.studentId = `STU-${suffix}`;
    base.batch = "61";
    base.department = "CSE";
  }

  if (role === "advisor") {
    base.advisorId = `ADV-${suffix}`;
    base.department = "CSE";
    base.batchFocus = "61";
  }

  await request("/auth/register", "POST", base);
  const loginResp = await request("/auth/login", "POST", { role, email, password });
  return loginResp.data.token;
}

async function run() {
  await connectDatabase();
  const server = app.listen(port);

  const studentToken = await login("student");
  const adminToken = await login("admin");
  const advisorToken = await login("advisor");

  await request("/portal/student/courses", "POST", {
    code: "CSE-999",
    name: "Applied Persistence",
    credit: 3,
    teacherName: "Dr. Persist",
    semester: "Spring 2026",
  }, studentToken);

  await request("/portal/student/semester-setup", "PUT", {
    semester: "Spring 2026",
    totalCredit: 15,
    targetCgpa: 3.75,
  }, studentToken);

  await request("/portal/student/semester-cgpa", "PUT", {
    semester: "Spring 2026",
    cgpa: 3.65,
    note: "Phase 2 verification",
  }, studentToken);

  await request("/portal/admin/notices", "POST", {
    title: "Phase2 Notice",
    target: "Students + Advisors",
    priority: "Important",
    content: "Backend-connected notice",
  }, adminToken);

  await request("/portal/admin/assignments", "POST", {
    batch: "Batch 61",
    teacher: "Mr. Ibrahim",
    startId: 1,
    endId: 10,
  }, adminToken);

  await request("/portal/messages", "POST", {
    toRole: "advisor",
    subject: "Phase2 Message",
    content: "Student to advisor message",
    channel: "portal",
  }, studentToken);

  await request("/portal/messages", "POST", {
    toRole: "student",
    subject: "Phase2 Reply",
    content: "Advisor to student SMS",
    channel: "sms",
  }, advisorToken);

  const courses = await request("/portal/student/courses", "GET", null, studentToken);
  const cgpa = await request("/portal/student/semester-cgpa", "GET", null, studentToken);
  const notices = await request("/portal/notices", "GET", null, studentToken);
  const assignments = await request("/portal/admin/assignments", "GET", null, adminToken);
  const messagesStudent = await request("/portal/messages", "GET", null, studentToken);

  console.log("PHASE2_VERIFY: studentCourses=" + (((courses.data || {}).items || []).length > 0));
  console.log("PHASE2_VERIFY: semesterCgpa=" + (((cgpa.data || {}).items || []).length > 0));
  console.log("PHASE2_VERIFY: notices=" + (((notices.data || {}).items || []).length > 0));
  console.log("PHASE2_VERIFY: assignments=" + (((assignments.data || {}).items || []).length > 0));
  console.log("PHASE2_VERIFY: messages=" + (((messagesStudent.data || {}).items || []).length > 0));

  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
}

run().catch((error) => {
  console.error("PHASE2_VERIFY_ERROR:", error.message);
  mongoose.disconnect().catch(() => {
    // ignore disconnect errors
  });
  process.exit(1);
});
