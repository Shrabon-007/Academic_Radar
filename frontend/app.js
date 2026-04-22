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
    "admin-settings.html": "admin",
    "advisor-dashboard.html": "advisor",
    "advisor-student-ranking.html": "advisor",
    "advisor-student-profile.html": "advisor",
    "advisor-danger-zone.html": "advisor",
    "advisor-messages.html": "advisor",
    "advisor-notices.html": "advisor",
    "advisor-settings.html": "advisor",
    "student-dashboard.html": "student",
    "student-courses.html": "student",
    "student-attendance.html": "student",
    "student-ct-marks.html": "student",
    "student-semester-cgpa.html": "student",
    "student-running-semester-cgpa.html": "student",
    "student-cumulative-cgpa.html": "student",
    "student-notices.html": "student",
    "student-message-advisor.html": "student",
    "student-settings.html": "student"
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
    var teacherSelect = document.getElementById("teacher");
    var advisorListTableBody = document.getElementById("advisorListTableBody");
    var historyBody = document.getElementById("assignmentHistoryBody");
    var studentTableBody = document.getElementById("studentBatchTableBody");
    var batchFilter = document.getElementById("batchFilter");
    var helper = document.querySelector(".helper");

    function renderAdvisors(items) {
      var advisors = Array.isArray(items) ? items : [];

      if (teacherSelect) {
        teacherSelect.innerHTML = "";
        if (!advisors.length) {
          var emptyOption = document.createElement("option");
          emptyOption.value = "";
          emptyOption.textContent = "No advisor account found";
          teacherSelect.appendChild(emptyOption);
        } else {
          advisors.forEach(function (advisor) {
            var option = document.createElement("option");
            option.value = advisor.name || "Advisor";
            option.textContent = advisor.name || "Advisor";
            teacherSelect.appendChild(option);
          });
        }
      }

      if (advisorListTableBody) {
        advisorListTableBody.innerHTML = "";
        if (!advisors.length) {
          var emptyRow = document.createElement("tr");
          emptyRow.innerHTML = "<td colspan='3' class='muted'>No advisor account found.</td>";
          advisorListTableBody.appendChild(emptyRow);
          return;
        }

        advisors.forEach(function (advisor) {
          var row = document.createElement("tr");
          row.innerHTML =
            "<td>" + (advisor.name || "Advisor") + "</td>" +
            "<td>" + (advisor.department || "-") + "</td>" +
            "<td>" + Number(advisor.adviseeCount || 0) + "</td>";
          advisorListTableBody.appendChild(row);
        });
      }
    }

    function loadAdvisors() {
      apiRequest("/portal/admin/advisors", { method: "GET" }).then(function (payload) {
        var items = (((payload || {}).data || {}).items) || [];
        renderAdvisors(items);
      }).catch(function () {
        // Keep static fallback from HTML if API fails.
      });
    }

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

    function renderStudents(items) {
      if (!studentTableBody) return;
      studentTableBody.innerHTML = "";

      if (!items.length) {
        var emptyRow = document.createElement("tr");
        emptyRow.innerHTML = "<td colspan='4' class='muted'>No registered students found for this batch.</td>";
        studentTableBody.appendChild(emptyRow);
        return;
      }

      items.forEach(function (item) {
        var row = document.createElement("tr");
        row.innerHTML =
          "<td>" + (item.serial || 0) + "</td>" +
          "<td>" + (item.studentId || "") + "</td>" +
          "<td>" + (item.name || "Student") + "</td>" +
          "<td>" + (item.assignedAdvisor || "Not Assigned") + "</td>";
        studentTableBody.appendChild(row);
      });
    }

    function loadStudentsByBatch(batchValue) {
      if (!studentTableBody || !batchValue) return;

      apiRequest("/portal/admin/students?batch=" + encodeURIComponent(batchValue), { method: "GET" }).then(function (payload) {
        var items = (((payload || {}).data || {}).items) || [];
        renderStudents(items);
      }).catch(function (error) {
        renderStudents([]);
        showToast(error.message || "Could not load students for selected batch.");
      });
    }

    assignmentForm.addEventListener("submit", function (event) {
      event.preventDefault();
      var batch = (document.getElementById("batch") || {}).value || "22";
      var teacher = (document.getElementById("teacher") || {}).value || "Teacher";
      var startId = Number((document.getElementById("startId") || {}).value || 0);
      var endId = Number((document.getElementById("endId") || {}).value || 0);
      var studentCount = endId - startId + 1;

      if (!startId || !endId || endId < startId) {
        showToast("Invalid student serial range.");
        return;
      }

      if (studentCount !== 10) {
        showToast("Advisor assignment must cover exactly 10 students.");
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
          helper.textContent = teacher + " assigned as advisor for student ID " + startId + "-" + endId + " in " + batch + " (10 students).";
        }

        var assignments = safeRead(STORAGE_KEYS.assignments, []);
        assignments.unshift({ date: new Date().toISOString(), batch: batch, teacher: teacher, startId: startId, endId: endId });
        safeWrite(STORAGE_KEYS.assignments, assignments);
        loadAssignments();
        if (batchFilter) {
          loadStudentsByBatch(batchFilter.value || batch);
        }
        showToast("Advisor assignment saved to database.");
      }).catch(function (error) {
        showToast(error.message || "Failed to save assignment.");
      });
    });

    if (batchFilter) {
      batchFilter.addEventListener("change", function () {
        loadStudentsByBatch(batchFilter.value || "22");
      });
    }

    loadAssignments();
    loadAdvisors();
    loadStudentsByBatch((batchFilter && batchFilter.value) || "22");
  }

  function initAdvisorRanking() {
    if (!/advisor-student-ranking\.html$/i.test(window.location.pathname)) {
      return;
    }

    var batchSelect = document.getElementById("batch");
    var semesterSelect = document.getElementById("semester");
    var tableBody = document.getElementById("advisorRankingTableBody") || document.querySelector("table tbody");
    var heading = document.getElementById("advisorRankingHeading") || document.querySelector("section.card h3");
    if (!tableBody) return;

    function normalizeBatchLabel(value) {
      var raw = String(value || "").trim();
      return /^batch\s+/i.test(raw) ? raw : ("Batch " + raw);
    }

    function renderAdvisorStudents(items, activeBatch) {
      tableBody.innerHTML = "";
      if (!items.length) {
        var emptyRow = document.createElement("tr");
        emptyRow.innerHTML = "<td colspan='6' class='muted'>No assigned students found for this batch.</td>";
        tableBody.appendChild(emptyRow);
        if (heading) heading.textContent = normalizeBatchLabel(activeBatch) + " Ranking (Top to Bottom)";
        return;
      }

      items.forEach(function (item, idx) {
        var profileHref = "advisor-student-profile.html?studentUserId=" + encodeURIComponent(item.userId || "") +
          "&studentId=" + encodeURIComponent(item.studentId || "") +
          "&batch=" + encodeURIComponent(item.batch || "") +
          "&name=" + encodeURIComponent(item.name || "Student");
        var row = document.createElement("tr");
        row.innerHTML =
          "<td>" + (idx + 1) + "</td>" +
          "<td>" + (item.studentId || "") + "</td>" +
          "<td>" + (item.name || "Student") + "</td>" +
          "<td>" + Number(item.currentCgpa || 0).toFixed(2) + "</td>" +
          "<td>" + Number(item.overallCgpa || 0).toFixed(2) + "</td>" +
          "<td><a class='btn btn-outline' href='" + profileHref + "'>View Report</a></td>";
        tableBody.appendChild(row);
      });

      if (heading) heading.textContent = normalizeBatchLabel(activeBatch) + " Ranking (Top to Bottom)";
    }

    function ensureBatchOptions(batches) {
      if (!batchSelect || !Array.isArray(batches) || !batches.length) return;
      var current = String(batchSelect.value || "").replace(/^Batch\s*/i, "").trim();
      batchSelect.innerHTML = "";
      batches.forEach(function (batch) {
        var b = String(batch || "").trim();
        if (!b) return;
        var opt = document.createElement("option");
        opt.value = b;
        opt.textContent = normalizeBatchLabel(b);
        batchSelect.appendChild(opt);
      });
      if (current) {
        var found = Array.from(batchSelect.options).some(function (opt) { return opt.value === current; });
        if (found) batchSelect.value = current;
      }
    }

    function loadAdvisorStudents() {
      var selectedBatch = batchSelect ? String(batchSelect.value || "").replace(/^Batch\s*/i, "").trim() : "";
      var url = "/portal/advisor/students" + (selectedBatch ? ("?batch=" + encodeURIComponent(selectedBatch)) : "");
      apiRequest(url, { method: "GET" }).then(function (payload) {
        var data = (payload || {}).data || {};
        var batches = Array.isArray(data.batches) ? data.batches : [];
        ensureBatchOptions(batches);

        var activeBatch = batchSelect ? String(batchSelect.value || selectedBatch || "") : selectedBatch;
        var items = Array.isArray(data.items) ? data.items : [];
        var filtered = items.filter(function (item) {
          return !activeBatch || String(item.batch || "") === String(activeBatch).replace(/^Batch\s*/i, "").trim();
        });
        renderAdvisorStudents(filtered, activeBatch || (batches[0] || "Batch"));
      }).catch(function (error) {
        tableBody.innerHTML = "";
        var errRow = document.createElement("tr");
        errRow.innerHTML = "<td colspan='6' class='muted'>Could not load assigned students.</td>";
        tableBody.appendChild(errRow);
        showToast(error.message || "Could not load assigned students.");
      });
    }

    if (batchSelect) batchSelect.addEventListener("change", loadAdvisorStudents);
    if (semesterSelect) {
      semesterSelect.addEventListener("change", function () {
        showToast("Showing ranking for " + semesterSelect.value + ".");
        loadAdvisorStudents();
      });
    }

    loadAdvisorStudents();
  }

  function initAdvisorStudentProfile() {
    if (!/advisor-student-profile\.html$/i.test(window.location.pathname)) {
      return;
    }

    var params = new URLSearchParams(window.location.search || "");
    var studentUserId = params.get("studentUserId") || "";
    var studentId = params.get("studentId") || "";

    var subtitleEl = document.getElementById("advisorStudentReportSubtitle");
    var overallCgpaEl = document.getElementById("advisorStudentOverallCgpa");
    var standingEl = document.getElementById("advisorStudentStandingBadge");
    var rankEl = document.getElementById("advisorStudentRank");
    var rankMetaEl = document.getElementById("advisorStudentRankMeta");
    var currentCgpaEl = document.getElementById("advisorStudentCurrentCgpa");
    var currentLabelEl = document.getElementById("advisorStudentCurrentSemesterLabel");
    var attendanceBody = document.getElementById("advisorStudentAttendanceBody");
    var ctBody = document.getElementById("advisorStudentCtBody");
    var semesterCgpaBody = document.getElementById("advisorStudentSemesterCgpaBody");
    var summaryStandingEl = document.getElementById("advisorPerformanceStanding");
    var summaryOverallEl = document.getElementById("advisorPerformanceOverallCgpa");
    var summaryCurrentEl = document.getElementById("advisorPerformanceCurrentCgpa");
    var summaryAttendanceEl = document.getElementById("advisorPerformanceAttendance");
    var summaryCtEl = document.getElementById("advisorPerformanceCt");
    var summarySuggestionEl = document.getElementById("advisorPerformanceSuggestion");

    function badgeClassByStanding(standing) {
      var s = String(standing || "").toLowerCase();
      if (s === "good") return "badge-success";
      if (s === "moderate") return "badge-warning";
      return "badge-danger";
    }

    function badgeClassByRisk(risk) {
      var r = String(risk || "").toLowerCase();
      if (r === "good") return "badge-success";
      if (r === "watch") return "badge-warning";
      return "badge-danger";
    }

    function badgeClassByCt(performance) {
      var p = String(performance || "").toLowerCase();
      if (p === "strong") return "badge-success";
      if (p === "average") return "badge-warning";
      return "badge-danger";
    }

    function badgeClassByTrend(trend) {
      var t = String(trend || "").toLowerCase();
      if (t === "up") return "badge-success";
      if (t === "down") return "badge-danger";
      return "badge-warning";
    }

    if (!studentUserId && !studentId) {
      showToast("Student not selected. Open report from advisor ranking page.");
      return;
    }

    var query = [];
    if (studentUserId) query.push("studentUserId=" + encodeURIComponent(studentUserId));
    if (studentId) query.push("studentId=" + encodeURIComponent(studentId));

    apiRequest("/portal/advisor/student-report?" + query.join("&"), { method: "GET" }).then(function (payload) {
      var data = (payload || {}).data || {};
      var student = data.student || {};
      var ranking = data.ranking || {};
      var summary = data.performanceSummary || {};
      var attendanceItems = Array.isArray(data.currentSemesterAttendance) ? data.currentSemesterAttendance : [];
      var ctItems = Array.isArray(data.currentSemesterCtMarks) ? data.currentSemesterCtMarks : [];
      var semesterItems = Array.isArray(data.semesterCgpa) ? data.semesterCgpa : [];

      if (subtitleEl) {
        subtitleEl.textContent = "Student: " + (student.name || "Student") + " | ID: " + (student.studentId || "-") + " | Batch " + (student.batch || "-");
      }

      if (overallCgpaEl) overallCgpaEl.textContent = Number(data.overallCgpa || 0).toFixed(2);
      if (standingEl) {
        var standingText = summary.standing || "At Risk";
        standingEl.className = "badge " + badgeClassByStanding(standingText);
        standingEl.textContent = standingText;
      }

      if (rankEl) rankEl.textContent = ranking.rank ? ("#" + ranking.rank) : "-";
      if (rankMetaEl) rankMetaEl.textContent = "out of " + Number(ranking.classSize || 0);

      if (currentCgpaEl) currentCgpaEl.textContent = Number(data.currentSemesterCgpa || 0).toFixed(2);
      if (currentLabelEl) currentLabelEl.textContent = data.latestSemesterLabel || "No semester data";

      if (attendanceBody) {
        attendanceBody.innerHTML = "";
        if (!attendanceItems.length) {
          var emptyAttendance = document.createElement("tr");
          emptyAttendance.innerHTML = "<td colspan='4' class='muted'>No attendance data found for current semester.</td>";
          attendanceBody.appendChild(emptyAttendance);
        } else {
          attendanceItems.forEach(function (item) {
            var row = document.createElement("tr");
            row.innerHTML =
              "<td>" + (item.courseCode || "") + "</td>" +
              "<td>" + Number(item.percentage || 0).toFixed(0) + "%</td>" +
              "<td>" + Number(item.predictedMark || 0).toFixed(0) + "</td>" +
              "<td><span class='badge " + badgeClassByRisk(item.risk) + "'>" + String(item.risk || "watch").toUpperCase() + "</span></td>";
            attendanceBody.appendChild(row);
          });
        }
      }

      if (ctBody) {
        ctBody.innerHTML = "";
        if (!ctItems.length) {
          var emptyCt = document.createElement("tr");
          emptyCt.innerHTML = "<td colspan='4' class='muted'>No CT data found for current semester.</td>";
          ctBody.appendChild(emptyCt);
        } else {
          ctItems.forEach(function (item) {
            var row = document.createElement("tr");
            row.innerHTML =
              "<td>" + (item.courseCode || "") + "</td>" +
              "<td>" + Number(item.total || 0).toFixed(0) + " / " + Number(item.maxMarks || 0).toFixed(0) + "</td>" +
              "<td>" + (item.maxMarks ? Number((Number(item.total || 0) / Number(item.maxMarks || 1) * 100)).toFixed(0) : "0") + "%</td>" +
              "<td><span class='badge " + badgeClassByCt(item.performance) + "'>" + String(item.performance || "average").toUpperCase() + "</span></td>";
            ctBody.appendChild(row);
          });
        }
      }

      if (semesterCgpaBody) {
        semesterCgpaBody.innerHTML = "";
        if (!semesterItems.length) {
          var emptySemester = document.createElement("tr");
          emptySemester.innerHTML = "<td colspan='4' class='muted'>No semester CGPA data found.</td>";
          semesterCgpaBody.appendChild(emptySemester);
        } else {
          semesterItems.forEach(function (item) {
            var row = document.createElement("tr");
            row.innerHTML =
              "<td>" + (item.semesterLabel || "") + "</td>" +
              "<td>" + Number(item.cgpa || 0).toFixed(2) + "</td>" +
              "<td><span class='badge " + badgeClassByTrend(item.trend) + "'>" + String(item.trend || "stable").toUpperCase() + "</span></td>" +
              "<td>" + formatDate(item.updatedAt) + "</td>";
            semesterCgpaBody.appendChild(row);
          });
        }
      }

      if (summaryStandingEl) summaryStandingEl.textContent = summary.standing || "At Risk";
      if (summaryOverallEl) summaryOverallEl.textContent = Number(summary.overallCgpa || 0).toFixed(2);
      if (summaryCurrentEl) summaryCurrentEl.textContent = Number(summary.currentSemesterCgpa || 0).toFixed(2);
      if (summaryAttendanceEl) summaryAttendanceEl.textContent = Number(summary.avgAttendance || 0).toFixed(1) + "%";
      if (summaryCtEl) summaryCtEl.textContent = Number(summary.avgCtPercent || 0).toFixed(1) + "%";
      if (summarySuggestionEl) summarySuggestionEl.textContent = summary.suggestion || "No suggestion available.";
    }).catch(function (error) {
      showToast(error.message || "Could not load student report.");
    });
  }

  function initRoleNoticeBoards() {
    var isStudentDashboard = /student-dashboard\.html$/i.test(window.location.pathname);
    var isAdvisorDashboard = /advisor-dashboard\.html$/i.test(window.location.pathname);
    if (!isStudentDashboard && !isAdvisorDashboard) return;

    var tableBody = isStudentDashboard
      ? document.getElementById("studentNoticeTableBody")
      : document.getElementById("advisorNoticeTableBody");
    if (!tableBody) return;

    function priorityBadge(priority) {
      var p = String(priority || "").toLowerCase();
      if (p === "urgent") return "badge-danger";
      if (p === "important") return "badge-warning";
      return "badge-success";
    }

    function targetLabel(target) {
      if (target === "students_advisors") return "Students + Advisors";
      if (target === "advisors") return "Advisors";
      return "Students";
    }

    function renderNotices(items) {
      tableBody.innerHTML = "";
      if (!items.length) {
        var emptyRow = document.createElement("tr");
        emptyRow.innerHTML = "<td colspan='4' class='muted'>No notices published yet.</td>";
        tableBody.appendChild(emptyRow);
        return;
      }

      items.slice(0, 8).forEach(function (item) {
        var row = document.createElement("tr");
        var badgeCls = priorityBadge(item.priority);
        row.innerHTML =
          "<td>" + formatDate(item.publishedAt || item.createdAt || item.updatedAt) + "</td>" +
          "<td>" + (item.title || "Notice") + "</td>" +
          "<td><span class='badge " + badgeCls + "'>" + String(item.priority || "normal").toUpperCase() + "</span></td>" +
          "<td>" + targetLabel(item.target) + "</td>";
        tableBody.appendChild(row);
      });
    }

    apiRequest("/portal/notices", { method: "GET" }).then(function (payload) {
      var items = (((payload || {}).data || {}).items) || [];
      renderNotices(items);
    }).catch(function () {
      var fallback = safeRead(STORAGE_KEYS.notices, []);
      renderNotices(fallback);
    });
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
      if (value === "new") return "badge-warning";
      return "badge-success";
    }

    function renderPanelNotices(tableBodyId) {
      var body = document.getElementById(tableBodyId);
      if (!body) return;

      function badgeCls(priority) {
        var p = String(priority || "").toLowerCase();
        if (p === "urgent") return "badge-danger";
        if (p === "important") return "badge-warning";
        return "badge-success";
      }

      apiRequest("/portal/notices", { method: "GET" }).then(function (payload) {
        var items = (((payload || {}).data || {}).items) || [];
        body.innerHTML = "";
        if (!items.length) {
          var empty = document.createElement("tr");
          empty.innerHTML = "<td colspan='3' class='muted'>No notices found.</td>";
          body.appendChild(empty);
          return;
        }

        items.slice(0, 8).forEach(function (item) {
          var row = document.createElement("tr");
          row.innerHTML =
            "<td>" + formatDate(item.publishedAt || item.createdAt || item.updatedAt) + "</td>" +
            "<td>" + (item.title || "Notice") + "</td>" +
            "<td><span class='badge " + badgeCls(item.priority) + "'>" + String(item.priority || "normal").toUpperCase() + "</span></td>";
          body.appendChild(row);
        });
      }).catch(function () {
        body.innerHTML = "";
        var err = document.createElement("tr");
        err.innerHTML = "<td colspan='3' class='muted'>Could not load notices.</td>";
        body.appendChild(err);
      });
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
      var tableBody = document.getElementById("studentMessageTableBody") || document.querySelector("table tbody");
      var advisorSelectEl = document.getElementById("advisor");
      var meetingDateEl = document.getElementById("meetingDate");
      var meetingSlotEl = document.getElementById("meetingSlot");
      var meetingModeEl = document.getElementById("meetingMode");
      var detailTitleEl = document.getElementById("studentMessageDetailSubject");
      var detailMetaEl = document.getElementById("studentMessageDetailMeta");
      var detailBodyEl = document.getElementById("studentMessageDetailBody");

      function renderStudentMessageRows(items) {
        tableBody.innerHTML = "";
        var visible = items.filter(function (msg) {
          return msg.from === "student" || msg.to === "student";
        });

        if (!visible.length) {
          var emptyRow = document.createElement("tr");
          emptyRow.innerHTML = "<td colspan='3' class='muted'>No messages found.</td>";
          tableBody.appendChild(emptyRow);
          if (detailTitleEl) detailTitleEl.textContent = "No message selected";
          if (detailMetaEl) detailMetaEl.textContent = "No message selected.";
          if (detailBodyEl) detailBodyEl.textContent = "Send a message or wait for advisor response.";
          return;
        }

        function showMessageDetails(msg) {
          var direction = msg.to === "student" ? "Received from advisor" : "Sent to advisor";
          if (detailTitleEl) detailTitleEl.textContent = msg.subject || "(No Subject)";
          if (detailMetaEl) detailMetaEl.textContent = formatDate(msg.date) + " | " + direction;
          if (detailBodyEl) detailBodyEl.textContent = msg.message || "No message body.";
        }

        visible.forEach(function (msg, idx) {
          var direction = msg.to === "student" ? "Received" : "Sent";
          var row = document.createElement("tr");
          row.style.cursor = "pointer";
          row.innerHTML = "<td>" + formatDate(msg.date) + "</td><td>" + (msg.subject || "") + "</td><td><span class='badge " + statusClass(msg.status) + "'>" + direction + "</span></td>";
          row.addEventListener("click", function () {
            showMessageDetails(msg);
          });
          tableBody.appendChild(row);

          if (idx === 0) {
            showMessageDetails(msg);
          }
        });
      }

      function loadAssignedAdvisor() {
        if (!advisorSelectEl) return;

        apiRequest("/portal/student/advisor", { method: "GET" }).then(function (payload) {
          var advisor = (((payload || {}).data || {}).advisor) || null;
          advisorSelectEl.innerHTML = "";

          if (!advisor || !advisor.advisorName) {
            var noOpt = document.createElement("option");
            noOpt.value = "";
            noOpt.textContent = "No advisor assigned yet";
            advisorSelectEl.appendChild(noOpt);
            return;
          }

          var option = document.createElement("option");
          option.value = advisor.advisorName;
          option.textContent = advisor.advisorName + " (Batch " + String(advisor.batch || "") + ")";
          advisorSelectEl.appendChild(option);
          advisorSelectEl.value = advisor.advisorName;
        }).catch(function () {
          if (!advisorSelectEl.options.length) {
            var fallback = document.createElement("option");
            fallback.value = "";
            fallback.textContent = "No advisor assigned yet";
            advisorSelectEl.appendChild(fallback);
          }
        });
      }

      if (studentForm && tableBody) {
        loadAssignedAdvisor();
        loadMessagesFromApi(function (items) {
          renderStudentMessageRows(items);
        });

        studentForm.addEventListener("submit", function (event) {
          event.preventDefault();
          var advisor = (document.getElementById("advisor") || {}).value || "Advisor";
          var subject = (document.getElementById("subject") || {}).value || "Meeting Request";
          var message = (document.getElementById("message") || {}).value || "";
          var meetingDate = (meetingDateEl || {}).value || "";
          var meetingSlot = (meetingSlotEl || {}).value || "";
          var meetingMode = (meetingModeEl || {}).value || "in-person";

          if (!advisor.trim()) {
            showToast("No advisor is assigned for your account yet.");
            return;
          }

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
              status: "sent"
            });
            safeWrite(STORAGE_KEYS.messages, messages);
            studentForm.reset();
            loadMessagesFromApi(function (items) {
              renderStudentMessageRows(items);
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
      var toStudentSelect = document.getElementById("toStudent");
      renderPanelNotices("advisorNoticePanelBody");

      function loadAssignedStudentsForAdvisor() {
        if (!toStudentSelect) return;
        apiRequest("/portal/advisor/students", { method: "GET" }).then(function (payload) {
          var items = (((payload || {}).data || {}).items) || [];
          toStudentSelect.innerHTML = "";

          if (!items.length) {
            var emptyOpt = document.createElement("option");
            emptyOpt.value = "";
            emptyOpt.textContent = "No assigned students found";
            toStudentSelect.appendChild(emptyOpt);
            return;
          }

          items.forEach(function (item) {
            var opt = document.createElement("option");
            opt.value = item.userId || "";
            opt.dataset.studentName = item.name || "Student";
            opt.textContent = item.name + " (" + item.studentId + ") - Batch " + item.batch;
            toStudentSelect.appendChild(opt);
          });
        }).catch(function () {
          // Keep static fallback options already in HTML.
        });
      }

      loadAssignedStudentsForAdvisor();

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

          var selectedOption = toStudentSelect ? toStudentSelect.options[toStudentSelect.selectedIndex] : null;
          var studentName = selectedOption ? (selectedOption.dataset.studentName || selectedOption.text || "Student") : "Student";
          var targetStudentUserId = toStudent || "";
          apiRequest("/portal/messages", {
            method: "POST",
            body: {
              toRole: "student",
              toUserId: targetStudentUserId,
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
      var watchlistBody = document.getElementById("advisorWatchlistBody");
      var smsForm = document.querySelector("form");
      var studentSelect = document.getElementById("student");
      var smsMessageEl = document.getElementById("message");

      function riskBadgeClass(risk) {
        var r = String(risk || "").toLowerCase();
        if (r === "high") return "badge-danger";
        if (r === "medium") return "badge-warning";
        return "badge-success";
      }

      function populateStudentSelect(items) {
        if (!studentSelect) return;
        studentSelect.innerHTML = "";

        if (!items.length) {
          var emptyOption = document.createElement("option");
          emptyOption.value = "";
          emptyOption.textContent = "No at-risk students found";
          studentSelect.appendChild(emptyOption);
          return;
        }

        items.forEach(function (item) {
          var option = document.createElement("option");
          option.value = item.userId || "";
          option.dataset.studentName = item.name || "Student";
          option.textContent = (item.name || "Student") + " (" + (item.studentId || "") + ")";
          studentSelect.appendChild(option);
        });
      }

      function renderWatchlist(items) {
        if (!watchlistBody) return;
        watchlistBody.innerHTML = "";

        if (!items.length) {
          var emptyRow = document.createElement("tr");
          emptyRow.innerHTML = "<td colspan='5' class='muted'>No very low-performing assigned students found.</td>";
          watchlistBody.appendChild(emptyRow);
          return;
        }

        items.forEach(function (item) {
          var row = document.createElement("tr");
          row.innerHTML =
            "<td>" + (item.name || "Student") + " (" + (item.studentId || "") + ")</td>" +
            "<td>" + Number(item.currentCgpa || 0).toFixed(2) + "</td>" +
            "<td><span class='badge " + riskBadgeClass(item.attendanceRisk) + "'>" + String(item.attendanceRisk || "low").toUpperCase() + "</span></td>" +
            "<td><span class='badge " + riskBadgeClass(item.ctRisk) + "'>" + String(item.ctRisk || "low").toUpperCase() + "</span></td>" +
            "<td><button class='btn btn-primary' type='button' data-action='quick-sms' data-user-id='" + (item.userId || "") + "' data-student-name='" + (item.name || "Student") + "'>Send SMS for Meeting</button></td>";
          watchlistBody.appendChild(row);
        });
      }

      function loadWatchlist() {
        apiRequest("/portal/advisor/performance-watchlist", { method: "GET" }).then(function (payload) {
          var items = (((payload || {}).data || {}).items) || [];
          renderWatchlist(items);
          populateStudentSelect(items);
        }).catch(function (error) {
          if (watchlistBody) {
            watchlistBody.innerHTML = "";
            var errRow = document.createElement("tr");
            errRow.innerHTML = "<td colspan='5' class='muted'>Could not load watchlist.</td>";
            watchlistBody.appendChild(errRow);
          }
          populateStudentSelect([]);
          showToast(error.message || "Could not load performance watchlist.");
        });
      }

      if (watchlistBody) {
        watchlistBody.addEventListener("click", function (event) {
          var btn = event.target.closest("button[data-action='quick-sms']");
          if (!btn || !studentSelect) return;
          var userId = btn.getAttribute("data-user-id") || "";
          if (userId) {
            studentSelect.value = userId;
          }
          if (smsMessageEl && !smsMessageEl.value.trim()) {
            var studentName = btn.getAttribute("data-student-name") || "Student";
            smsMessageEl.value = "Please meet me this week regarding your current academic performance and an improvement plan, " + studentName + ".";
          }
          showToast("Student selected for quick SMS.");
        });
      }

      loadWatchlist();

      if (smsForm) {
        smsForm.addEventListener("submit", function (event) {
          event.preventDefault();
          var targetUserId = (document.getElementById("student") || {}).value || "";
          var selectedOption = studentSelect ? studentSelect.options[studentSelect.selectedIndex] : null;
          var studentName = selectedOption ? (selectedOption.dataset.studentName || selectedOption.text || "Student") : "Student";
          var message = (document.getElementById("message") || {}).value || "";
          if (!targetUserId) {
            showToast("Please select a student first.");
            return;
          }
          if (!message.trim()) {
            showToast("Please write an SMS before sending.");
            return;
          }

          apiRequest("/portal/messages", {
            method: "POST",
            body: {
              toRole: "student",
              toUserId: targetUserId,
              toName: studentName,
              subject: "Performance Consultation Meeting",
              content: message.trim(),
              channel: "sms"
            }
          }).then(function () {
            messages.unshift({
              id: Date.now(),
              date: new Date().toISOString(),
              from: "advisor",
              to: "student",
              studentName: studentName,
              subject: "Performance Consultation Meeting",
              message: message.trim(),
              status: "sent"
            });
            safeWrite(STORAGE_KEYS.messages, messages);
            smsForm.reset();
            showToast("SMS sent successfully.");
          }).catch(function (error) {
            showToast(error.message || "Failed to send SMS.");
          });
        });
      }
    }
  }

  function initRoleNoticePages() {
    var isStudentNoticePage = /student-notices\.html$/i.test(window.location.pathname);
    var isAdvisorNoticePage = /advisor-notices\.html$/i.test(window.location.pathname);
    if (!isStudentNoticePage && !isAdvisorNoticePage) return;

    var tableBody = document.getElementById("roleNoticePageTableBody");
    var detailTitle = document.getElementById("roleNoticePageDetailTitle");
    var detailMeta = document.getElementById("roleNoticePageDetailMeta");
    var detailBody = document.getElementById("roleNoticePageDetailBody");
    if (!tableBody) return;

    function badgeCls(priority) {
      var p = String(priority || "").toLowerCase();
      if (p === "urgent") return "badge-danger";
      if (p === "important") return "badge-warning";
      return "badge-success";
    }

    function targetLabel(target) {
      if (target === "students_advisors") return "Students + Advisors";
      if (target === "advisors") return "Advisors";
      return "Students";
    }

    function showNoticeDetail(item) {
      if (detailTitle) detailTitle.textContent = item.title || "Notice";
      if (detailMeta) detailMeta.textContent = formatDate(item.publishedAt || item.createdAt || item.updatedAt) + " | " + targetLabel(item.target) + " | " + String(item.priority || "normal").toUpperCase();
      if (detailBody) detailBody.textContent = item.content || "No details available.";
    }

    function render(items) {
      tableBody.innerHTML = "";
      if (!items.length) {
        var empty = document.createElement("tr");
        empty.innerHTML = "<td colspan='4' class='muted'>No notices found.</td>";
        tableBody.appendChild(empty);
        return;
      }

      items.forEach(function (item, idx) {
        var row = document.createElement("tr");
        row.style.cursor = "pointer";
        row.innerHTML =
          "<td>" + formatDate(item.publishedAt || item.createdAt || item.updatedAt) + "</td>" +
          "<td>" + (item.title || "Notice") + "</td>" +
          "<td><span class='badge " + badgeCls(item.priority) + "'>" + String(item.priority || "normal").toUpperCase() + "</span></td>" +
          "<td>" + targetLabel(item.target) + "</td>";
        row.addEventListener("click", function () {
          showNoticeDetail(item);
        });
        tableBody.appendChild(row);

        if (idx === 0) showNoticeDetail(item);
      });
    }

    apiRequest("/portal/notices", { method: "GET" }).then(function (payload) {
      var items = (((payload || {}).data || {}).items) || [];
      render(items);
    }).catch(function () {
      render([]);
    });
  }

  function initAccountSettingsPage() {
    var isStudentSettings = /student-settings\.html$/i.test(window.location.pathname);
    var isAdvisorSettings = /advisor-settings\.html$/i.test(window.location.pathname);
    var isAdminSettings = /admin-settings\.html$/i.test(window.location.pathname);
    if (!isStudentSettings && !isAdvisorSettings && !isAdminSettings) return;

    var form = document.getElementById("accountSettingsForm");
    if (!form) return;

    var nameEl = document.getElementById("settingsName");
    var emailEl = document.getElementById("settingsEmail");
    var currentPasswordEl = document.getElementById("settingsCurrentPassword");
    var newPasswordEl = document.getElementById("settingsNewPassword");
    var confirmPasswordEl = document.getElementById("settingsConfirmPassword");

    var studentIdEl = document.getElementById("settingsStudentId");
    var batchEl = document.getElementById("settingsBatch");
    var studentDepartmentEl = document.getElementById("settingsStudentDepartment");

    var advisorIdEl = document.getElementById("settingsAdvisorId");
    var advisorDepartmentEl = document.getElementById("settingsAdvisorDepartment");
    var batchFocusEl = document.getElementById("settingsBatchFocus");

    var adminAccountIdEl = document.getElementById("settingsAdminAccountId");

    function fillFromProfile(data) {
      var user = (data || {}).user || {};
      var profile = (data || {}).profile || {};

      if (nameEl) nameEl.value = user.name || "";
      if (emailEl) emailEl.value = user.email || "";

      if (studentIdEl) studentIdEl.value = profile.studentId || "";
      if (batchEl) batchEl.value = profile.batch || "";
      if (studentDepartmentEl) studentDepartmentEl.value = profile.department || "";

      if (advisorIdEl) advisorIdEl.value = profile.advisorId || "";
      if (advisorDepartmentEl) advisorDepartmentEl.value = profile.department || "";
      if (batchFocusEl) batchFocusEl.value = profile.batchFocus || "";

      if (adminAccountIdEl) adminAccountIdEl.value = profile._id || user.id || "";
    }

    apiRequest("/auth/me", { method: "GET" }).then(function (payload) {
      fillFromProfile((payload || {}).data || {});
    }).catch(function (error) {
      showToast(error.message || "Could not load account settings.");
    });

    form.addEventListener("submit", function (event) {
      event.preventDefault();

      var body = {
        name: (nameEl || {}).value || "",
        email: (emailEl || {}).value || "",
        currentPassword: (currentPasswordEl || {}).value || "",
        newPassword: (newPasswordEl || {}).value || "",
        confirmPassword: (confirmPasswordEl || {}).value || ""
      };

      if (isStudentSettings) {
        body.studentId = (studentIdEl || {}).value || "";
        body.batch = (batchEl || {}).value || "";
        body.department = (studentDepartmentEl || {}).value || "";
      }

      if (isAdvisorSettings) {
        body.advisorId = (advisorIdEl || {}).value || "";
        body.department = (advisorDepartmentEl || {}).value || "";
        body.batchFocus = (batchFocusEl || {}).value || "";
      }

      apiRequest("/auth/me", { method: "PUT", body: body }).then(function (payload) {
        var data = (payload || {}).data || {};
        var user = data.user || {};
        var prev = getSession() || {};
        var newSession = {
          token: data.token || prev.token,
          userId: user.id || prev.userId || "",
          role: user.role || prev.role || "",
          name: user.name || prev.name || "",
          email: user.email || prev.email || "",
          profile: data.profile || prev.profile || {},
          loginAt: prev.loginAt || new Date().toISOString()
        };
        safeWrite(STORAGE_KEYS.session, newSession);
        hydrateUserUi(newSession);

        if (currentPasswordEl) currentPasswordEl.value = "";
        if (newPasswordEl) newPasswordEl.value = "";
        if (confirmPasswordEl) confirmPasswordEl.value = "";

        showToast((payload || {}).message || "Account updated successfully.");
      }).catch(function (error) {
        showToast(error.message || "Could not update account settings.");
      });
    });
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
    initAdvisorStudentProfile();
    initRoleNoticeBoards();
    initRoleNoticePages();
    initCumulativeCgpaPage();
    initMessages();
    initAccountSettingsPage();
  });
})();
