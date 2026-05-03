import { getCurrentUser, loginUser, registerUser } from "../services/auth.service.js";
import { issueCsrfToken } from "../middlewares/csrf.middleware.js";
import { sendSuccess } from "../utils/apiResponse.js";
import { authCookieOptions, AUTH_COOKIE_NAME, signAuthToken } from "../utils/jwt.js";

export const login = async (req, res) => {
  const user = await loginUser(req.body);
  const token = signAuthToken(user);

  res.cookie(AUTH_COOKIE_NAME, token, authCookieOptions);
  sendSuccess(res, { data: { user }, message: "Logged in successfully" });
};

export const register = async (req, res) => {
  const user = await registerUser(req.body);
  const token = signAuthToken(user);

  res.cookie(AUTH_COOKIE_NAME, token, authCookieOptions);
  sendSuccess(res, { data: { user }, message: "Account created successfully", status: 201 });
};

export const logout = async (_req, res) => {
  res.clearCookie(AUTH_COOKIE_NAME, { ...authCookieOptions, maxAge: undefined });
  sendSuccess(res, { message: "Logged out successfully" });
};

export const me = async (req, res) => {
  const user = await getCurrentUser(req.user.id);
  sendSuccess(res, { data: { user } });
};

export const csrfToken = async (_req, res) => {
  const token = issueCsrfToken(_req, res);
  sendSuccess(res, { data: { csrfToken: token } });
};
