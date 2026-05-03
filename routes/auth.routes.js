import { Router } from "express";
import { csrfToken, login, logout, me, register } from "../controllers/auth.controller.js";
import { forgotPassword, resetUserPassword, verifyPasswordOtp } from "../controllers/passwordReset.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { authLimiter } from "../middlewares/rateLimit.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { asyncHandler } from "../utils/apiResponse.js";
import { loginSchema, registerSchema } from "../validators/auth.validator.js";
import { requestResetSchema, resetPasswordSchema, verifyOtpSchema } from "../validators/passwordReset.validator.js";

const router = Router();

router.get("/csrf-token", asyncHandler(csrfToken));
router.post("/login", authLimiter, validate(loginSchema), asyncHandler(login));
router.post("/register", authLimiter, validate(registerSchema), asyncHandler(register));
router.post("/logout", asyncHandler(logout));
router.get("/me", requireAuth, asyncHandler(me));

// ── Password Reset (3-step OTP flow) ──────────────────────────────────────────
router.post("/forgot-password",  authLimiter, validate(requestResetSchema), asyncHandler(forgotPassword));
router.post("/verify-otp",       authLimiter, validate(verifyOtpSchema),    asyncHandler(verifyPasswordOtp));
router.post("/reset-password",   authLimiter, validate(resetPasswordSchema), asyncHandler(resetUserPassword));

export default router;
