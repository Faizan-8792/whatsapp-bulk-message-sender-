const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const env = require("../config/env");
const asyncHandler = require("../utils/asyncHandler");
const HttpError = require("../utils/httpError");

function signToken(userId, rememberMe) {
  return jwt.sign({ sub: userId }, env.jwtSecret, {
    expiresIn: rememberMe ? env.jwtRememberExpiresIn : env.jwtSessionExpiresIn,
  });
}

const login = asyncHandler(async (req, res) => {
  const { userId, password, rememberMe = false } = req.body || {};
  if (!userId || !password) {
    throw new HttpError(400, "User ID and password are required");
  }

  const user = await User.findOne({ userId: String(userId).trim() });
  if (!user) {
    throw new HttpError(401, "Invalid credentials");
  }

  const passwordValid = await user.verifyPassword(password);
  if (!passwordValid) {
    throw new HttpError(401, "Invalid credentials");
  }

  user.lastLoginAt = new Date();
  await user.save();

  const token = signToken(user._id.toString(), rememberMe);
  return res.json({
    token,
    user: user.toSafeObject(),
  });
});

const me = asyncHandler(async (req, res) => {
  return res.json({
    user: req.user.toSafeObject(),
  });
});

const logout = asyncHandler(async (req, res) => {
  return res.json({
    success: true,
  });
});

const updatePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    throw new HttpError(400, "Current password and new password are required");
  }

  const isCurrentValid = await req.user.verifyPassword(currentPassword);
  if (!isCurrentValid) {
    throw new HttpError(400, "Current password is incorrect");
  }

  if (newPassword.length < 6) {
    throw new HttpError(400, "New password must be at least 6 characters");
  }

  req.user.passwordHash = await bcrypt.hash(newPassword, 10);
  await req.user.save();

  return res.json({ success: true });
});

module.exports = {
  login,
  me,
  logout,
  updatePassword,
};
