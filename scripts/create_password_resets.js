import { pool } from '../config/db.js';

const sql = `
  CREATE TABLE IF NOT EXISTS password_resets (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    email        VARCHAR(190)  NOT NULL,
    otp_hash     VARCHAR(255)  NOT NULL,
    expires_at   DATETIME      NOT NULL,
    used         TINYINT(1)    NOT NULL DEFAULT 0,
    created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_pr_email   (email),
    INDEX idx_pr_expires (expires_at)
  )
`;

try {
  await pool.query(sql);
  console.log('✅  password_resets table created (or already exists).');
  process.exit(0);
} catch (err) {
  console.error('❌  Migration failed:', err.message);
  process.exit(1);
}
