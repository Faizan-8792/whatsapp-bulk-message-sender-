const path = require("path");
const dotenv = require("dotenv");

dotenv.config({
  path: path.resolve(process.cwd(), ".env"),
});

const rawClientOrigins =
  process.env.CLIENT_ORIGIN ||
  process.env.CLIENT_ORIGINS ||
  "http://localhost:3000";

const clientOrigins = rawClientOrigins
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 5000),
  mongoUri:
    process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/whatsapp-event-sender-pro",
  clientOrigin: clientOrigins[0] || "http://localhost:3000",
  clientOrigins,
  jwtSecret: process.env.JWT_SECRET || "change-me-in-production",
  jwtSessionExpiresIn: process.env.JWT_SESSION_EXPIRES_IN || "8h",
  jwtRememberExpiresIn: process.env.JWT_REMEMBER_EXPIRES_IN || "30d",
  defaultAdminUser: process.env.DEFAULT_ADMIN_USER || "farazdalle@gmail.com",
  defaultAdminPassword: process.env.DEFAULT_ADMIN_PASSWORD || "faraz@69",
  defaultCountryCode: String(process.env.DEFAULT_COUNTRY_CODE || "91"),
  defaultDelayMinMs: Number(process.env.DEFAULT_DELAY_MIN_MS || 4200),
  defaultDelayMaxMs: Number(process.env.DEFAULT_DELAY_MAX_MS || 9200),
  defaultRetryLimit: Number(process.env.DEFAULT_RETRY_LIMIT || 2),
  uploadDir: process.env.UPLOAD_DIR || "uploads",
  maxFileSizeMb: Number(process.env.MAX_FILE_SIZE_MB || 10),
  whatsappAuthDir: process.env.WHATSAPP_AUTH_DIR || ".wwebjs_auth",
  puppeteerExecutablePath: process.env.PUPPETEER_EXECUTABLE_PATH || "",
};

module.exports = env;
