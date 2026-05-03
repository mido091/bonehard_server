import { getUserById } from "../repositories/user.repository.js";
import { ApiError } from "../utils/apiResponse.js";
import { AUTH_COOKIE_NAME, verifyAuthToken } from "../utils/jwt.js";

export const requireAuth = async (req, _res, next) => {
  try {
    const token = req.cookies?.[AUTH_COOKIE_NAME];

    if (!token) {
      throw new ApiError(401, "Authentication required");
    }

    const payload = verifyAuthToken(token);
    const user = await getUserById(payload.sub);

    if (!user) {
      throw new ApiError(401, "Invalid session");
    }

    if (user.isActive !== undefined && !user.isActive) {
      throw new ApiError(403, "This account is disabled");
    }

    req.user = user;
    next();
  } catch (error) {
    next(error instanceof ApiError ? error : new ApiError(401, "Invalid session"));
  }
};

export const requireRoles = (...roles) => (req, _res, next) => {
  if (!req.user) {
    throw new ApiError(401, "Authentication required");
  }

  if (!roles.includes(req.user.role)) {
    throw new ApiError(403, "You do not have permission to access this resource");
  }

  next();
};

export const requireAdminOnly = requireRoles("admin");
export const requireAdminOrAssistant = requireRoles("admin", "assistant");
export const requireAdminDashboard = requireAdminOrAssistant;
export const requireUserDashboard = requireRoles("user");
