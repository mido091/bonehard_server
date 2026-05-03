import jwt from "jsonwebtoken";
import { env, isProduction } from "../config/env.js";

export const AUTH_COOKIE_NAME = "bh_admin_session";

export const signAuthToken = (user) => jwt.sign(
  {
    sub: String(user.id),
    role: user.role,
  },
  env.jwtSecret,
  {
    expiresIn: "8h",
    issuer: "bonehard-admin",
    audience: "bonehard-dashboard",
  },
);

export const verifyAuthToken = (token) => jwt.verify(token, env.jwtSecret, {
  issuer: "bonehard-admin",
  audience: "bonehard-dashboard",
});

export const authCookieOptions = {
  httpOnly: true,
  sameSite: isProduction ? "strict" : "lax",
  secure: isProduction,
  path: "/",
  maxAge: 8 * 60 * 60 * 1000,
};
