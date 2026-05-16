import { pool } from "../config/db.js";

const attachmentQueries = [
  {
    label: "case note attachments",
    sql: `
      SELECT id, case_id AS caseId, note_id AS noteId, file_name AS fileName,
             file_url AS fileUrl, storage_provider AS storageProvider,
             cloudinary_public_id AS storagePath
      FROM case_files
      WHERE note_id IS NOT NULL
        AND (
          file_name IS NULL OR file_name = ''
          OR storage_provider IS NULL OR storage_provider = ''
          OR (cloudinary_public_id IS NULL AND file_url IS NULL)
        )
      ORDER BY id
    `,
  },
  {
    label: "general library note attachments",
    sql: `
      SELECT id, NULL AS caseId, note_id AS noteId, file_name AS fileName,
             file_url AS fileUrl, storage_provider AS storageProvider,
             cloudinary_public_id AS storagePath
      FROM admin_library_files
      WHERE note_id IS NOT NULL
        AND (
          file_name IS NULL OR file_name = ''
          OR storage_provider IS NULL OR storage_provider = ''
          OR (cloudinary_public_id IS NULL AND file_url IS NULL)
        )
      ORDER BY id
    `,
  },
];

try {
  const report = {};
  for (const query of attachmentQueries) {
    const [rows] = await pool.execute(query.sql);
    report[query.label] = rows;
  }

  console.log(JSON.stringify(report, null, 2));
} finally {
  await pool.end();
}
