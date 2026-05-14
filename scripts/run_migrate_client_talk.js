/**
 * Migration runner for client_talk_sessions table.
 * Run with: node scripts/run_migrate_client_talk.js
 */
import mysql from "mysql2/promise";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";

config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const sslCaPath = path.resolve(__dirname, "..", "isrgrootx1.pem");

const pool = await mysql.createConnection({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  ssl: { ca: fs.readFileSync(sslCaPath, "utf8"), rejectUnauthorized: true },
  multipleStatements: true,
});

console.log("Connected to database. Running migration...");

// ── 1. Create client_talk_sessions ────────────────────────────────────────
await pool.execute(`
  CREATE TABLE IF NOT EXISTS client_talk_sessions (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    order_id        INT UNSIGNED NOT NULL,
    user_id         INT UNSIGNED NOT NULL,
    assigned_to     INT UNSIGNED NULL,
    status          ENUM('pending','active','ended') NOT NULL DEFAULT 'pending',
    requested_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    accepted_at     DATETIME NULL,
    ended_at        DATETIME NULL,
    ended_by        INT UNSIGNED NULL,
    last_message_at DATETIME NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_ct_order_id  (order_id),
    INDEX idx_ct_user_id   (user_id),
    INDEX idx_ct_assigned  (assigned_to),
    INDEX idx_ct_status    (status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);
console.log("✔ client_talk_sessions table ready.");

// ── 2. Add session_id to case_client_messages (idempotent) ────────────────
const [cols] = await pool.execute(`
  SELECT COUNT(*) AS cnt
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'case_client_messages'
    AND COLUMN_NAME  = 'session_id'
`);

if (Number(cols[0].cnt) === 0) {
  // TiDB does not support ADD COLUMN + ADD INDEX in a single ALTER — run separately
  await pool.execute(`
    ALTER TABLE case_client_messages
      ADD COLUMN session_id INT UNSIGNED NULL AFTER case_id
  `);
  await pool.execute(`
    ALTER TABLE case_client_messages
      ADD INDEX idx_ccm_session_id (session_id)
  `);
  console.log("✔ session_id column added to case_client_messages.");
} else {
  console.log("ℹ session_id column already exists — skipping.");
}

await pool.end();
console.log("Migration complete.");
