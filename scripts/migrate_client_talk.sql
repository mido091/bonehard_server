-- ─── Client Talk Migration ───────────────────────────────────────────────────
-- Run once against the target database.
-- Safe to re-run: uses IF NOT EXISTS / IGNORE patterns where possible.

-- 1. Client Talk Sessions table
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Add session_id to case_client_messages (nullable — existing rows stay NULL)
--    Only executes if the column does not yet exist.
SET @col_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'case_client_messages'
    AND COLUMN_NAME  = 'session_id'
);

SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE case_client_messages ADD COLUMN session_id INT UNSIGNED NULL AFTER case_id, ADD INDEX idx_ccm_session_id (session_id)',
  'SELECT ''session_id column already exists — skipping'' AS info'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
