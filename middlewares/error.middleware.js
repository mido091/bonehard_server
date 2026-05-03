import { isDevelopment } from "../config/env.js";
import { ApiError } from "../utils/apiResponse.js";

export const notFoundHandler = (req, _res, next) => {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
};

export const errorHandler = (err, _req, res, _next) => {
  const status = err.status || 500;

  // Only log real server-side errors (5xx), not expected client errors (4xx)
  if (status >= 500) {
    console.error("Server error", {
      name: err.name,
      message: err.message,
      status,
    });
  }

  res.status(status).json({
    data: null,
    meta: err.details ? { details: err.details } : null,
    message: status === 500 && !isDevelopment ? "Internal server error" : err.message,
  });
};
