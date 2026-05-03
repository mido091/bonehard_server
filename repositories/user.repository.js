import { pool } from "../config/db.js";

let usersCapabilities = null;

const publicUserFields = `
  id,
  name,
  email,
  phone,
  address,
  role,
  created_at AS createdAt
`;

const getUsersCapabilities = async () => {
  if (usersCapabilities) return usersCapabilities;

  const [rows] = await pool.execute(
    `
      SELECT column_name AS columnName
      FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = 'users'
    `,
  );

  const columns = new Set(rows.map((row) => row.columnName));
  usersCapabilities = {
    hasIsActive: columns.has("is_active"),
    hasChatEnabled: columns.has("chat_enabled"),
  };

  return usersCapabilities;
};

const userSelectFields = async ({ includePassword = false } = {}) => {
  const capabilities = await getUsersCapabilities();
  const fields = [publicUserFields];

  if (capabilities.hasIsActive) {
    fields.push("is_active AS isActive");
  }

  if (capabilities.hasChatEnabled) {
    fields.push("chat_enabled AS chatEnabled");
  }

  if (includePassword) {
    fields.push("password_hash AS passwordHash");
  }

  return fields.join(",\n  ");
};

export const getUserByEmail = async (email) => {
  const fields = await userSelectFields({ includePassword: true });
  const [rows] = await pool.execute(
    `SELECT ${fields} FROM users WHERE email = :email LIMIT 1`,
    { email },
  );

  return rows[0] || null;
};

export const getUserById = async (id) => {
  const fields = await userSelectFields();
  const [rows] = await pool.execute(
    `SELECT ${fields} FROM users WHERE id = :id LIMIT 1`,
    { id },
  );

  return rows[0] || null;
};

export const createUser = async ({ name, email, passwordHash, phone = null, address = null }) => {
  const capabilities = await getUsersCapabilities();
  // New public accounts are active by default; admin approval can still be added later as an explicit workflow.
  const isActiveSql = capabilities.hasIsActive ? ", is_active" : "";
  const isActiveValueSql = capabilities.hasIsActive ? ", 1" : "";

  const [result] = await pool.execute(
    `
      INSERT INTO users (name, email, password_hash, phone, address, role${isActiveSql})
      VALUES (:name, :email, :passwordHash, :phone, :address, 'user'${isActiveValueSql})
    `,
    {
      name,
      email,
      passwordHash,
      phone: phone || null,
      address: address || null,
    },
  );

  return getUserById(result.insertId);
};

export const getAssignableUsers = async () => {
  const capabilities = await getUsersCapabilities();
  const activeFilter = capabilities.hasIsActive ? "AND is_active = 1" : "";
  const [rows] = await pool.execute(
    `SELECT id, name, email, role FROM users WHERE role IN ('admin', 'assistant', 'user') ${activeFilter} ORDER BY name ASC`,
  );

  return rows;
};

export const countUsersByRole = async () => {
  const [rows] = await pool.execute(
    `SELECT role, COUNT(*) AS total FROM users GROUP BY role`,
  );

  return rows;
};
