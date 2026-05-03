export const sendSuccess = (res, { data = null, meta = null, message = "OK", status = 200 } = {}) => {
  res.status(status).json({
    data,
    meta,
    message,
  });
};

export class ApiError extends Error {
  constructor(status, message, details = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

export const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};
