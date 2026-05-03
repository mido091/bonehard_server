import { pool } from '../config/db.js';

/**
 * Inserts a new OTP record for the given email.
 * Marks any previous unused records for that email as used first,
 * so only the latest OTP is valid at any time.
 */
export const createPasswordReset = async ({ email, otpHash, expiresAt }) => {
  // Invalidate previous OTPs for this email before inserting the new one
  await pool.execute(
    `UPDATE password_resets SET used = 1 WHERE email = :email AND used = 0`,
    { email },
  );

  const [result] = await pool.execute(
    `INSERT INTO password_resets (email, otp_hash, expires_at)
     VALUES (:email, :otpHash, :expiresAt)`,
    { email, otpHash, expiresAt },
  );

  return result.insertId;
};

/**
 * Returns the latest valid (unused, non-expired) reset record for an email.
 */
export const findValidReset = async (email) => {
  const [rows] = await pool.execute(
    `SELECT id, email, otp_hash AS otpHash, expires_at AS expiresAt
     FROM password_resets
     WHERE email = :email
       AND used = 0
       AND expires_at > NOW()
     ORDER BY id DESC
     LIMIT 1`,
    { email },
  );

  return rows[0] || null;
};

/**
 * Marks a specific reset record as used (consumed) after a successful reset.
 */
export const markResetUsed = async (id) => {
  await pool.execute(
    `UPDATE password_resets SET used = 1 WHERE id = :id`,
    { id },
  );
};

/**
 * Purges expired / used records older than 24 hours (housekeeping).
 * Called opportunistically — failures are non-fatal.
 */
export const purgeStaleResets = async () => {
  await pool.execute(
    `DELETE FROM password_resets
     WHERE used = 1 OR expires_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)`,
  );
};
