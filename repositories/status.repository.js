import { pool } from "../config/db.js";
import { CASE_STATUS_NAMES } from "../constants/workflowOptions.js";

export const officialCaseStatuses = CASE_STATUS_NAMES;

const officialStatusParams = Object.fromEntries(
  officialCaseStatuses.map((name, index) => [`officialStatus_${index}`, name]),
);

const officialStatusSql = officialCaseStatuses
  .map((_, index) => `:officialStatus_${index}`)
  .join(", ");

export const listCaseStatuses = async () => {
  const [rows] = await pool.execute(
    `
      SELECT id, name, color, sort_order AS sortOrder, is_default AS isDefault
      FROM case_statuses
      WHERE name IN (${officialStatusSql})
      ORDER BY sort_order ASC, id ASC
    `,
    officialStatusParams,
  );

  return rows;
};

export const createCaseStatus = async ({ name, color = "#64748b", sortOrder = 0 }) => {
  const [result] = await pool.execute(
    `INSERT INTO case_statuses (name, color, sort_order) VALUES (:name, :color, :sortOrder)`,
    { name, color, sortOrder },
  );
  return { id: result.insertId, name, color, sortOrder, isDefault: 0 };
};

export const updateCaseStatus = async (id, { name, color, sortOrder }) => {
  const fields = [];
  const params = { id };

  if (name !== undefined) { fields.push("name = :name"); params.name = name; }
  if (color !== undefined) { fields.push("color = :color"); params.color = color; }
  if (sortOrder !== undefined) { fields.push("sort_order = :sortOrder"); params.sortOrder = sortOrder; }

  if (!fields.length) return;

  await pool.execute(
    `UPDATE case_statuses SET ${fields.join(", ")} WHERE id = :id`,
    params,
  );
};

export const deleteCaseStatus = async (id) => {
  await pool.execute(`DELETE FROM case_statuses WHERE id = :id AND is_default = 0`, { id });
};

export const statusExists = async (id) => {
  const [rows] = await pool.execute(
    `SELECT id FROM case_statuses WHERE id = :id AND name IN (${officialStatusSql}) LIMIT 1`,
    { id, ...officialStatusParams },
  );

  return Boolean(rows[0]);
};

export const getOfficialStatusByName = async (name) => {
  const [rows] = await pool.execute(
    `SELECT id, name, color, sort_order AS sortOrder FROM case_statuses WHERE name = :name AND name IN (${officialStatusSql}) LIMIT 1`,
    { name, ...officialStatusParams },
  );

  return rows[0] || null;
};
