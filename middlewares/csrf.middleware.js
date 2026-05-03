import crypto from "node:crypto";
import { env, isProduction } from "../config/env.js";
import { ApiError } from "../utils/apiResponse.js";

export const CSRF_COOKIE_NAME = "bh_csrf_session";
export const CSRF_HEADER_NAME = "x-csrf-token";

const TOKEN_BYTES = 32;
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const signToken = (token) =>
  crypto.createHmac("sha256", env.jwtSecret).update(token).digest("base64url");

const buildCookieValue = (token) => `${token}.${signToken(token)}`;

const verifyCookieValue = (cookieValue, headerToken) => {
  if (!cookieValue || !headerToken || typeof cookieValue !== "string") return false;
  const [cookieToken, cookieSignature] = cookieValue.split(".");
  if (!cookieToken || !cookieSignature || cookieToken !== headerToken) return false;

  const expectedSignature = signToken(cookieToken);
  if (Buffer.byteLength(cookieSignature) !== Buffer.byteLength(expectedSignature)) {
    return false;
  }
  return crypto.timingSafeEqual(
    Buffer.from(cookieSignature),
    Buffer.from(expectedSignature),
  );
};

export const csrfCookieOptions = {
  httpOnly: true,
  // "none" + secure is required when the frontend and backend are on different
  // origins (e.g. bonehard.vercel.app → bonehard-server.vercel.app).
  // "strict" would silently drop the cookie on cross-origin requests.
  sameSite: isProduction ? "none" : "lax",
  secure: isProduction,
  path: "/",
  maxAge: 8 * 60 * 60 * 1000,
};

export const issueCsrfToken = (_req, res) => {
  const token = crypto.randomBytes(TOKEN_BYTES).toString("base64url");
  res.cookie(CSRF_COOKIE_NAME, buildCookieValue(token), csrfCookieOptions);
  return token;
};

export const csrfProtection = (req, _res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();

  const headerToken = req.get(CSRF_HEADER_NAME);
  if (verifyCookieValue(req.cookies?.[CSRF_COOKIE_NAME], headerToken)) {
    return next();
  }

  return next(new ApiError(403, "Security token is missing or invalid"));
};
