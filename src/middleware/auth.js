const jwt = require("jsonwebtoken");
const User = require("../models/User");
const env = require("../config/env");

function extractToken(req) {
  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ")) {
    return header.slice(7).trim();
  }
  if (req.cookies?.token) {
    return req.cookies.token;
  }
  return null;
}

async function requireAuth(req, res, next) {
  try {
    const token = extractToken(req);
    if (!token) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const payload = jwt.verify(token, env.jwtSecret);
    const user = await User.findById(payload.sub);
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    req.user = user;
    req.authToken = token;
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

module.exports = {
  requireAuth,
};
