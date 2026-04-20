(function () {
  var API_BASE = "http://localhost:5000/api";

  var STORAGE_KEYS = {
    session: "ar_session_v1",
    attendance: "ar_attendance_v1",
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
    "student-cumulative-cgpa.html": "student",
    "student-message-advisor.html": "student"
  };

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

  function formatDate() {
    return new Date().toLocaleDateString("en-GB", {
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

  function initAttendancePage() {
    var summaryRows = document.querySelectorAll("tr[data-summary-course]");
    var selectors = document.querySelectorAll("select.att-state[data-course]");
    if (!summaryRows.length || !selectors.length) {
      return;
    }

    var courseCodes = Array.from(summaryRows).map(function (row) {
      return row.getAttribute("data-summary-course");
    });

    var stored = safeRead(STORAGE_KEYS.attendance, {});

    selectors.forEach(function (select, index) {
      if (stored[index] !== undefined) {
        select.value = stored[index];
      }
    });

    function getPredictedMark(percent) {
      if (percent >= 90) return 30;
      if (percent >= 85) return 27;
      if (percent >= 80) return 24;
      return 0;
    }

    function getRisk(percent) {
      if (percent >= 90) return { text: "Good", cls: "badge-success" };
      if (percent >= 80) return { text: "Watch", cls: "badge-warning" };
      return { text: "Critical", cls: "badge-danger" };
    }

    function updateCourseSummary(courseCode) {
      var courseSelects = document.querySelectorAll('select.att-state[data-course="' + courseCode + '"]');
      var row = document.querySelector('tr[data-summary-course="' + courseCode + '"]');
      if (!row) return;

      var present = Array.from(courseSelects).filter(function (el) {
        return el.value === "P";
      }).length;
      var absent = Array.from(courseSelects).filter(function (el) {
        return el.value === "A";
      }).length;
      var held = present + absent;
      var percent = held === 0 ? 0 : Math.round((present / held) * 100);
      var mark = getPredictedMark(percent);
      var risk = getRisk(percent);

      row.children[1].textContent = String(held);
      row.querySelector(".attended-cell").textContent = String(present);
      row.querySelector(".percent-cell").textContent = percent + "%";
      row.querySelector(".mark-cell").textContent = String(mark);

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

    function runAll() {
      courseCodes.forEach(updateCourseSummary);
      updateOverall();
      var values = Array.from(selectors).map(function (el) {
        return el.value;
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
          showToast("Attendance data saved locally.");
        });
      }
    });

    runAll();
  }

  function initCtMarksPage() {
    if (!/student-ct-marks\.html$/i.test(window.location.pathname)) {
      return;
    }

    var rows = document.querySelectorAll("tbody tr");
    if (!rows.length) return;

    function getPerformance(total) {
      if (total >= 50) return { text: "Strong", cls: "badge-success" };
      if (total >= 36) return { text: "Average", cls: "badge-warning" };
      return { text: "Low", cls: "badge-danger" };
    }

    function recompute() {
      var totals = [];

      rows.forEach(function (row) {
        var inputs = row.querySelectorAll("input[type='number']");
        if (!inputs.length) return;

        var sum = 0;
        inputs.forEach(function (input) {
          var val = Number(input.value) || 0;
          if (val < 0) val = 0;
          if (val > 20) val = 20;
          input.value = String(val);
          sum += val;
        });

        totals.push(sum);
        var totalCell = row.children[4];
        var badge = row.querySelector("td:last-child .badge");
        if (totalCell) totalCell.textContent = String(sum);
        if (badge) {
          var perf = getPerformance(sum);
          badge.className = "badge " + perf.cls;
          badge.textContent = perf.text;
        }
      });

      if (!totals.length) return;
      var average = Math.round(totals.reduce(function (a, b) { return a + b; }, 0) / totals.length);
      var avgStrong = document.querySelectorAll(".stats strong")[0];
      if (avgStrong) {
        avgStrong.textContent = String(average);
      }

      var bestIndex = totals.indexOf(Math.max.apply(null, totals));
      var lowIndex = totals.indexOf(Math.min.apply(null, totals));
      var courseNames = Array.from(rows).map(function (row) { return row.children[0].textContent.trim(); });
      var statStrongEls = document.querySelectorAll(".grid.grid-3 .stats strong");
      if (statStrongEls[1]) {
        statStrongEls[1].textContent = courseNames[bestIndex] || "-";
      }
      if (statStrongEls[2]) {
        statStrongEls[2].textContent = courseNames[lowIndex] || "-";
      }
    }

    document.querySelectorAll("input[type='number']").forEach(function (input) {
      input.addEventListener("input", recompute);
    });

    document.querySelectorAll("button").forEach(function (btn) {
      if (/save ct marks/i.test(btn.textContent || "")) {
        btn.addEventListener("click", function () {
          recompute();
          showToast("CT marks saved locally.");
        });
      }
    });

    recompute();
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

    function renderCourseRow(item) {
      if (!tableBody || !item || !item.course) return;
      var tr = document.createElement("tr");
      tr.innerHTML = "<td>" + (item.course.code || "") + "</td>" +
        "<td>" + (item.course.name || "") + "</td>" +
        "<td>" + (item.course.credit || "") + "</td>" +
        "<td>" + (item.course.teacherName || "") + "</td>" +
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
              credit: course.credit,
              teacherName: course.teacher
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
      var teacher = (document.getElementById("teacher") || {}).value || "";

      if (!code.trim() || !name.trim() || !teacher.trim()) {
        showToast("Please fill course code, name and teacher.");
        return;
      }

      var requestBody = {
        code: code.trim().toUpperCase(),
        name: name.trim(),
        credit: Number(credit) || 0,
        teacherName: teacher.trim(),
        semester: (semesterEl || {}).value || "Spring 2026"
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
          credit: String(requestBody.credit),
          teacher: requestBody.teacherName,
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
  }

  function initSemesterCgpaPage() {
    if (!/student-semester-cgpa\.html$/i.test(window.location.pathname)) {
      return;
    }

    var form = document.querySelector("form");
    var historyBody = document.querySelector("table tbody");
    if (!form || !historyBody) return;

    function trendView(trend) {
      if (trend === "up") return { text: "Up", cls: "badge-success" };
      if (trend === "down") return { text: "Down", cls: "badge-danger" };
      return { text: "Stable", cls: "badge-warning" };
    }

    function renderHistory(items) {
      historyBody.innerHTML = "";
      items.forEach(function (item) {
        var trend = trendView(item.trend);
        var row = document.createElement("tr");
        row.innerHTML = "<td>" + item.semesterLabel + "</td><td>" + Number(item.cgpa || 0).toFixed(2) + "</td><td><span class='badge " + trend.cls + "'>" + trend.text + "</span></td>";
        historyBody.appendChild(row);
      });
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
      if (studentForm && tableBody) {
        loadMessagesFromApi(function (items) {
          tableBody.innerHTML = "";
          items.filter(function (msg) {
            return msg.from === "student";
          }).forEach(function (msg) {
            var row = document.createElement("tr");
            row.innerHTML = "<td>" + formatDate() + "</td><td>" + (msg.subject || "") + "</td><td><span class='badge " + statusClass(msg.status) + "'>" + (msg.status || "Pending") + "</span></td>";
            tableBody.appendChild(row);
          });
        });

        studentForm.addEventListener("submit", function (event) {
          event.preventDefault();
          var advisor = (document.getElementById("advisor") || {}).value || "Advisor";
          var subject = (document.getElementById("subject") || {}).value || "General";
          var message = (document.getElementById("message") || {}).value || "";

          if (!subject.trim() || !message.trim()) {
            showToast("Please fill subject and message.");
            return;
          }

          apiRequest("/portal/messages", {
            method: "POST",
            body: {
              toRole: "advisor",
              advisorName: advisor,
              subject: subject.trim(),
              content: message.trim(),
              channel: "portal"
            }
          }).then(function () {
            messages.unshift({
              id: Date.now(),
              date: new Date().toISOString(),
              from: "student",
              to: "advisor",
              subject: subject.trim(),
              message: message.trim(),
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
                row.innerHTML = "<td>" + formatDate() + "</td><td>" + (msg.subject || "") + "</td><td><span class='badge " + statusClass(msg.status) + "'>" + (msg.status || "Pending") + "</span></td>";
                tableBody.appendChild(row);
              });
            });
            showToast("Message sent to advisor.");
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
    initAdminNotices();
    initAdvisorAssignment();
    initAdvisorRanking();
    initMessages();
  });
})();
