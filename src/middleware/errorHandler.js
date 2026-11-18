const logger = require("../utils/logger");

function errorHandler(err, req, res, _next) {
  logger.error(`${req.method} ${req.url} — ${err.message}`, { stack: err.stack });

  res.status(err.status || 500).json({
    error: err.message || "Internal server error",
  });
}

module.exports = errorHandler;
