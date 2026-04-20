const mongoose = require("mongoose");

const User = require("../src/models/user.model");
const Admin = require("../src/models/admin.model");
const Advisor = require("../src/models/advisor.model");
const Student = require("../src/models/student.model");

const apiBase = "http://127.0.0.1:5000/api/auth";
const mongoUri = "mongodb://127.0.0.1:27017/academicradar";

async function request(path, method, body, token) {
  const response = await fetch(apiBase + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${method} ${path} failed: ${payload.message || response.status}`);
  }

  return payload;
}

async function run() {
  const suffix = Date.now();

  const adminEmail = `admin_${suffix}@example.com`;
  const advisorEmail = `advisor_${suffix}@example.com`;
  const studentEmail = `student_${suffix}@example.com`;

  const adminPassword = "Password123!";
  const advisorPassword = "Password123!";
  const studentPassword = "Password123!";

  const advisorId = `ADV-${suffix}`;
  const studentId = `STU-${suffix}`;

  await request("/register", "POST", {
    role: "admin",
    name: "Admin Verify",
    email: adminEmail,
    password: adminPassword,
  });

  await request("/register", "POST", {
    role: "advisor",
    name: "Advisor Verify",
    email: advisorEmail,
    password: advisorPassword,
    advisorId,
    department: "CSE",
    batchFocus: "61",
  });

  await request("/register", "POST", {
    role: "student",
    name: "Student Verify",
    email: studentEmail,
    password: studentPassword,
    studentId,
    batch: "61",
    department: "CSE",
  });

  const adminLogin = await request("/login", "POST", {
    role: "admin",
    email: adminEmail,
    password: adminPassword,
  });

  const advisorLogin = await request("/login", "POST", {
    role: "advisor",
    email: advisorEmail,
    password: advisorPassword,
  });

  const studentLogin = await request("/login", "POST", {
    role: "student",
    email: studentEmail,
    password: studentPassword,
  });

  const adminToken = adminLogin.data.token;
  const advisorToken = advisorLogin.data.token;
  const studentToken = studentLogin.data.token;

  const adminMe = await request("/me", "GET", null, adminToken);
  const advisorMe = await request("/me", "GET", null, advisorToken);
  const studentMe = await request("/me", "GET", null, studentToken);

  await mongoose.connect(mongoUri);

  const adminUser = await User.findOne({ email: adminEmail });
  const advisorUser = await User.findOne({ email: advisorEmail });
  const studentUser = await User.findOne({ email: studentEmail });

  const adminDoc = adminUser ? await Admin.findOne({ userId: adminUser._id }) : null;
  const advisorDoc = advisorUser ? await Advisor.findOne({ userId: advisorUser._id }) : null;
  const studentDoc = studentUser ? await Student.findOne({ userId: studentUser._id }) : null;

  console.log("VERIFY: REGISTER+LOGIN+ME OK for admin/advisor/student");
  console.log(`VERIFY: ADMIN user=${!!adminUser} adminDoc=${!!adminDoc}`);
  console.log(`VERIFY: ADVISOR user=${!!advisorUser} advisorDoc=${!!advisorDoc} advisorId=${advisorDoc ? advisorDoc.advisorId : "-"}`);
  console.log(`VERIFY: STUDENT user=${!!studentUser} studentDoc=${!!studentDoc} studentId=${studentDoc ? studentDoc.studentId : "-"}`);
  console.log(`VERIFY: ME adminRole=${adminMe.data.user.role} advisorRole=${advisorMe.data.user.role} studentRole=${studentMe.data.user.role}`);
  console.log(`VERIFY: LOGIN_PROFILE studentId=${studentLogin.data.profile ? studentLogin.data.profile.studentId : "-"} batch=${studentLogin.data.profile ? studentLogin.data.profile.batch : "-"} department=${studentLogin.data.profile ? studentLogin.data.profile.department : "-"}`);

  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error("VERIFY_ERROR:", error.message);
  try {
    await mongoose.disconnect();
  } catch (err) {
    // ignore
  }
  process.exit(1);
});
