(function () {
  var STORAGE_KEYS = {
    attendance: "ar_attendance_v1",
    courses: "ar_courses_v1",
    semesterSetup: "ar_semester_setup_v1",
    semesterCgpa: "ar_semester_cgpa_v1",
    notices: "ar_notices_v1",
    assignments: "ar_advisor_assignments_v1",
    messages: "ar_messages_v1"
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
        }
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

      var tr = document.createElement("tr");
      tr.innerHTML = "<td>" + code.trim().toUpperCase() + "</td>" +
        "<td>" + name.trim() + "</td>" +
        "<td>" + credit + "</td>" +
        "<td>" + teacher.trim() + "</td>" +
        "<td><span class='badge badge-success'>Active</span></td>";

      if (tableBody) {
        tableBody.prepend(tr);
      }

      var courses = safeRead(STORAGE_KEYS.courses, []);
      courses.unshift({
        code: code.trim().toUpperCase(),
        name: name.trim(),
        credit: credit,
        teacher: teacher.trim(),
        date: new Date().toISOString()
      });
      safeWrite(STORAGE_KEYS.courses, courses);

      addCourseForm.reset();
      showToast("Course added to current list.");
    });

    setupForm.addEventListener("submit", function (event) {
      event.preventDefault();
      var semester = (document.getElementById("semester") || {}).value || "";
      var totalCredit = (document.getElementById("totalCredit") || {}).value || "0";
      var targetCgpa = (document.getElementById("targetCgpa") || {}).value || "0";

      safeWrite(STORAGE_KEYS.semesterSetup, {
        semester: semester,
        totalCredit: Number(totalCredit) || 0,
        targetCgpa: Number(targetCgpa) || 0,
        updatedAt: new Date().toISOString()
      });

      showToast("Semester setup saved.");
    });
  }

  function initSemesterCgpaPage() {
    if (!/student-semester-cgpa\.html$/i.test(window.location.pathname)) {
      return;
    }

    var form = document.querySelector("form");
    var historyBody = document.querySelector("table tbody");
    if (!form || !historyBody) return;

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var semester = (document.getElementById("semester") || {}).value || "";
      var cgpaVal = Number((document.getElementById("cgpa") || {}).value || 0);
      var note = (document.getElementById("note") || {}).value || "";

      if (!semester || !cgpaVal) {
        showToast("Please enter valid semester and CGPA.");
        return;
      }

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

      var existingRow = Array.from(historyBody.querySelectorAll("tr")).find(function (tr) {
        return tr.children[0] && tr.children[0].textContent.trim() === semester;
      });

      var trendText = "Stable";
      var trendClass = "badge-warning";
      if (entries.length > 1) {
        var previous = entries.find(function (x) { return x.semester !== semester; });
        if (previous) {
          if (cgpaVal > previous.cgpa) {
            trendText = "Up";
            trendClass = "badge-success";
          } else if (cgpaVal < previous.cgpa) {
            trendText = "Down";
            trendClass = "badge-danger";
          }
        }
      }

      if (existingRow) {
        existingRow.children[1].textContent = cgpaVal.toFixed(2);
        existingRow.children[2].innerHTML = "<span class='badge " + trendClass + "'>" + trendText + "</span>";
      } else {
        var row = document.createElement("tr");
        row.innerHTML = "<td>" + semester + "</td><td>" + cgpaVal.toFixed(2) + "</td><td><span class='badge " + trendClass + "'>" + trendText + "</span></td>";
        historyBody.prepend(row);
      }

      showToast("Semester CGPA updated.");
    });
  }

  function initAdminNotices() {
    if (!/admin-notices\.html$/i.test(window.location.pathname)) {
      return;
    }

    var form = document.querySelector("form");
    var tableBody = document.querySelector("table tbody");
    if (!form || !tableBody) return;

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

      var statusClass = priority === "Urgent" ? "badge-danger" : "badge-success";
      var statusText = priority === "Urgent" ? "Urgent" : "Published";

      var row = document.createElement("tr");
      row.innerHTML = "<td>" + formatDate() + "</td><td>" + title.trim() + "</td><td>" + target + "</td><td><span class='badge " + statusClass + "'>" + statusText + "</span></td>";
      tableBody.prepend(row);

      var notices = safeRead(STORAGE_KEYS.notices, []);
      notices.unshift({ date: new Date().toISOString(), title: title.trim(), target: target, priority: priority, content: content.trim() });
      safeWrite(STORAGE_KEYS.notices, notices);

      form.reset();
      showToast("Notice published.");
    });
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

      if (helper) {
        helper.textContent = teacher + " assigned as advisor for student serial " + startId + "-" + endId + ".";
      }

      if (historyBody) {
        var row = document.createElement("tr");
        row.innerHTML = "<td>" + formatDate() + "</td><td>" + teacher + "</td><td>" + batch.replace("Batch ", "") + "</td><td>" + startId + "-" + endId + "</td><td><span class='badge badge-success'>Assigned</span></td>";
        historyBody.prepend(row);
      }

      var assignments = safeRead(STORAGE_KEYS.assignments, []);
      assignments.unshift({ date: new Date().toISOString(), batch: batch, teacher: teacher, startId: startId, endId: endId });
      safeWrite(STORAGE_KEYS.assignments, assignments);

      showToast("Advisor assignment saved.");
    });
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

    if (isStudentPage) {
      var studentForm = document.querySelector("form");
      var tableBody = document.querySelector("table tbody");
      if (studentForm && tableBody) {
        studentForm.addEventListener("submit", function (event) {
          event.preventDefault();
          var advisor = (document.getElementById("advisor") || {}).value || "Advisor";
          var subject = (document.getElementById("subject") || {}).value || "General";
          var message = (document.getElementById("message") || {}).value || "";

          if (!subject.trim() || !message.trim()) {
            showToast("Please fill subject and message.");
            return;
          }

          var item = {
            id: Date.now(),
            date: new Date().toISOString(),
            from: "student",
            to: "advisor",
            toName: advisor,
            studentName: "Student Name",
            subject: subject.trim(),
            message: message.trim(),
            status: "Pending"
          };

          messages.unshift(item);
          safeWrite(STORAGE_KEYS.messages, messages);

          var row = document.createElement("tr");
          row.innerHTML = "<td>" + formatDate() + "</td><td>" + item.subject + "</td><td><span class='badge badge-warning'>Pending</span></td>";
          tableBody.prepend(row);

          studentForm.reset();
          showToast("Message sent to advisor.");
        });
      }
    }

    if (isAdvisorPage) {
      var advisorTableBody = document.querySelector("table tbody");
      var advisorForm = document.querySelectorAll("form")[0];

      if (advisorTableBody) {
        var studentMsgs = messages.filter(function (msg) {
          return msg.to === "advisor";
        });

        studentMsgs.forEach(function (msg) {
          var row = document.createElement("tr");
          var cls = msg.status === "New" || msg.status === "Pending" ? "badge-warning" : "badge-success";
          row.innerHTML = "<td>" + formatDate() + "</td><td>" + (msg.studentName || "Student") + "</td><td>" + msg.message + "</td><td><span class='badge " + cls + "'>" + (msg.status || "New") + "</span></td>";
          advisorTableBody.prepend(row);
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

          messages.unshift({
            id: Date.now(),
            date: new Date().toISOString(),
            from: "advisor",
            to: "student",
            studentName: toStudent,
            subject: subject.trim(),
            message: sms.trim(),
            status: "Replied"
          });
          safeWrite(STORAGE_KEYS.messages, messages);
          advisorForm.reset();
          showToast("Reply sent to student.");
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

          messages.unshift({
            id: Date.now(),
            date: new Date().toISOString(),
            from: "advisor",
            to: "student",
            studentName: student,
            subject: "Risk Meeting",
            message: message.trim(),
            status: "Sent"
          });
          safeWrite(STORAGE_KEYS.messages, messages);
          showToast("SMS sent successfully.");
        });
      }
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
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
