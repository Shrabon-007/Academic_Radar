(function () {
  var API_BASE = "http://localhost:5000/api";

  var STORAGE_KEYS = {
    session: "ar_session_v1",
    attendance: "ar_attendance_v1",
    ctMarks: "ar_ct_marks_v1",
    courses: "ar_courses_v1",
    semesterSetup: "ar_semester_setup_v1",
    semesterCgpa: "ar_semester_cgpa_v1",
    notices: "ar_notices_v1",
    assignments: "ar_advisor_assignments_v1",
    messages: "ar_messages_v1"
  };

  var protectedPageRoleMap = {
    "admin-dashboard.html": "admin",
    "admin-assign-advisor.html": "admin",
    "admin-notices.html": "admin",
    "advisor-dashboard.html": "advisor",
    "advisor-student-ranking.html": "advisor",
    "advisor-student-profile.html": "advisor",
    "advisor-danger-zone.html": "advisor",
    "advisor-messages.html": "advisor",
    "student-dashboard.html": "student",
    "student-courses.html": "student",
    "student-attendance.html": "student",
    "student-ct-marks.html": "student",
    "student-semester-cgpa.html": "student",
    "student-running-semester-cgpa.html": "student",
    "student-cumulative-cgpa.html": "student",
    "student-message-advisor.html": "student"
  };

  var SEMESTER_LABELS = [
    "Level-1 Term-1",
    "Level-1 Term-2",
    "Level-2 Term-1",
    "Level-2 Term-2",
    "Level-3 Term-1",
    "Level-3 Term-2",
    "Level-4 Term-1",
    "Level-4 Term-2"
  ];

  function safeRead(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (err) {
      return fallback;
    }
  }

  function safeWrite(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function clearSession() {
    localStorage.removeItem(STORAGE_KEYS.session);
  }

  function getSession() {
    return safeRead(STORAGE_KEYS.session, null);
  }

  function apiRequest(path, options) {
    var session = getSession();
    var opts = options || {};
    var method = opts.method || "GET";
    var body = opts.body;
    var headers = {
      "Content-Type": "application/json"
    };

    if (session && session.token) {
      headers.Authorization = "Bearer " + session.token;
    }

    return fetch(API_BASE + path, {
      method: method,
      headers: headers,
      body: body ? JSON.stringify(body) : undefined
    }).then(function (response) {
      return response.json().catch(function () {
        return {};
      }).then(function (payload) {
        if (!response.ok) {
          throw new Error((payload && payload.message) || "Request failed.");
        }
        return payload;
      });
    });
  }

  function getCurrentPageName() {
    return window.location.pathname.split("/").pop() || "login.html";
  }

  function toRoleLabel(role) {
    if (role === "admin") return "Admin";
    if (role === "advisor") return "Advisor";
    if (role === "student") return "Student";
    return "User";
  }

  function getInitials(name) {
    var parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "U";
    var initials = parts.slice(0, 2).map(function (part) {
      return part.charAt(0).toUpperCase();
    }).join("");
    return initials || "U";
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function parseTokenExpiry(token) {
    try {
      var encodedPayload = String(token || "").split(".")[1] || "";
      if (!encodedPayload) return null;

      var normalized = encodedPayload.replace(/-/g, "+").replace(/_/g, "/");
      var padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
      var payload = JSON.parse(atob(padded));
      return Number(payload.exp || 0);
    } catch (err) {
      return null;
    }
  }

  function hasSessionExpired(session) {
    if (!session || !session.token) return true;
    var exp = parseTokenExpiry(session.token);
    if (!exp) return false;
    return Date.now() >= exp * 1000;
  }

  function profileSummary(session) {
    var role = String(session.role || "").toLowerCase();
    var profile = session.profile || {};

    if (role === "student") {
      var studentParts = [];
      if (profile.studentId) studentParts.push("ID " + profile.studentId);
      if (profile.batch) studentParts.push("Batch " + profile.batch);
      if (profile.department) studentParts.push(profile.department);
      return studentParts.length ? studentParts.join(" | ") : "Student Profile";
    }

    if (role === "advisor") {
      var advisorParts = [];
      if (profile.advisorId) advisorParts.push("ID " + profile.advisorId);
      if (profile.batchFocus) advisorParts.push("Batch " + profile.batchFocus);
      if (profile.department) advisorParts.push(profile.department);
      return advisorParts.length ? advisorParts.join(" | ") : "Advisor Profile";
    }

    if (role === "admin") {
      var adminId = profile._id || session.userId || "";
      if (adminId) {
        return "Admin ID " + String(adminId).slice(-8).toUpperCase();
      }
      return "System Administrator";
    }

    return "User Profile";
  }

  function hydrateUserUi(session) {
    if (!session) return;

    var safeName = escapeHtml(session.name || "User");
    var role = String(session.role || "").toLowerCase();
    var roleLabel = toRoleLabel(role);
    var profile = session.profile || {};

    var userText = document.querySelector(".user-info-text span");
    if (userText) {
      userText.innerHTML = safeName + " <span class='role-badge'>" + roleLabel + "</span>";
    }

    var avatarSm = document.querySelector(".avatar-sm");
    if (avatarSm) {
      avatarSm.textContent = getInitials(session.name);
    }

    var avatarLg = document.querySelector(".avatar-lg");
    if (avatarLg) {
      avatarLg.textContent = getInitials(session.name);
    }

    var profileTitle = document.querySelector(".profile-header-wrap h2");
    if (profileTitle) {
      profileTitle.textContent = session.name || roleLabel + " User";
    }

    var profileMeta = document.querySelector(".profile-header-wrap p");
    if (profileMeta) {
      profileMeta.textContent = profileSummary(session);
    }
  }

  function ensureProtectedPageAccess() {
    var page = getCurrentPageName();
    var requiredRole = protectedPageRoleMap[page];
    if (!requiredRole) {
      return;
    }

    var session = safeRead(STORAGE_KEYS.session, null);

    if (!session || !session.token) {
      window.location.href = "login.html?role=" + encodeURIComponent(requiredRole);
      return;
    }

    if (hasSessionExpired(session)) {
      clearSession();
      window.location.href = "login.html?role=" + encodeURIComponent(requiredRole);
      return;
    }

    if (String(session.role || "").toLowerCase() !== requiredRole) {
      clearSession();
      window.location.href = "login.html?role=" + encodeURIComponent(requiredRole);
      return;
    }

    hydrateUserUi(session);

    fetch(API_BASE + "/auth/me", {
      method: "GET",
      headers: {
        Authorization: "Bearer " + session.token
      }
    }).then(function (response) {
      if (!response.ok) {
        throw new Error("Session is invalid");
      }

      return response.json();
    }).then(function (payload) {
      var data = payload && payload.data ? payload.data : {};
      var user = data.user || {};
      var profile = data.profile || null;

      var refreshedSession = {
        token: session.token,
        userId: user._id || user.id || session.userId || "",
        role: user.role || session.role,
        name: user.name || session.name,
        email: user.email || session.email,
        profile: profile,
        loginAt: session.loginAt || new Date().toISOString()
      };

      safeWrite(STORAGE_KEYS.session, refreshedSession);
      hydrateUserUi(refreshedSession);
    }).catch(function () {
      clearSession();
      window.location.href = "login.html?role=" + encodeURIComponent(requiredRole);
    });
  }

  function formatDate(input) {
    var dateObj = input ? new Date(input) : new Date();
    if (isNaN(dateObj.getTime())) {
      dateObj = new Date();
    }
    return dateObj.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    });
  }

  function showToast(message) {
    var old = document.querySelector(".ar-toast");
    if (old) {
      old.remove();
    }

    var toast = document.createElement("div");
    toast.className = "ar-toast";
    toast.textContent = message;
    toast.style.position = "fixed";
    toast.style.right = "20px";
    toast.style.bottom = "20px";
    toast.style.zIndex = "9999";
    toast.style.padding = "10px 14px";
    toast.style.background = "#0b1220";
    toast.style.color = "#fff";
    toast.style.borderRadius = "10px";
    toast.style.boxShadow = "0 8px 24px rgba(0, 0, 0, 0.22)";
    toast.style.fontSize = "14px";
    document.body.appendChild(toast);

    setTimeout(function () {
      toast.remove();
    }, 2200);
  }

  function setActiveNav() {
    var current = window.location.pathname.split("/").pop() || "index.html";
    document.querySelectorAll(".nav-link").forEach(function (link) {
      var href = link.getAttribute("href") || "";
      if (href === current) {
        link.classList.add("active");
      }
    });
  }

  function bindLogoutConfirm() {
    document.querySelectorAll(".logout-link").forEach(function (link) {
      link.addEventListener("click", function (event) {
        var ok = window.confirm("Do you want to log out?");
        if (!ok) {
          event.preventDefault();
          return;
        }

        clearSession();
      });
    });
  }

  function ensureSemesterOptions(selectEl) {
    if (!selectEl) return;
    var current = selectEl.value;
    selectEl.innerHTML = "";

    SEMESTER_LABELS.forEach(function (label) {
      var option = document.createElement("option");
      option.value = label;
      option.textContent = label;
      selectEl.appendChild(option);
    });

    if (current && SEMESTER_LABELS.indexOf(current) >= 0) {
      selectEl.value = current;
    }
  }

  function getCtPolicy(courseType, credit) {
    var type = String(courseType || "theory").toLowerCase();
    var value = Number(credit || 0);

    if (type === "lab") {
      return { totalCt: 0, bestCount: 0, maxMarks: 0, label: "No CT (Lab)" };
    }

    if (value >= 4) {
      return { totalCt: 5, bestCount: 4, maxMarks: 80, label: "5 CT, best 4 (80)" };
    }

    if (value >= 3) {
      return { totalCt: 4, bestCount: 3, maxMarks: 60, label: "4 CT, best 3 (60)" };
    }

    if (value >= 2) {
      return { totalCt: 3, bestCount: 2, maxMarks: 40, label: "3 CT, best 2 (40)" };
    }

    return { totalCt: 0, bestCount: 0, maxMarks: 0, label: "No CT" };
  }

  function getAttendanceMaxMark(credit, courseType) {
    var type = String(courseType || "theory").toLowerCase();
    var value = Number(credit || 0);

    if (type === "lab") {
      return Math.round(value * 10);
    }

    if (value >= 4) return 40;
    if (value >= 3) return 30;
    if (value >= 2) return 20;
    return Math.round(value * 10);
  }

  function getAttendanceMark(percentage, credit, courseType) {
    var maxMark = getAttendanceMaxMark(credit, courseType);

    if (percentage >= 90) return Math.round(maxMark * 1.0);
    if (percentage >= 85) return Math.round(maxMark * 0.9);
    if (percentage >= 80) return Math.round(maxMark * 0.8);
    if (percentage >= 75) return Math.round(maxMark * 0.7);
    if (percentage >= 70) return Math.round(maxMark * 0.6);
    if (percentage >= 65) return Math.round(maxMark * 0.5);
    if (percentage >= 60) return Math.round(maxMark * 0.4);
    return 0;
  }

  function initAttendancePage() {
    if (!/student-attendance\.html$/i.test(window.location.pathname)) {
      return;
    }

    var summaryBody = document.querySelector("section.card .table-wrap table tbody");
    var gridHead = document.querySelector("table.attendance-grid thead tr");
    var gridBody = document.querySelector("table.attendance-grid tbody");
    if (!summaryBody || !gridHead || !gridBody) return;

    function normalizeCourses(items) {
      return (items || []).map(function (item) {
        var course = item.course || item;
        return {
          code: String(course.code || "").trim().toUpperCase(),
          name: course.name || "Course",
          credit: Number(course.credit || 3),
          courseType: String(course.courseType || "theory").toLowerCase(),
          semesterLabel: String(item.semesterLabel || course.semesterLabel || item.semester || course.semester || "Level-1 Term-1")
        };
      }).filter(function (c) { return c.code; });
    }

    function makeCourseKey(semesterLabel, code) {
      return String(semesterLabel || "") + "__" + String(code || "").toUpperCase();
    }

    function getCourseList() {
      return apiRequest("/portal/student/courses", { method: "GET" }).then(function (payload) {
        var items = (((payload || {}).data || {}).items) || [];
        return normalizeCourses(items);
      }).catch(function () {
        return normalizeCourses(safeRead(STORAGE_KEYS.courses, []));
      });
    }

    function getAttendanceMap() {
      return apiRequest("/portal/student/attendance", { method: "GET" }).then(function (payload) {
        var rows = (((payload || {}).data || {}).items) || [];
        var map = {};
        rows.forEach(function (row) {
          var course = row.course || {};
          var key = makeCourseKey(row.semesterLabel, course.code);
          if (!course.code) return;
          map[key] = Array.isArray(row.classStates) ? row.classStates : [];
        });
        return map;
      }).catch(function () {
        return {};
      });
    }

    function getRisk(percent) {
      if (percent >= 90) return { text: "Good", cls: "badge-success" };
      if (percent >= 75) return { text: "Watch", cls: "badge-warning" };
      if (percent >= 60) return { text: "Low", cls: "badge-warning" };
      return { text: "Critical", cls: "badge-danger" };
    }

    function getCourseCredit(row) {
      return Number((row && row.getAttribute("data-credit")) || 3);
    }

    function getCourseType(row) {
      return String((row && row.getAttribute("data-course-type")) || "theory");
    }

    function buildAttendanceTables(courses) {
      var useCourses = (courses && courses.length) ? courses : [
        { code: "MAT-223", credit: 3, courseType: "theory" },
        { code: "CSE-332", credit: 3, courseType: "theory" },
        { code: "EEE-343", credit: 3, courseType: "theory" }
      ];

      summaryBody.innerHTML = "";
      useCourses.forEach(function (course) {
        var row = document.createElement("tr");
        row.setAttribute("data-summary-course", course.code);
        row.setAttribute("data-credit", String(course.credit));
        row.setAttribute("data-course-type", course.courseType);
        row.setAttribute("data-semester-label", course.semesterLabel);
        row.innerHTML = "<td>" + course.code + "</td>" +
          "<td>0</td>" +
          "<td class='attended-cell'>0</td>" +
          "<td class='percent-cell'>0%</td>" +
          "<td class='mark-cell'>0 / " + getAttendanceMaxMark(course.credit, course.courseType) + "</td>" +
          "<td><span class='badge risk-badge badge-danger'>Critical</span></td>";
        summaryBody.appendChild(row);
      });

      gridHead.innerHTML = "";
      var dayHeader = document.createElement("th");
      dayHeader.textContent = "Class Day";
      gridHead.appendChild(dayHeader);
      useCourses.forEach(function (course) {
        var th = document.createElement("th");
        th.textContent = course.code;
        gridHead.appendChild(th);
      });

      gridBody.innerHTML = "";
      for (var day = 1; day <= 39; day++) {
        var dayRow = document.createElement("tr");
        dayRow.setAttribute("data-day", String(day));
        var dayCell = document.createElement("td");
        dayCell.textContent = "Class " + day;
        dayRow.appendChild(dayCell);

        useCourses.forEach(function (course) {
          var td = document.createElement("td");
          td.innerHTML = "<select class='att-state' data-course='" + course.code + "' data-semester-label='" + escapeHtml(course.semesterLabel) + "'><option value=''>-</option><option value='P'>P</option><option value='A'>A</option></select>";
          dayRow.appendChild(td);
        });

        gridBody.appendChild(dayRow);
      }

      return useCourses;
    }

    function readStatesForCourse(course) {
      var query = 'select.att-state[data-course="' + course.code + '"][data-semester-label="' + course.semesterLabel + '"]';
      return Array.from(document.querySelectorAll(query)).map(function (el) {
        return el.value || "-";
      });
    }

    function updateCourseSummary(courseCode, semesterLabel) {
      var courseSelects = document.querySelectorAll('select.att-state[data-course="' + courseCode + '"][data-semester-label="' + semesterLabel + '"]');
      var row = document.querySelector('tr[data-summary-course="' + courseCode + '"][data-semester-label="' + semesterLabel + '"]');
      if (!row) return;

      var present = Array.from(courseSelects).filter(function (el) {
        return el.value === "P";
      }).length;
      var absent = Array.from(courseSelects).filter(function (el) {
        return el.value === "A";
      }).length;
      var held = present + absent;
      var percent = held === 0 ? 0 : Math.round((present / held) * 100);
      var mark = getAttendanceMark(percent, getCourseCredit(row), getCourseType(row));
      var risk = getRisk(percent);
      var maxMark = getAttendanceMaxMark(getCourseCredit(row), getCourseType(row));

      row.children[1].textContent = String(held);
      row.querySelector(".attended-cell").textContent = String(present);
      row.querySelector(".percent-cell").textContent = percent + "%";
      row.querySelector(".mark-cell").textContent = String(mark) + " / " + String(maxMark);

      var badge = row.querySelector(".risk-badge");
      if (badge) {
        badge.className = "badge risk-badge " + risk.cls;
        badge.textContent = risk.text;
      }
    }

    function updateOverall() {
      var percentCells = document.querySelectorAll(".percent-cell");
      if (!percentCells.length) return;

      var total = 0;
      percentCells.forEach(function (cell) {
        total += Number(String(cell.textContent).replace("%", "")) || 0;
      });
      var average = Math.round(total / percentCells.length);
      var bar = document.getElementById("overallAttendanceBar");
      var text = document.getElementById("overallAttendanceText");

      if (bar) {
        bar.style.width = average + "%";
      }
      if (text) {
        text.textContent = average + "% Average Attendance";
      }
    }

    Promise.all([getCourseList(), getAttendanceMap()]).then(function (resolved) {
      var courses = resolved[0] || [];
      var attendanceMap = resolved[1] || {};
      var courseList = buildAttendanceTables(courses);
      var selectors = document.querySelectorAll("select.att-state[data-course]");
      var stored = safeRead(STORAGE_KEYS.attendance, {});
      var legacyStored = Array.isArray(stored) ? stored : null;

      selectors.forEach(function (select, index) {
        var code = select.getAttribute("data-course");
        var semesterLabel = select.getAttribute("data-semester-label") || "Level-1 Term-1";
        var key = makeCourseKey(semesterLabel, code);
        var dayRow = select.closest("tr[data-day]");
        var dayIndex = dayRow ? Number(dayRow.getAttribute("data-day") || 1) - 1 : 0;

        if (attendanceMap[key] && attendanceMap[key][dayIndex] !== undefined) {
          select.value = attendanceMap[key][dayIndex] || "";
          return;
        }

        if (!legacyStored && stored[key] && stored[key][dayIndex] !== undefined) {
          select.value = stored[key][dayIndex] || "";
          return;
        }

        if (legacyStored && legacyStored[index] !== undefined) {
          select.value = legacyStored[index] || "";
        }
      });

      function runAll() {
        courseList.forEach(function (course) {
          updateCourseSummary(course.code, course.semesterLabel);
        });
        updateOverall();
        var values = {};
        courseList.forEach(function (course) {
          values[makeCourseKey(course.semesterLabel, course.code)] = readStatesForCourse(course);
        });
        safeWrite(STORAGE_KEYS.attendance, values);
      }

      selectors.forEach(function (select) {
        select.addEventListener("change", runAll);
      });

      document.querySelectorAll("button").forEach(function (btn) {
        if (/save attendance summary|save daily checklist/i.test(btn.textContent || "")) {
          btn.addEventListener("click", function () {
            runAll();
            Promise.all(courseList.map(function (course) {
              return apiRequest("/portal/student/attendance", {
                method: "PUT",
                body: {
                  semesterLabel: course.semesterLabel,
                  courseCode: course.code,
                  classStates: readStatesForCourse(course)
                }
              });
            })).then(function () {
              showToast("Attendance saved to database.");
            }).catch(function (error) {
              showToast(error.message || "Attendance saved locally only.");
            });
          });
        }
      });

      runAll();
    });
  }

  function initCtMarksPage() {
    if (!/student-ct-marks\.html$/i.test(window.location.pathname)) {
      return;
    }

    var tableBody = document.querySelector("section.card .table-wrap table tbody");
    if (!tableBody) return;

    function normalizeCourses(items) {
      return (items || []).map(function (item) {
        var course = item.course || item;
        return {
          code: String(course.code || "").trim().toUpperCase(),
          name: course.name || "Course",
          credit: Number(course.credit || 3),
          courseType: String(course.courseType || "theory").toLowerCase(),
          semesterLabel: String(item.semesterLabel || course.semesterLabel || item.semester || course.semester || "Level-1 Term-1")
        };
      }).filter(function (c) { return c.code; });
    }

    function makeCourseKey(semesterLabel, code) {
      return String(semesterLabel || "") + "__" + String(code || "").toUpperCase();
    }

    function getCourseList() {
      return apiRequest("/portal/student/courses", { method: "GET" }).then(function (payload) {
        var items = (((payload || {}).data || {}).items) || [];
        return normalizeCourses(items);
      }).catch(function () {
        return normalizeCourses(safeRead(STORAGE_KEYS.courses, []));
      });
    }

    function getCtMap() {
      return apiRequest("/portal/student/ct-marks", { method: "GET" }).then(function (payload) {
        var rows = (((payload || {}).data || {}).items) || [];
        var map = {};
        rows.forEach(function (row) {
          var course = row.course || {};
          if (!course.code) return;
          map[makeCourseKey(row.semesterLabel, course.code)] = Array.isArray(row.ct) ? row.ct : [];
        });
        return map;
      }).catch(function () {
        return {};
      });
    }

    function buildCtRows(courses) {
      var useCourses = (courses && courses.length) ? courses : [
        { code: "CSE-321", credit: 4, courseType: "theory" },
        { code: "CSE-331", credit: 3, courseType: "theory" },
        { code: "MAT-223", credit: 3, courseType: "theory" }
      ];

      tableBody.innerHTML = "";
      useCourses.forEach(function (course) {
        var policy = getCtPolicy(course.courseType, course.credit);
        var row = document.createElement("tr");
        row.setAttribute("data-course-type", course.courseType);
        row.setAttribute("data-credit", String(course.credit));
        row.setAttribute("data-course-code", course.code);
        row.setAttribute("data-semester-label", course.semesterLabel);
        row.innerHTML = "<td>" + course.code + "</td>" +
          "<td>" + (course.courseType === "lab" ? "Lab" : "Theory") + "</td>" +
          "<td>" + course.credit.toFixed(2).replace(/\.00$/, ".0") + "</td>" +
          "<td><input type='number' value='0'></td>" +
          "<td><input type='number' value='0'></td>" +
          "<td><input type='number' value='0'></td>" +
          "<td><input type='number' value='0'></td>" +
          "<td><input type='number' value='0'></td>" +
          "<td>" + policy.label + "</td>" +
          "<td>0 / " + policy.maxMarks + "</td>" +
          "<td><span class='badge badge-warning'>Average</span></td>";
        tableBody.appendChild(row);
      });
    }

    function getRows() {
      return tableBody.querySelectorAll("tr");
    }

    function policyFromRow(row) {
      var type = String(row.getAttribute("data-course-type") || "theory");
      var credit = Number(row.getAttribute("data-credit") || 3);
      return getCtPolicy(type, credit);
    }

    function getPerformance(earned, maximum) {
      if (!maximum) return { text: "N/A", cls: "badge-warning" };
      var ratio = earned / maximum;
      if (ratio >= 0.8) return { text: "Strong", cls: "badge-success" };
      if (ratio >= 0.6) return { text: "Average", cls: "badge-warning" };
      return { text: "Low", cls: "badge-danger" };
    }

    function configureInputsForPolicy(row, policy) {
      var inputs = row.querySelectorAll("input[type='number']");
      inputs.forEach(function (input, idx) {
        var active = idx < policy.totalCt;
        input.disabled = !active;
        if (!active) {
          input.value = "0";
          input.style.opacity = "0.45";
        } else {
          input.style.opacity = "1";
        }
      });
    }

    function computeBest(values, bestCount) {
      var sorted = values.slice().sort(function (a, b) { return b - a; });
      return sorted.slice(0, bestCount).reduce(function (acc, value) { return acc + value; }, 0);
    }

    function recompute() {
      var rowsComputed = [];

      Array.from(getRows()).forEach(function (row) {
        var policy = policyFromRow(row);
        configureInputsForPolicy(row, policy);

        var inputs = Array.from(row.querySelectorAll("input[type='number']"));
        var activeInputs = inputs.slice(0, policy.totalCt);
        var values = activeInputs.map(function (input) {
          var val = Number(input.value) || 0;
          if (val < 0) val = 0;
          if (val > 20) val = 20;
          input.value = String(val);
          return val;
        });

        var total = computeBest(values, policy.bestCount);
        var policyCell = row.children[8];
        var totalCell = row.children[9];
        var badge = row.querySelector("td:last-child .badge");

        if (policyCell) policyCell.textContent = policy.label;
        if (totalCell) totalCell.textContent = String(total) + " / " + String(policy.maxMarks);
        if (badge) {
          var perf = getPerformance(total, policy.maxMarks);
          badge.className = "badge " + perf.cls;
          badge.textContent = perf.text;
        }

        rowsComputed.push({
          course: row.children[0].textContent.trim(),
          total: total,
          max: policy.maxMarks
        });
      });

      if (!rowsComputed.length) return;

      var ratios = rowsComputed.filter(function (x) { return x.max > 0; }).map(function (x) {
        return (x.total / x.max) * 100;
      });
      var average = ratios.length ? Math.round(ratios.reduce(function (a, b) { return a + b; }, 0) / ratios.length) : 0;

      var avgStrong = document.querySelectorAll(".stats strong")[0];
      if (avgStrong) {
        avgStrong.textContent = String(average) + "%";
      }

      var best = rowsComputed.slice().sort(function (a, b) {
        var ra = a.max ? a.total / a.max : 0;
        var rb = b.max ? b.total / b.max : 0;
        return rb - ra;
      })[0];

      var low = rowsComputed.slice().sort(function (a, b) {
        var ra = a.max ? a.total / a.max : 0;
        var rb = b.max ? b.total / b.max : 0;
        return ra - rb;
      })[0];

      var statStrongEls = document.querySelectorAll(".grid.grid-3 .stats strong");
      if (statStrongEls[1] && best) {
        statStrongEls[1].textContent = best.course;
      }
      if (statStrongEls[2] && low) {
        statStrongEls[2].textContent = low.course;
      }

      var ctStore = {};
      Array.from(getRows()).forEach(function (row) {
        var code = row.getAttribute("data-course-code") || row.children[0].textContent.trim();
        var semesterLabel = row.getAttribute("data-semester-label") || "Level-1 Term-1";
        ctStore[makeCourseKey(semesterLabel, code)] = Array.from(row.querySelectorAll("input[type='number']")).map(function (input) {
          return Number(input.value) || 0;
        });
      });
      safeWrite(STORAGE_KEYS.ctMarks, ctStore);
    }

    function bindCtEvents() {
      Array.from(getRows()).forEach(function (row) {
        row.querySelectorAll("input[type='number']").forEach(function (input) {
          input.addEventListener("input", recompute);
        });
      });

      document.querySelectorAll("button").forEach(function (btn) {
        if (/save ct marks/i.test(btn.textContent || "")) {
          btn.addEventListener("click", function () {
            recompute();
            var rows = Array.from(getRows());
            Promise.all(rows.map(function (row) {
              var code = row.getAttribute("data-course-code") || row.children[0].textContent.trim();
              var semesterLabel = row.getAttribute("data-semester-label") || "Level-1 Term-1";
              var ct = Array.from(row.querySelectorAll("input[type='number']")).map(function (input) {
                return Number(input.value) || 0;
              });

              return apiRequest("/portal/student/ct-marks", {
                method: "PUT",
                body: {
                  semesterLabel: semesterLabel,
                  courseCode: code,
                  ct: ct
                }
              });
            })).then(function () {
              showToast("CT marks saved to database.");
            }).catch(function (error) {
              showToast(error.message || "CT marks saved locally only.");
            });
          });
        }
      });
    }

    Promise.all([getCourseList(), getCtMap()]).then(function (resolved) {
      var courses = resolved[0] || [];
      var ctMap = resolved[1] || {};
      buildCtRows(courses);

      var saved = safeRead(STORAGE_KEYS.ctMarks, {});
      var legacySaved = Array.isArray(saved) ? {} : saved;
      Array.from(getRows()).forEach(function (row) {
        var code = row.getAttribute("data-course-code") || row.children[0].textContent.trim();
        var semesterLabel = row.getAttribute("data-semester-label") || "Level-1 Term-1";
        var key = makeCourseKey(semesterLabel, code);
        var values = ctMap[key] || legacySaved[key] || saved[code] || [];
        row.querySelectorAll("input[type='number']").forEach(function (input, idx) {
          if (values[idx] !== undefined) {
            input.value = String(values[idx]);
          }
        });
      });

      bindCtEvents();
      recompute();
    });
  }

  function initStudentCoursesPage() {
    if (!/student-courses\.html$/i.test(window.location.pathname)) {
      return;
    }

    var forms = document.querySelectorAll("form");
    if (forms.length < 2) return;

    var addCourseForm = forms[0];
    var setupForm = forms[1];
    var tableBody = document.querySelector(".card table tbody");
    var semesterEl = document.getElementById("semester");
    var totalCreditEl = document.getElementById("totalCredit");
    var targetCgpaEl = document.getElementById("targetCgpa");
    var courseTypeEl = document.getElementById("courseType");

    ensureSemesterOptions(semesterEl);

    function syncCreditOptionsByType() {
      if (!courseTypeEl) return;
      var creditEl = document.getElementById("credit");
      if (!creditEl) return;

      var type = courseTypeEl.value;
      var allowed = type === "lab"
        ? [
            { value: "1.5", text: "1.5" },
            { value: "0.75", text: "0.75" }
          ]
        : [
            { value: "2", text: "2.0" },
            { value: "3", text: "3.0" },
            { value: "4", text: "4.0" }
          ];

      var currentValue = creditEl.value;
      creditEl.innerHTML = "";
      allowed.forEach(function (item) {
        var option = document.createElement("option");
        option.value = item.value;
        option.textContent = item.text;
        creditEl.appendChild(option);
      });

      var stillAllowed = allowed.some(function (item) {
        return item.value === currentValue;
      });
      creditEl.value = stillAllowed ? currentValue : allowed[0].value;
    }

    function getCourseTypeLabel(type) {
      return String(type || "theory").toLowerCase() === "lab" ? "Lab" : "Theory";
    }

    function getTeacherLabel(course) {
      if (!course) return "";
      if (Array.isArray(course.teacherNames) && course.teacherNames.length) {
        return course.teacherNames.join(", ");
      }
      return course.teacherName || course.teacher || "";
    }

    function renderCourseRow(item) {
      if (!tableBody || !item || !item.course) return;
      var tr = document.createElement("tr");
      tr.innerHTML = "<td>" + (item.course.code || "") + "</td>" +
        "<td>" + (item.course.name || "") + "</td>" +
        "<td>" + getCourseTypeLabel(item.course.courseType) + "</td>" +
        "<td>" + (item.course.credit || "") + "</td>" +
        "<td>" + getCtPolicy(item.course.courseType, item.course.credit).label + "</td>" +
        "<td>" + getTeacherLabel(item.course) + "</td>" +
        "<td><span class='badge badge-success'>Active</span></td>";
      tableBody.appendChild(tr);
    }

    function loadCourseRows() {
      if (!tableBody) return;

      apiRequest("/portal/student/courses", { method: "GET" }).then(function (payload) {
        var items = (((payload || {}).data || {}).items) || [];
        tableBody.innerHTML = "";
        items.forEach(function (item) {
          renderCourseRow(item);
        });
      }).catch(function () {
        var courses = safeRead(STORAGE_KEYS.courses, []);
        courses.forEach(function (course) {
          renderCourseRow({
            course: {
              code: course.code,
              name: course.name,
              courseType: course.courseType,
              credit: course.credit,
              teacherName: course.teacher,
              teacherNames: course.teacherNames || []
            }
          });
        });
      });
    }

    function loadSemesterSetup() {
      apiRequest("/portal/student/semester-setup", { method: "GET" }).then(function (payload) {
        var items = (((payload || {}).data || {}).items) || [];
        if (!items.length) return;

        var selectedSemester = semesterEl ? semesterEl.value : "";
        var selected = items.find(function (item) {
          return item.semesterLabel === selectedSemester;
        }) || items[0];

        if (selected && semesterEl) semesterEl.value = selected.semesterLabel;
        if (selected && totalCreditEl) totalCreditEl.value = String(selected.totalCredit || 0);
        if (selected && targetCgpaEl) targetCgpaEl.value = String(selected.targetCgpa || 0);
      }).catch(function () {
        var setup = safeRead(STORAGE_KEYS.semesterSetup, null);
        if (!setup) return;
        if (semesterEl) semesterEl.value = setup.semester || semesterEl.value;
        if (totalCreditEl) totalCreditEl.value = String(setup.totalCredit || 0);
        if (targetCgpaEl) targetCgpaEl.value = String(setup.targetCgpa || 0);
      });
    }

    addCourseForm.addEventListener("submit", function (event) {
      event.preventDefault();
      var code = (document.getElementById("courseCode") || {}).value || "";
      var name = (document.getElementById("courseName") || {}).value || "";
      var credit = (document.getElementById("credit") || {}).value || "3.0";
      var teacherPrimary = (document.getElementById("teacherPrimary") || {}).value || "";
      var teacherSecondary = (document.getElementById("teacherSecondary") || {}).value || "";
      var courseType = (courseTypeEl || {}).value || "theory";

      if (!code.trim() || !name.trim() || !teacherPrimary.trim()) {
        showToast("Please fill course code, name and teacher 1.");
        return;
      }

      var requestBody = {
        code: code.trim().toUpperCase(),
        name: name.trim(),
        credit: Number(credit) || 0,
        courseType: courseType,
        teacherPrimary: teacherPrimary.trim(),
        teacherSecondary: teacherSecondary.trim(),
        semester: (semesterEl || {}).value || "Level-1 Term-1"
      };

      apiRequest("/portal/student/courses", {
        method: "POST",
        body: requestBody
      }).then(function (payload) {
        if (tableBody) {
          tableBody.innerHTML = "";
        }
        loadCourseRows();
        addCourseForm.reset();
        showToast("Course added to database.");

        var courses = safeRead(STORAGE_KEYS.courses, []);
        courses.unshift({
          code: requestBody.code,
          name: requestBody.name,
          courseType: requestBody.courseType,
          credit: String(requestBody.credit),
          teacher: [requestBody.teacherPrimary, requestBody.teacherSecondary].filter(Boolean).join(", "),
          teacherNames: [requestBody.teacherPrimary, requestBody.teacherSecondary].filter(Boolean),
          date: new Date().toISOString()
        });
        safeWrite(STORAGE_KEYS.courses, courses);
      }).catch(function (error) {
        showToast(error.message || "Failed to save course.");
      });
    });

    setupForm.addEventListener("submit", function (event) {
      event.preventDefault();
      var semester = (document.getElementById("semester") || {}).value || "";
      var totalCredit = (document.getElementById("totalCredit") || {}).value || "0";
      var targetCgpa = (document.getElementById("targetCgpa") || {}).value || "0";

      apiRequest("/portal/student/semester-setup", {
        method: "PUT",
        body: {
          semester: semester,
          totalCredit: Number(totalCredit) || 0,
          targetCgpa: Number(targetCgpa) || 0
        }
      }).then(function () {
        safeWrite(STORAGE_KEYS.semesterSetup, {
          semester: semester,
          totalCredit: Number(totalCredit) || 0,
          targetCgpa: Number(targetCgpa) || 0,
          updatedAt: new Date().toISOString()
        });
        showToast("Semester setup saved to database.");
      }).catch(function (error) {
        showToast(error.message || "Failed to save semester setup.");
      });
    });

    loadCourseRows();
    loadSemesterSetup();

    if (courseTypeEl) {
      courseTypeEl.addEventListener("change", syncCreditOptionsByType);
    }
    syncCreditOptionsByType();
  }

  function initSemesterCgpaPage() {
    if (!/student-semester-cgpa\.html$/i.test(window.location.pathname)) {
      return;
    }

    var form = document.querySelector("form");
    var historyBody = document.querySelector("table tbody");
    if (!form || !historyBody) return;

    var semesterEl = document.getElementById("semester");
    var overallCgpaPreviewEl = document.getElementById("overallCgpaPreview");
    ensureSemesterOptions(semesterEl);

    function trendView(trend) {
      if (trend === "up") return { text: "Up", cls: "badge-success" };
      if (trend === "down") return { text: "Down", cls: "badge-danger" };
      return { text: "Stable", cls: "badge-warning" };
    }

    function renderHistory(items) {
      historyBody.innerHTML = "";
      items.forEach(function (item) {
        var trend = trendView(item.trend);
        var semesterLabel = item.semesterLabel || item.semester || "Semester";
        var row = document.createElement("tr");
        row.innerHTML = "<td>" + semesterLabel + "</td><td>" + Number(item.cgpa || 0).toFixed(2) + "</td><td><span class='badge " + trend.cls + "'>" + trend.text + "</span></td>";
        historyBody.appendChild(row);
      });

      if (overallCgpaPreviewEl) {
        var valid = items.filter(function (item) { return Number(item.cgpa || 0) > 0; });
        if (!valid.length) {
          overallCgpaPreviewEl.value = "0.00";
        } else {
          var total = valid.reduce(function (sum, item) { return sum + Number(item.cgpa || 0); }, 0);
          overallCgpaPreviewEl.value = (total / valid.length).toFixed(2);
        }
      }
    }

    function loadHistory() {
      apiRequest("/portal/student/semester-cgpa", { method: "GET" }).then(function (payload) {
        var items = (((payload || {}).data || {}).items) || [];
        renderHistory(items);
      }).catch(function () {
        var entries = safeRead(STORAGE_KEYS.semesterCgpa, []);
        renderHistory(entries.map(function (entry) {
          return {
            semesterLabel: entry.semester,
            cgpa: entry.cgpa,
            trend: "stable"
          };
        }));
      });
    }

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var semester = (document.getElementById("semester") || {}).value || "";
      var cgpaVal = Number((document.getElementById("cgpa") || {}).value || 0);
      var note = (document.getElementById("note") || {}).value || "";

      if (!semester || !cgpaVal) {
        showToast("Please enter valid semester and CGPA.");
        return;
      }

      apiRequest("/portal/student/semester-cgpa", {
        method: "PUT",
        body: {
          semester: semester,
          cgpa: cgpaVal,
          note: note
        }
      }).then(function () {
        var entries = safeRead(STORAGE_KEYS.semesterCgpa, []);
        var existingIndex = entries.findIndex(function (item) { return item.semester === semester; });
        var next = {
          semester: semester,
          cgpa: cgpaVal,
          note: note,
          updatedAt: new Date().toISOString()
        };
        if (existingIndex >= 0) {
          entries[existingIndex] = next;
        } else {
          entries.unshift(next);
        }
        safeWrite(STORAGE_KEYS.semesterCgpa, entries);
        loadHistory();
        showToast("Semester CGPA updated in database.");
      }).catch(function (error) {
        showToast(error.message || "Failed to update semester CGPA.");
      });
    });

    loadHistory();
  }

  function initRunningSemesterCgpaPage() {
    if (!/student-running-semester-cgpa\.html$/i.test(window.location.pathname)) {
      return;
    }

    var form = document.getElementById("running-semester-cgpa-form");
    var semesterEl = document.getElementById("runningSemester");
    var resultEl = document.getElementById("runningSemesterCgpa");
    var totalCreditsEl = document.getElementById("runningTotalCredits");
    var weightedPointsEl = document.getElementById("runningWeightedPoints");
    var noteEl = document.getElementById("runningCgpaNote");
    var rowsBody = document.getElementById("runningCgpaCourseRows");
    var addRowBtn = document.getElementById("addRunningCgpaCourse");
    if (!form || !semesterEl || !rowsBody) return;

    ensureSemesterOptions(semesterEl);

    function normalizeCourses(items) {
      return (items || []).map(function (item) {
        var course = item.course || item;
        return {
          code: String(course.code || "").trim().toUpperCase(),
          credit: Number(course.credit || 0),
          semesterLabel: String(item.semesterLabel || course.semesterLabel || item.semester || course.semester || "Level-1 Term-1")
        };
      }).filter(function (c) { return c.code; });
    }

    function getCourseList() {
      return apiRequest("/portal/student/courses", { method: "GET" }).then(function (payload) {
        var items = (((payload || {}).data || {}).items) || [];
        return normalizeCourses(items);
      }).catch(function () {
        return normalizeCourses(safeRead(STORAGE_KEYS.courses, []));
      });
    }

    function addCourseRow(course) {
      var next = course || { code: "", credit: 3 };
      var row = document.createElement("tr");
      row.innerHTML =
        "<td><input type='text' class='run-course-code' placeholder='e.g. CSE-321' value='" + escapeHtml(next.code || "") + "'></td>" +
        "<td><input type='number' class='run-course-credit' min='0' step='0.5' value='" + String(Number(next.credit || 0)) + "'></td>" +
        "<td><input type='number' class='run-course-gp' min='0' max='4' step='0.01' value='0'></td>";
      rowsBody.appendChild(row);
      row.querySelectorAll("input").forEach(function (input) {
        input.addEventListener("input", recomputeRunningCgpa);
      });
    }

    function recomputeRunningCgpa() {
      var rows = Array.from(rowsBody.querySelectorAll("tr"));
      var totalCredits = 0;
      var weighted = 0;

      rows.forEach(function (row) {
        var creditInput = row.querySelector(".run-course-credit");
        var gpInput = row.querySelector(".run-course-gp");

        var credit = Number((creditInput || {}).value || 0);
        var gp = Number((gpInput || {}).value || 0);

        if (credit < 0) credit = 0;
        if (gp < 0) gp = 0;
        if (gp > 4) gp = 4;

        if (creditInput) creditInput.value = String(credit);
        if (gpInput) gpInput.value = String(gp);

        if (credit > 0) {
          totalCredits += credit;
          weighted += credit * gp;
        }
      });

      var semesterCgpa = totalCredits > 0 ? Number((weighted / totalCredits).toFixed(2)) : 0;

      if (resultEl) resultEl.value = semesterCgpa.toFixed(2);
      if (totalCreditsEl) totalCreditsEl.textContent = totalCredits.toFixed(2);
      if (weightedPointsEl) weightedPointsEl.textContent = weighted.toFixed(2);

      return {
        semesterCgpa: semesterCgpa,
        totalCredits: totalCredits
      };
    }

    function setRowsForSemester(courses, semesterLabel) {
      var scoped = courses.filter(function (course) {
        return String(course.semesterLabel || "") === String(semesterLabel || "");
      });

      rowsBody.innerHTML = "";
      if (!scoped.length) {
        addCourseRow({ code: "", credit: 3 });
        addCourseRow({ code: "", credit: 3 });
        addCourseRow({ code: "", credit: 3 });
      } else {
        scoped.forEach(function (course) {
          addCourseRow(course);
        });
      }

      recomputeRunningCgpa();
    }

    getCourseList().then(function (courses) {
      setRowsForSemester(courses, semesterEl.value);

      semesterEl.addEventListener("change", function () {
        setRowsForSemester(courses, semesterEl.value);
      });

      if (addRowBtn) {
        addRowBtn.addEventListener("click", function () {
          addCourseRow({ code: "", credit: 3 });
          recomputeRunningCgpa();
        });
      }

      form.addEventListener("submit", function (event) {
        event.preventDefault();

        var semester = semesterEl.value || "";
        var computed = recomputeRunningCgpa();
        var note = (noteEl && noteEl.value) ? noteEl.value : "Auto-calculated from running semester course grade points.";

        if (!semester || computed.totalCredits <= 0) {
          showToast("Please add at least one course with positive credit.");
          return;
        }

        apiRequest("/portal/student/semester-cgpa", {
          method: "PUT",
          body: {
            semester: semester,
            cgpa: computed.semesterCgpa,
            note: note
          }
        }).then(function () {
          var entries = safeRead(STORAGE_KEYS.semesterCgpa, []);
          var existingIndex = entries.findIndex(function (item) { return item.semester === semester; });
          var next = {
            semester: semester,
            cgpa: computed.semesterCgpa,
            note: note,
            updatedAt: new Date().toISOString()
          };

          if (existingIndex >= 0) {
            entries[existingIndex] = next;
          } else {
            entries.unshift(next);
          }

          safeWrite(STORAGE_KEYS.semesterCgpa, entries);
          showToast("Semester CGPA calculated and synced.");
          window.setTimeout(function () {
            window.location.href = "student-semester-cgpa.html";
          }, 500);
        }).catch(function (error) {
          showToast(error.message || "Failed to sync semester CGPA.");
        });
      });
    });
  }

  function initAdminNotices() {
    if (!/admin-notices\.html$/i.test(window.location.pathname)) {
      return;
    }

    var form = document.querySelector("form");
    var tableBody = document.querySelector("table tbody");
    if (!form || !tableBody) return;

    function statusBadge(priority) {
      return String(priority || "").toLowerCase() === "urgent" ? "badge-danger" : "badge-success";
    }

    function targetLabel(target) {
      if (target === "students_advisors") return "Students + Advisors";
      if (target === "advisors") return "Advisors";
      return "Students";
    }

    function renderNotices(items) {
      tableBody.innerHTML = "";
      items.forEach(function (item) {
        var row = document.createElement("tr");
        var cls = statusBadge(item.priority);
        var statusText = String(item.status || "published").toLowerCase() === "draft" ? "Draft" : "Published";
        row.innerHTML = "<td>" + formatDate() + "</td><td>" + (item.title || "") + "</td><td>" + targetLabel(item.target) + "</td><td><span class='badge " + cls + "'>" + statusText + "</span></td>";
        tableBody.appendChild(row);
      });
    }

    function loadNotices() {
      apiRequest("/portal/notices", { method: "GET" }).then(function (payload) {
        var items = (((payload || {}).data || {}).items) || [];
        renderNotices(items);
      }).catch(function () {
        var notices = safeRead(STORAGE_KEYS.notices, []);
        renderNotices(notices);
      });
    }

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var title = (document.getElementById("title") || {}).value || "";
      var target = (document.getElementById("target") || {}).value || "Students";
      var priority = (document.getElementById("priority") || {}).value || "Normal";
      var content = (document.getElementById("content") || {}).value || "";

      if (!title.trim() || !content.trim()) {
        showToast("Please add notice title and content.");
        return;
      }

      apiRequest("/portal/admin/notices", {
        method: "POST",
        body: {
          title: title.trim(),
          target: target,
          priority: priority,
          content: content.trim()
        }
      }).then(function () {
        var notices = safeRead(STORAGE_KEYS.notices, []);
        notices.unshift({ date: new Date().toISOString(), title: title.trim(), target: target, priority: priority, content: content.trim() });
        safeWrite(STORAGE_KEYS.notices, notices);
        form.reset();
        loadNotices();
        showToast("Notice published to database.");
      }).catch(function (error) {
        showToast(error.message || "Failed to publish notice.");
      });
    });

    loadNotices();
  }

  function initAdvisorAssignment() {
    if (!/admin-assign-advisor\.html$/i.test(window.location.pathname)) {
      return;
    }

    var forms = document.querySelectorAll("form");
    if (!forms.length) return;

    var assignmentForm = forms[0];
    var historyTable = document.querySelectorAll("table tbody");
    var historyBody = historyTable[historyTable.length - 1];
    var helper = document.querySelector(".helper");

    function renderAssignments(items) {
      if (!historyBody) return;
      historyBody.innerHTML = "";
      items.forEach(function (item) {
        var row = document.createElement("tr");
        row.innerHTML = "<td>" + formatDate() + "</td><td>" + (item.advisorName || item.teacher || "Advisor") + "</td><td>" + String(item.batch || "").replace("Batch ", "") + "</td><td>" + (item.startSerial || item.startId || 0) + "-" + (item.endSerial || item.endId || 0) + "</td><td><span class='badge badge-success'>Assigned</span></td>";
        historyBody.appendChild(row);
      });
    }

    function loadAssignments() {
      apiRequest("/portal/admin/assignments", { method: "GET" }).then(function (payload) {
        var items = (((payload || {}).data || {}).items) || [];
        renderAssignments(items);
      }).catch(function () {
        var assignments = safeRead(STORAGE_KEYS.assignments, []);
        renderAssignments(assignments);
      });
    }

    assignmentForm.addEventListener("submit", function (event) {
      event.preventDefault();
      var batch = (document.getElementById("batch") || {}).value || "Batch 61";
      var teacher = (document.getElementById("teacher") || {}).value || "Teacher";
      var startId = Number((document.getElementById("startId") || {}).value || 0);
      var endId = Number((document.getElementById("endId") || {}).value || 0);

      if (!startId || !endId || endId < startId) {
        showToast("Invalid student serial range.");
        return;
      }

      apiRequest("/portal/admin/assignments", {
        method: "POST",
        body: {
          batch: batch,
          teacher: teacher,
          startId: startId,
          endId: endId
        }
      }).then(function () {
        if (helper) {
          helper.textContent = teacher + " assigned as advisor for student serial " + startId + "-" + endId + ".";
        }

        var assignments = safeRead(STORAGE_KEYS.assignments, []);
        assignments.unshift({ date: new Date().toISOString(), batch: batch, teacher: teacher, startId: startId, endId: endId });
        safeWrite(STORAGE_KEYS.assignments, assignments);
        loadAssignments();
        showToast("Advisor assignment saved to database.");
      }).catch(function (error) {
        showToast(error.message || "Failed to save assignment.");
      });
    });

    loadAssignments();
  }

  function initAdvisorRanking() {
    if (!/advisor-student-ranking\.html$/i.test(window.location.pathname)) {
      return;
    }

    var batchSelect = document.getElementById("batch");
    var semesterSelect = document.getElementById("semester");
    var tableBody = document.querySelector("table tbody");
    var heading = document.querySelector("section.card h3");
    if (!tableBody) return;

    function sortByCurrentCgpa() {
      var rows = Array.from(tableBody.querySelectorAll("tr"));
      rows.sort(function (a, b) {
        var cgpaA = Number(a.children[3].textContent) || 0;
        var cgpaB = Number(b.children[3].textContent) || 0;
        return cgpaB - cgpaA;
      });

      rows.forEach(function (row, idx) {
        row.children[0].textContent = String(idx + 1);
        tableBody.appendChild(row);
      });

      if (heading && batchSelect) {
        heading.textContent = batchSelect.value + " Ranking (Top to Bottom)";
      }
    }

    if (batchSelect) batchSelect.addEventListener("change", sortByCurrentCgpa);
    if (semesterSelect) {
      semesterSelect.addEventListener("change", function () {
        showToast("Showing ranking for " + semesterSelect.value + ".");
        sortByCurrentCgpa();
      });
    }

    sortByCurrentCgpa();
  }

  function initCumulativeCgpaPage() {
    if (!/student-cumulative-cgpa\.html$/i.test(window.location.pathname)) {
      return;
    }

    var timelineBody = document.querySelector("table tbody");
    if (!timelineBody) return;

    function buildTimelineFromEntries(entries) {
      var sorted = (entries || []).slice().sort(function (a, b) {
        return new Date(a.updatedAt || 0).getTime() - new Date(b.updatedAt || 0).getTime();
      });

      var sum = 0;
      return sorted.map(function (entry, idx) {
        var semesterCgpa = Number(entry.cgpa || 0);
        sum += semesterCgpa;
        return {
          semesterLabel: entry.semester || entry.semesterLabel || "Semester",
          semesterCgpa: semesterCgpa,
          cumulativeCgpa: Number((sum / (idx + 1)).toFixed(2))
        };
      });
    }

    function getDirectionFromTimeline(timeline) {
      if (!timeline || timeline.length < 2) return "Stable";
      var last = Number(timeline[timeline.length - 1].semesterCgpa || 0);
      var prev = Number(timeline[timeline.length - 2].semesterCgpa || 0);
      if (last > prev) return "Positive";
      if (last < prev) return "Negative";
      return "Stable";
    }

    function standingFromCgpa(cgpa) {
      if (cgpa >= 3.5) return { text: "Good Standing", cls: "badge-success" };
      if (cgpa >= 3.0) return { text: "On Track", cls: "badge-warning" };
      return { text: "Needs Attention", cls: "badge-danger" };
    }

    function directionBadge(direction) {
      if (direction === "Positive") return "badge-success";
      if (direction === "Negative") return "badge-danger";
      return "badge-warning";
    }

    function render(data) {
      var timeline = data.timeline || [];
      var cumulativeCgpa = Number(data.cumulativeCgpa || 0);
      var direction = getDirectionFromTimeline(timeline);
      var standing = standingFromCgpa(cumulativeCgpa);
      var ranking = data.ranking || null;
      var latestSemester = timeline.length ? timeline[timeline.length - 1].semesterLabel : "N/A";

      var overallCgpaField = document.getElementById("overallCgpaField");
      var overallLatestSemesterField = document.getElementById("overallLatestSemesterField");
      if (overallCgpaField) {
        overallCgpaField.value = cumulativeCgpa.toFixed(2);
      }
      if (overallLatestSemesterField) {
        overallLatestSemesterField.value = latestSemester;
      }

      var cards = document.querySelectorAll("section.grid.grid-3 .card");
      if (cards[0]) {
        var totalStrong = cards[0].querySelector(".stats strong");
        var totalBadge = cards[0].querySelector(".stats .badge");
        if (totalStrong) totalStrong.textContent = cumulativeCgpa.toFixed(2);
        if (totalBadge) {
          totalBadge.className = "badge " + standing.cls;
          totalBadge.textContent = standing.text;
        }
      }

      if (cards[2]) {
        var dirStrong = cards[2].querySelector(".stats strong");
        var dirBadge = cards[2].querySelector(".stats .badge");
        if (dirStrong) dirStrong.textContent = direction;
        if (dirBadge) {
          dirBadge.className = "badge " + directionBadge(direction);
          dirBadge.textContent = direction;
        }
      }

      if (cards[1]) {
        var rankStrong = cards[1].querySelector(".stats strong");
        var rankMuted = cards[1].querySelector(".stats .muted");
        if (rankStrong) {
          var rankValue = ranking && ranking.rank ? ranking.rank : "-";
          rankStrong.textContent = rankValue === "-" ? "-" : ("#" + rankValue);
        }
        if (rankMuted && ranking && ranking.classSize) {
          rankMuted.textContent = "in your class (" + ranking.classSize + " students)";
        }
      }

      var progressBar = document.querySelector(".progress span");
      if (progressBar) {
        var width = Math.max(0, Math.min(100, Math.round(cumulativeCgpa * 25)));
        progressBar.style.width = width + "%";
      }

      var insightsList = document.querySelectorAll("section.grid.grid-2 .card ul li");
      if (insightsList.length >= 3) {
        var termCount = timeline.length;
        var lastSemester = latestSemester;
        var bestSemester = termCount
          ? timeline.slice().sort(function (a, b) { return Number(b.semesterCgpa || 0) - Number(a.semesterCgpa || 0); })[0].semesterLabel
          : "N/A";
        insightsList[0].textContent = "Completed semesters tracked: " + termCount + ".";
        insightsList[1].textContent = "Best semester CGPA was in " + bestSemester + ".";
        insightsList[2].textContent = "Most recent recorded semester: " + lastSemester + ".";
      }

      timelineBody.innerHTML = "";
      timeline.slice().reverse().forEach(function (item) {
        var row = document.createElement("tr");
        row.innerHTML =
          "<td>" + item.semesterLabel + "</td>" +
          "<td>" + Number(item.semesterCgpa || 0).toFixed(2) + "</td>" +
          "<td>" + Number(item.cumulativeCgpa || 0).toFixed(2) + "</td>";
        timelineBody.appendChild(row);
      });
    }

    Promise.all([
      apiRequest("/portal/student/cumulative-cgpa", { method: "GET" }),
      apiRequest("/portal/student/ranking", { method: "GET" }).catch(function () { return { data: null }; })
    ]).then(function (responses) {
      var cumulativePayload = responses[0] || {};
      var rankingPayload = responses[1] || {};
      var data = cumulativePayload.data || {};
      var rankData = rankingPayload.data || null;

      render({
        cumulativeCgpa: Number(data.cumulativeCgpa || 0),
        timeline: Array.isArray(data.timeline) ? data.timeline : [],
        ranking: rankData
      });
    }).catch(function () {
      var entries = safeRead(STORAGE_KEYS.semesterCgpa, []);
      var timeline = buildTimelineFromEntries(entries);
      var cumulativeCgpa = timeline.length ? timeline[timeline.length - 1].cumulativeCgpa : 0;
      render({ cumulativeCgpa: cumulativeCgpa, timeline: timeline, ranking: null });
    });
  }

  function initMessages() {
    var isStudentPage = /student-message-advisor\.html$/i.test(window.location.pathname);
    var isAdvisorPage = /advisor-messages\.html$/i.test(window.location.pathname);
    var isDangerPage = /advisor-danger-zone\.html$/i.test(window.location.pathname);

    var messages = safeRead(STORAGE_KEYS.messages, []);

    function statusClass(status) {
      var value = String(status || "").toLowerCase();
      if (value === "new" || value === "pending") return "badge-warning";
      return "badge-success";
    }

    function loadMessagesFromApi(callback) {
      apiRequest("/portal/messages", { method: "GET" }).then(function (payload) {
        var items = (((payload || {}).data || {}).items) || [];
        callback(items);
      }).catch(function () {
        callback(messages);
      });
    }

    if (isStudentPage) {
      var studentForm = document.querySelector("form");
      var tableBody = document.querySelector("table tbody");
      var meetingDateEl = document.getElementById("meetingDate");
      var meetingSlotEl = document.getElementById("meetingSlot");
      var meetingModeEl = document.getElementById("meetingMode");
      if (studentForm && tableBody) {
        loadMessagesFromApi(function (items) {
          tableBody.innerHTML = "";
          items.filter(function (msg) {
            return msg.from === "student";
          }).forEach(function (msg) {
            var row = document.createElement("tr");
            row.innerHTML = "<td>" + formatDate(msg.date) + "</td><td>" + (msg.subject || "") + "</td><td><span class='badge " + statusClass(msg.status) + "'>" + (msg.status || "Pending") + "</span></td>";
            tableBody.appendChild(row);
          });
        });

        studentForm.addEventListener("submit", function (event) {
          event.preventDefault();
          var advisor = (document.getElementById("advisor") || {}).value || "Advisor";
          var subject = (document.getElementById("subject") || {}).value || "Meeting Request";
          var message = (document.getElementById("message") || {}).value || "";
          var meetingDate = (meetingDateEl || {}).value || "";
          var meetingSlot = (meetingSlotEl || {}).value || "";
          var meetingMode = (meetingModeEl || {}).value || "in-person";

          if (!subject.trim() || !message.trim()) {
            showToast("Please fill subject and message.");
            return;
          }

          var formattedDate = meetingDate ? formatDate(meetingDate) : "Not specified";
          var slotText = meetingSlot || "Not specified";
          var modeText = meetingMode === "online" ? "Online" : "In-person";
          var finalSubject = subject.trim();
          if (!/meeting/i.test(finalSubject)) {
            finalSubject = "Meeting Request: " + finalSubject;
          }

          var meetingDetails = [
            "Meeting details:",
            "Preferred date: " + formattedDate,
            "Preferred slot: " + slotText,
            "Meeting mode: " + modeText,
            "",
            "Agenda:",
            message.trim()
          ].join("\n");

          apiRequest("/portal/messages", {
            method: "POST",
            body: {
              toRole: "advisor",
              advisorName: advisor,
              subject: finalSubject,
              content: meetingDetails,
              channel: "portal"
            }
          }).then(function () {
            messages.unshift({
              id: Date.now(),
              date: new Date().toISOString(),
              from: "student",
              to: "advisor",
              subject: finalSubject,
              message: meetingDetails,
              status: "pending"
            });
            safeWrite(STORAGE_KEYS.messages, messages);
            studentForm.reset();
            loadMessagesFromApi(function (items) {
              tableBody.innerHTML = "";
              items.filter(function (msg) {
                return msg.from === "student";
              }).forEach(function (msg) {
                var row = document.createElement("tr");
                row.innerHTML = "<td>" + formatDate(msg.date) + "</td><td>" + (msg.subject || "") + "</td><td><span class='badge " + statusClass(msg.status) + "'>" + (msg.status || "Pending") + "</span></td>";
                tableBody.appendChild(row);
              });
            });
            showToast("Meeting request sent to advisor.");
          }).catch(function (error) {
            showToast(error.message || "Failed to send message.");
          });
        });
      }
    }

    if (isAdvisorPage) {
      var advisorTableBody = document.querySelector("table tbody");
      var advisorForm = document.querySelectorAll("form")[0];

      if (advisorTableBody) {
        loadMessagesFromApi(function (items) {
          advisorTableBody.innerHTML = "";
          items.filter(function (msg) {
            return msg.to === "advisor";
          }).forEach(function (msg) {
            var row = document.createElement("tr");
            row.innerHTML = "<td>" + formatDate() + "</td><td>" + (msg.fromName || "Student") + "</td><td>" + (msg.message || "") + "</td><td><span class='badge " + statusClass(msg.status) + "'>" + (msg.status || "New") + "</span></td>";
            advisorTableBody.appendChild(row);
          });
        });
      }

      if (advisorForm) {
        advisorForm.addEventListener("submit", function (event) {
          event.preventDefault();
          var toStudent = (document.getElementById("toStudent") || {}).value || "Student";
          var subject = (document.getElementById("subject") || {}).value || "Reply";
          var sms = (document.getElementById("sms") || {}).value || "";
          if (!sms.trim()) {
            showToast("Please write your message.");
            return;
          }

          var studentName = String(toStudent).split("(")[0].trim();
          apiRequest("/portal/messages", {
            method: "POST",
            body: {
              toRole: "student",
              toName: studentName,
              subject: subject.trim(),
              content: sms.trim(),
              channel: "sms"
            }
          }).then(function () {
            messages.unshift({
              id: Date.now(),
              date: new Date().toISOString(),
              from: "advisor",
              to: "student",
              studentName: studentName,
              subject: subject.trim(),
              message: sms.trim(),
              status: "replied"
            });
            safeWrite(STORAGE_KEYS.messages, messages);
            advisorForm.reset();
            showToast("Reply sent to student.");
          }).catch(function (error) {
            showToast(error.message || "Failed to send SMS.");
          });
        });
      }
    }

    if (isDangerPage) {
      var smsButtons = document.querySelectorAll("button.btn.btn-primary[type='button']");
      var smsForm = document.querySelector("form");
      var studentSelect = document.getElementById("student");

      smsButtons.forEach(function (btn) {
        btn.addEventListener("click", function () {
          var row = btn.closest("tr");
          if (!row) return;
          var studentText = row.children[0].textContent.trim();
          if (studentSelect) {
            var opts = Array.from(studentSelect.options);
            var found = opts.find(function (opt) {
              return studentText.indexOf(opt.text) === 0 || opt.text.indexOf(studentText) === 0;
            });
            if (found) {
              studentSelect.value = found.value;
            }
          }
          showToast("Student selected for quick SMS.");
        });
      });

      if (smsForm) {
        smsForm.addEventListener("submit", function (event) {
          event.preventDefault();
          var student = (document.getElementById("student") || {}).value || "Student";
          var message = (document.getElementById("message") || {}).value || "";
          if (!message.trim()) {
            showToast("Please write an SMS before sending.");
            return;
          }

          apiRequest("/portal/messages", {
            method: "POST",
            body: {
              toRole: "student",
              toName: student,
              subject: "Risk Meeting",
              content: message.trim(),
              channel: "sms"
            }
          }).then(function () {
            messages.unshift({
              id: Date.now(),
              date: new Date().toISOString(),
              from: "advisor",
              to: "student",
              studentName: student,
              subject: "Risk Meeting",
              message: message.trim(),
              status: "sent"
            });
            safeWrite(STORAGE_KEYS.messages, messages);
            showToast("SMS sent successfully.");
          }).catch(function (error) {
            showToast(error.message || "Failed to send SMS.");
          });
        });
      }
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    ensureProtectedPageAccess();
    setActiveNav();
    bindLogoutConfirm();
    initAttendancePage();
    initCtMarksPage();
    initStudentCoursesPage();
    initSemesterCgpaPage();
    initRunningSemesterCgpaPage();
    initAdminNotices();
    initAdvisorAssignment();
    initAdvisorRanking();
    initCumulativeCgpaPage();
    initMessages();
  });
})();
