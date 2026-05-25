const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
const env = require("./config/env");
const { notFoundHandler, errorHandler } = require("./middleware/error");

const authRoutes = require("./routes/authRoutes");
const campaignRoutes = require("./routes/campaignRoutes");
const contactRoutes = require("./routes/contactRoutes");
const templateRoutes = require("./routes/templateRoutes");
const whatsappRoutes = require("./routes/whatsappRoutes");
const logRoutes = require("./routes/logRoutes");

const app = express();
app.set("trust proxy", 1);

const corsOptions = {
  origin(origin, callback) {
    if (!origin) {
      callback(null, true);
      return;
    }
    if (env.clientOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
};

app.use(cors(corsOptions));

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
  }),
);
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan(env.nodeEnv === "development" ? "dev" : "combined"));

app.use(
  "/uploads",
  express.static(path.resolve(process.cwd(), env.uploadDir), {
    setHeaders: (res) => {
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    },
  }),
);

app.get("/api/health", (req, res) => {
  return res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/campaigns", campaignRoutes);
app.use("/api/contacts", contactRoutes);
app.use("/api/templates", templateRoutes);
app.use("/api/whatsapp", whatsappRoutes);
app.use("/api/logs", logRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
