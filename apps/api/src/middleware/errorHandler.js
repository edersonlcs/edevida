const { logError } = require("../utils/logger");

function notFoundHandler(req, res) {
  res.status(404).json({
    error: "NOT_FOUND",
    message: `Rota nao encontrada: ${req.method} ${req.originalUrl}`,
  });
}

function errorHandler(err, req, res, _next) {
  const statusCode = err.statusCode || 500;

  logError("request_failed", {
    method: req.method,
    url: req.originalUrl,
    statusCode,
    error: err.message,
  });

  res.status(statusCode).json({
    error: err.code || "INTERNAL_ERROR",
    message: err.message || "Erro interno",
  });
}

module.exports = {
  notFoundHandler,
  errorHandler,
};
