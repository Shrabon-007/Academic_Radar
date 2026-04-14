document.addEventListener("DOMContentLoaded", function () {
  var STORAGE_USERS = "ar_users_v1";
  var STORAGE_SESSION = "ar_session_v1";

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

  function getUsers() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_USERS) || "[]");
    } catch (err) {
      return [];
    }
  }

  function setUsers(users) {
    localStorage.setItem(STORAGE_USERS, JSON.stringify(users));
  }

  function setSession(sessionData) {
    localStorage.setItem(STORAGE_SESSION, JSON.stringify(sessionData));
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
      var users = getUsers();

      var matchedUser = users.find(function (user) {
        return user.role === selectedRole && user.email === email;
      });

      if (matchedUser && matchedUser.password !== password) {
        alert("Incorrect password for this account.");
        return;
      }

      var sessionUser = matchedUser || {
        role: selectedRole,
        name: getRoleLabel(selectedRole) + " User",
        email: email
      };

      setSession({
        role: sessionUser.role,
        name: sessionUser.name,
        email: sessionUser.email,
        loginAt: new Date().toISOString()
      });

      window.location.href = target;
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

      var users = getUsers();
      var existingIndex = users.findIndex(function (user) {
        return user.role === role && user.email === email;
      });

      var userRecord = {
        role: role,
        name: name,
        email: email,
        password: password,
        updatedAt: new Date().toISOString()
      };

      if (existingIndex >= 0) {
        users[existingIndex] = userRecord;
      } else {
        users.push(userRecord);
      }

      setUsers(users);
      alert("Registration saved. Please login now.");
      window.location.href = "login.html?role=" + encodeURIComponent(role) + "&email=" + encodeURIComponent(email);
    });
  }
});
