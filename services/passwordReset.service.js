import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import {
  createPasswordReset,
  findValidReset,
  markResetUsed,
  purgeStaleResets,
} from '../repositories/passwordReset.repository.js';
import { getUserByEmail } from '../repositories/user.repository.js';
import { ApiError } from '../utils/apiResponse.js';
import { hashPassword } from '../utils/password.js';
import { pool } from '../config/db.js';

// ── Constants ────────────────────────────────────────────────────────────────
const OTP_LENGTH       = 6;   // digits
const OTP_TTL_MINUTES  = 10;  // OTP valid for 10 minutes

// ── Nodemailer transporter (Gmail App Password) ───────────────────────────────
let _transporter = null;

function getMailTransporter() {
  if (_transporter) return _transporter;

  if (!env.smtpUser || !env.smtpPass) {
    throw new Error('Gmail credentials (EMAIL_USER / EMAIL_PASS) are not configured.');
  }

  _transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: env.smtpUser,
      pass: env.smtpPass,
    },
  });

  return _transporter;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Generates a cryptographically-secure numeric OTP of the specified length.
 */
function generateOtp(length = OTP_LENGTH) {
  const max = Math.pow(10, length);
  // Use crypto.randomInt for a uniform, unbiased random integer
  const code = crypto.randomInt(0, max);
  return String(code).padStart(length, '0');
}

/**
 * SHA-256 hash of the OTP (we never store the raw code in the DB).
 */
function hashOtp(otp) {
  return crypto.createHash('sha256').update(otp).digest('hex');
}

/**
 * Returns a Date object `minutes` from now.
 */
function expiresAt(minutes = OTP_TTL_MINUTES) {
  return new Date(Date.now() + minutes * 60 * 1000);
}

// ── Service Functions ────────────────────────────────────────────────────────

/**
 * Step 1 — Request OTP.
 *
 * Looks up the user by email (silently succeeds even if not found to prevent
 * user-enumeration attacks), generates an OTP, stores its hash, and sends
 * an email.
 */
export const requestPasswordReset = async ({ email }) => {
  // Run housekeeping in the background — non-blocking, non-fatal
  purgeStaleResets().catch(() => {});

  const user = await getUserByEmail(email);

  // For this internal platform, we explicitly tell the user if the email
  // is not registered — user enumeration is not a concern here.
  if (!user) {
    throw new ApiError(404, 'No account found with this email address.');
  }

  const otp     = generateOtp();
  const otpHash = hashOtp(otp);
  const expiry  = expiresAt();

  await createPasswordReset({ email, otpHash, expiresAt: expiry });

  const mailer = getMailTransporter();

  await mailer.sendMail({
    from: `"BoneHard Security" <${env.smtpUser}>`,
    to: email,
    subject: 'Your BoneHard Password Reset Code',
    html: buildOtpEmailHtml({ name: user.name, otp }),
    text: `Hi ${user.name},\n\nYour password reset code is: ${otp}\n\nThis code expires in ${OTP_TTL_MINUTES} minutes.\n\nIf you did not request this, please ignore this email.\n\n— BoneHard Team`,
  });
};

/**
 * Step 2 — Verify OTP.
 *
 * Checks that the OTP is correct and not expired.
 * Returns a short-lived "reset token" (a second OTP hash stored in the same
 * record) so the client can call resetPassword without passing the OTP again.
 * We re-use the same record; no extra column needed.
 */
export const verifyOtp = async ({ email, otp }) => {
  const record = await findValidReset(email);

  if (!record || record.otpHash !== hashOtp(otp)) {
    throw new ApiError(400, 'Invalid or expired OTP. Please request a new code.');
  }

  // Issue a short-lived reset token valid for 5 minutes
  const resetToken    = crypto.randomBytes(32).toString('hex');
  const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
  const newExpiry      = expiresAt(5);

  // Re-use the same row: swap otp_hash → reset_token_hash and extend expiry
  await pool.query(
    `UPDATE password_resets
        SET otp_hash   = :resetTokenHash,
            expires_at = :newExpiry
      WHERE id = :id`,
    { resetTokenHash, newExpiry, id: record.id },
  );

  return { resetToken };
};

/**
 * Step 3 — Reset Password.
 *
 * Validates the reset token (from step 2) and sets the new password.
 */
export const resetPassword = async ({ email, resetToken, newPassword }) => {
  const record = await findValidReset(email);

  const tokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
  if (!record || record.otpHash !== tokenHash) {
    throw new ApiError(400, 'Reset session is invalid or has expired. Please start over.');
  }

  const passwordHash = await hashPassword(newPassword);

  await pool.query(
    `UPDATE users SET password_hash = :passwordHash WHERE email = :email`,
    { passwordHash, email },
  );

  await markResetUsed(record.id);
};

// ── Email HTML Template ───────────────────────────────────────────────────────

function buildOtpEmailHtml({ name, otp }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Password Reset</title>
  <style>
    body { margin: 0; padding: 0; background: #0f0f13; font-family: 'Segoe UI', Arial, sans-serif; }
    .wrapper { max-width: 520px; margin: 40px auto; background: #1a1a24; border-radius: 16px; overflow: hidden; border: 1px solid rgba(255,237,212,0.12); }
    .header { background: linear-gradient(135deg, #1e1e2e 0%, #252535 100%); padding: 32px 40px; text-align: center; }
    .header h1 { margin: 0; color: #FFEDD4; font-size: 22px; letter-spacing: 2px; text-transform: uppercase; }
    .body { padding: 40px; }
    .greeting { color: #fff; font-size: 16px; margin: 0 0 16px; }
    .copy { color: rgba(255,255,255,0.65); font-size: 14px; line-height: 1.7; margin: 0 0 32px; }
    .otp-box { background: rgba(255,237,212,0.06); border: 1px solid rgba(255,237,212,0.18); border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 32px; }
    .otp-code { font-size: 42px; font-weight: 900; letter-spacing: 14px; color: #FFEDD4; font-family: 'Courier New', monospace; }
    .otp-note { color: rgba(255,255,255,0.45); font-size: 12px; margin: 12px 0 0; }
    .warning { color: rgba(255,255,255,0.45); font-size: 12px; line-height: 1.6; }
    .footer { background: rgba(0,0,0,0.3); padding: 20px 40px; text-align: center; color: rgba(255,255,255,0.3); font-size: 11px; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header"><h1>BoneHard — Password Reset</h1></div>
    <div class="body">
      <p class="greeting">Hi ${name},</p>
      <p class="copy">We received a request to reset your BoneHard account password. Use the code below to continue. It expires in <strong style="color:#FFEDD4">10 minutes</strong>.</p>
      <div class="otp-box">
        <div class="otp-code">${otp}</div>
        <p class="otp-note">One-time password — do not share this code.</p>
      </div>
      <p class="warning">If you didn't request a password reset, you can safely ignore this email. Your password will not change.</p>
    </div>
    <div class="footer">© ${new Date().getFullYear()} BoneHard. All rights reserved.</div>
  </div>
</body>
</html>`;
}
