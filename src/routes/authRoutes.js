const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { login, me, logout, updatePassword } = require("../controllers/authController");

const router = express.Router();

router.post("/login", login);
router.get("/me", requireAuth, me);
router.post("/logout", requireAuth, logout);
router.patch("/password", requireAuth, updatePassword);

module.exports = router;
