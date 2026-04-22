const express = require("express");

const { register, login, me, updateMe, logout } = require("../controllers/auth.controller");
const { authGuard } = require("../middleware/auth.middleware");

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.get("/me", authGuard, me);
router.put("/me", authGuard, updateMe);
router.post("/logout", authGuard, logout);

module.exports = router;
