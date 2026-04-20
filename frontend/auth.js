document.addEventListener("DOMContentLoaded", function () {
  var STORAGE_SESSION = "ar_session_v1";
  var API_BASE = "http://localhost:5000/api";

  var dashboardByRole = {
    admin: "admin-dashboard.html",
    advisor: "advisor-dashboard.html",
    student: "student-dashboard.html"
  };

  var registerByRole = {
    admin: "admin-register.html",
    advisor: "advisor-register.html",
    student: "student-register.html"
  };

  function setSession(sessionData) {
    localStorage.setItem(STORAGE_SESSION, JSON.stringify(sessionData));
  }

  function requestJson(path, method, body) {
    return fetch(API_BASE + path, {
      method: method,
      headers: {
        "Content-Type": "application/json"
      },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (response) {
      return response.json().catch(function () {
        return {};
      }).then(function (payload) {
        if (!response.ok) {
          var errorMessage = payload && payload.message ? payload.message : "Request failed.";
          throw new Error(errorMessage);
        }
        return payload;
      });
    });
  }

  function requestJsonWithToken(path, token) {
    return fetch(API_BASE + path, {
      method: "GET",
      headers: {
        Authorization: "Bearer " + token
      }
    }).then(function (response) {
      return response.json().catch(function () {
        return {};
      }).then(function (payload) {
        if (!response.ok) {
          var errorMessage = payload && payload.message ? payload.message : "Request failed.";
          throw new Error(errorMessage);
        }
        return payload;
      });
    });
  }

  function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
  }

  function getRoleLabel(role) {
    if (role === "admin") return "Admin";
    if (role === "advisor") return "Advisor";
    return "Student";
  }

  var loginForm = document.getElementById("unified-login-form");
  var loginRole = document.getElementById("login-role");
  var goRegister = document.getElementById("go-register");

  if (loginForm && loginRole) {
    var params = new URLSearchParams(window.location.search);
    var roleFromQuery = params.get("role");
    var emailFromQuery = params.get("email");
    var loginEmail = document.getElementById("login-email");
    var loginPassword = document.getElementById("login-password");

    if (roleFromQuery && dashboardByRole[roleFromQuery]) {
      loginRole.value = roleFromQuery;
    }

    if (loginEmail && emailFromQuery) {
      loginEmail.value = emailFromQuery;
    }

    loginForm.addEventListener("submit", function (event) {
      event.preventDefault();

      var selectedRole = loginRole.value;
      var target = dashboardByRole[selectedRole];
      if (!target) {
        alert("Please select a role.");
        return;
      }

      var email = normalizeEmail(loginEmail ? loginEmail.value : "");
      var password = String(loginPassword ? loginPassword.value : "");

      requestJson("/auth/login", "POST", {
        role: selectedRole,
        email: email,
        password: password
      }).then(function (payload) {
        var data = payload.data || {};
        var user = data.user || {};
        var profile = data.profile || null;

        var token = data.token || "";
        var baseSession = {
          token: token,
          userId: user.id || "",
          role: user.role || selectedRole,
          name: user.name || getRoleLabel(selectedRole) + " User",
          email: user.email || email,
          profile: profile,
          loginAt: new Date().toISOString()
        };

        if (!token) {
          setSession(baseSession);
          window.location.href = target;
          return;
        }

        requestJsonWithToken("/auth/me", token).then(function (mePayload) {
          var meData = mePayload.data || {};
          var meUser = meData.user || {};
          var meProfile = meData.profile || profile;

          setSession({
            token: token,
            userId: meUser._id || meUser.id || baseSession.userId,
            role: meUser.role || baseSession.role,
            name: meUser.name || baseSession.name,
            email: meUser.email || baseSession.email,
            profile: meProfile,
            loginAt: baseSession.loginAt
          });

          window.location.href = target;
        }).catch(function () {
          setSession(baseSession);
          window.location.href = target;
        });
      }).catch(function (error) {
        alert(error.message || "Login failed.");
      });
    });
  }

  if (goRegister && loginRole) {
    goRegister.addEventListener("click", function () {
      var selectedRole = loginRole.value;
      var target = registerByRole[selectedRole];
      if (!target) {
        alert("Select a role first, then open registration.");
        return;
      }

      window.location.href = target;
    });
  }

  var registerRoleSwitch = document.getElementById("register-role-switch");
  if (registerRoleSwitch) {
    registerRoleSwitch.addEventListener("change", function (event) {
      var selectedRole = event.target.value;
      var target = registerByRole[selectedRole];
      if (target) {
        window.location.href = target;
      }
    });
  }

  var roleRegisterForm = document.querySelector(".role-register-form");
  if (roleRegisterForm) {
    roleRegisterForm.addEventListener("submit", function (event) {
      event.preventDefault();

      var role = roleRegisterForm.getAttribute("data-role") || "student";
      var nameEl = document.getElementById("name");
      var emailEl = document.getElementById("email");
      var passwordEl = document.getElementById("password");
      var confirmEl = document.getElementById("confirm");

      var name = String(nameEl ? nameEl.value : "").trim();
      var email = normalizeEmail(emailEl ? emailEl.value : "");
      var password = String(passwordEl ? passwordEl.value : "");
      var confirm = String(confirmEl ? confirmEl.value : "");

      if (!name || !email || !password) {
        alert("Please complete all required fields.");
        return;
      }

      if (password !== confirm) {
        alert("Password and confirm password must match.");
        return;
      }

      var payload = {
        role: role,
        name: name,
        email: email,
        password: password
      };

      if (role === "student") {
        payload.studentId = String((document.getElementById("id") || {}).value || "").trim();
        payload.department = String((document.getElementById("dept") || {}).value || "").trim();
        payload.batch = String((document.getElementById("batch") || {}).value || "").trim();
      }

      if (role === "advisor") {
        payload.advisorId = String((document.getElementById("employeeId") || {}).value || "").trim();
        payload.department = String((document.getElementById("dept") || {}).value || "").trim();
        payload.batchFocus = String((document.getElementById("batchFocus") || {}).value || "").trim();
      }

      requestJson("/auth/register", "POST", payload).then(function () {
        alert("Registration complete. Please login now.");
        window.location.href = "login.html?role=" + encodeURIComponent(role) + "&email=" + encodeURIComponent(email);
      }).catch(function (error) {
        alert(error.message || "Registration failed.");
      });
    });
  }
});
