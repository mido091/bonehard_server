import {
  requestPasswordReset,
  resetPassword,
  verifyOtp,
} from '../services/passwordReset.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

/**
 * POST /api/auth/forgot-password
 * Body: { email }
 *
 * Always responds with 200 even if the email doesn't exist —
 * this prevents user-enumeration attacks.
 */
export const forgotPassword = async (req, res) => {
  await requestPasswordReset({ email: req.body.email });
  sendSuccess(res, {
    message: 'A reset code has been sent to your email.',
  });
};

/**
 * POST /api/auth/verify-otp
 * Body: { email, otp }
 *
 * Returns a short-lived resetToken on success.
 */
export const verifyPasswordOtp = async (req, res) => {
  const { email, otp } = req.body;
  const { resetToken } = await verifyOtp({ email, otp });
  sendSuccess(res, {
    data: { resetToken },
    message: 'OTP verified. You may now set a new password.',
  });
};

/**
 * POST /api/auth/reset-password
 * Body: { email, resetToken, newPassword }
 */
export const resetUserPassword = async (req, res) => {
  const { email, resetToken, newPassword } = req.body;
  await resetPassword({ email, resetToken, newPassword });
  sendSuccess(res, { message: 'Password reset successfully. You can now log in.' });
};
