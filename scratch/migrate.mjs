import 'dotenv/config';
import { pool } from '../config/db.js';

const queries = [
  'ALTER TABLE admin_library_files ADD COLUMN IF NOT EXISTS cloudinary_public_id VARCHAR(500) NULL',
  'ALTER TABLE case_client_messages ADD COLUMN IF NOT EXISTS session_id BIGINT UNSIGNED NULL',
  "ALTER TABLE case_client_messages ADD COLUMN IF NOT EXISTS message_type ENUM('text', 'image') NOT NULL DEFAULT 'text'",
  'ALTER TABLE case_client_messages ADD COLUMN IF NOT EXISTS attachment_name VARCHAR(190) NULL',
  'ALTER TABLE case_client_messages ADD COLUMN IF NOT EXISTS attachment_url VARCHAR(700) NULL',
  'ALTER TABLE case_client_messages ADD COLUMN IF NOT EXISTS attachment_mime_type VARCHAR(120) NULL',
  'ALTER TABLE case_client_messages ADD COLUMN IF NOT EXISTS attachment_size BIGINT UNSIGNED NOT NULL DEFAULT 0',
  'ALTER TABLE case_client_messages ADD COLUMN IF NOT EXISTS attachment_storage_provider VARCHAR(60) NULL',
  'ALTER TABLE case_client_messages ADD COLUMN IF NOT EXISTS attachment_storage_path VARCHAR(700) NULL',
];

for (const q of queries) {
  try {
    await pool.query(q);
    console.log('OK:', q.slice(0, 80));
  } catch (e) {
    console.error('ERR:', e.message.slice(0, 120));
  }
}

await pool.end();
console.log('Done.');
