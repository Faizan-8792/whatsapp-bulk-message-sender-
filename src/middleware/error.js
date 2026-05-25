const env = require("../config/env");

function notFoundHandler(req, res) {
  return res.status(404).json({
    message: `Route not found: ${req.originalUrl}`,
  });
}

function errorHandler(error, req, res, next) {
  const statusCode = error.statusCode || 500;
  const message = error.message || "Internal server error";

  if (env.nodeEnv !== "test") {
    // eslint-disable-next-line no-console
    console.error(error);
  }

  return res.status(statusCode).json({
    message,
    details: error.details || null,
    stack: env.nodeEnv === "development" ? error.stack : undefined,
  });
}

module.exports = {
  notFoundHandler,
  errorHandler,
};
