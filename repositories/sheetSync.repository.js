import { pool } from "../config/db.js";

export const listDashboardCasesForSheet = async () => {
  const [rows] = await pool.execute(
    `
      SELECT
        c.id AS caseId,
        c.name AS patientName,
        COALESCE(s.name, '') AS status,
        DATE_FORMAT(c.updated_at, '%Y-%m-%dT%H:%i:%sZ') AS updatedAt,
        'dashboard' AS source
      FROM cases c
      LEFT JOIN case_statuses s ON s.id = c.status_id
      LEFT JOIN users creator ON creator.id = c.created_by
      WHERE c.is_archived = 0
        AND NOT (
          c.target_id IS NOT NULL
          AND c.created_by = c.target_id
          AND creator.role = 'user'
        )
      ORDER BY c.updated_at DESC, c.id DESC
    `,
  );

  return rows;
};

export const getSyncableCaseById = async (caseId) => {
  const [rows] = await pool.execute(
    `
      SELECT
        c.id,
        c.name,
        c.status_id AS statusId,
        s.name AS statusName
      FROM cases c
      LEFT JOIN case_statuses s ON s.id = c.status_id
      WHERE c.id = :caseId
        AND c.is_archived = 0
      LIMIT 1
    `,
    { caseId },
  );

  return rows[0] || null;
};

export const getCaseStatusByName = async (statusName) => {
  const [rows] = await pool.execute(
    `
      SELECT id, name
      FROM case_statuses
      WHERE LOWER(name) = LOWER(:statusName)
      LIMIT 1
    `,
    { statusName },
  );

  return rows[0] || null;
};

export const updateCaseFromSheet = async ({ caseId, patientName, statusId }) => {
  const fields = [];
  const params = { caseId };

  if (patientName !== undefined) {
    fields.push("name = :patientName");
    params.patientName = patientName;
  }

  if (statusId !== undefined) {
    fields.push("status_id = :statusId");
    params.statusId = statusId;
  }

  if (!fields.length) {
    return getSyncableCaseById(caseId);
  }

  await pool.execute(
    `
      UPDATE cases
      SET ${fields.join(", ")}
      WHERE id = :caseId
        AND is_archived = 0
    `,
    params,
  );

  return getSyncableCaseById(caseId);
};
