import { pool } from "../config/db.js";
import { toLimitOffsetSql } from "../utils/db.js";

export const CHAT_PAYMENT_SETTINGS_KEY = "chat_payment_settings";

export const defaultChatPaymentSettings = {
  paymentEnabled: false,
  planPrice: 0,
  walletNumber: "",
  instapayHandle: "",
};

export const normalizeChatPaymentSettings = (value = {}) => ({
  paymentEnabled: value.paymentEnabled === true || value.paymentEnabled === 1,
  planPrice: Number(value.planPrice || 0),
  walletNumber: String(value.walletNumber || "").trim(),
  instapayHandle: String(value.instapayHandle || "").trim(),
});

export const getChatPaymentSettings = async () => {
  const [rows] = await pool.execute(
    `SELECT setting_value AS settingValue FROM case_system_settings WHERE setting_key = :key LIMIT 1`,
    { key: CHAT_PAYMENT_SETTINGS_KEY },
  );

  const raw = rows[0]?.settingValue;
  const parsed = raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : {};
  return normalizeChatPaymentSettings({ ...defaultChatPaymentSettings, ...parsed });
};

export const saveChatPaymentSettings = async (settings) => {
  const normalized = normalizeChatPaymentSettings(settings);
  await pool.execute(
    `
      INSERT INTO case_system_settings (setting_key, setting_value)
      VALUES (:key, :value)
      ON DUPLICATE KEY UPDATE setting_value = :value
    `,
    { key: CHAT_PAYMENT_SETTINGS_KEY, value: JSON.stringify(normalized) },
  );
  return normalized;
};

const submissionSelect = `
  cps.id,
  cps.user_id AS userId,
  u.name AS userName,
  u.email AS userEmail,
  u.phone AS userPhone,
  cps.transfer_phone AS transferPhone,
  cps.amount,
  cps.currency,
  cps.status,
  cps.proof_file_name AS proofFileName,
  cps.proof_file_url AS proofFileUrl,
  cps.proof_mime_type AS proofMimeType,
  cps.proof_file_size AS proofFileSize,
  cps.proof_storage_provider AS proofStorageProvider,
  cps.proof_storage_path AS proofStoragePath,
  cps.reviewed_by AS reviewedBy,
  reviewer.name AS reviewedByName,
  cps.review_note AS reviewNote,
  cps.reviewed_at AS reviewedAt,
  cps.created_at AS createdAt,
  cps.updated_at AS updatedAt
`;

export const listChatPaymentSubmissions = async ({ page = 1, perPage = 20, status = "", search = "" } = {}) => {
  const paging = toLimitOffsetSql({ page, perPage });
  const where = [];
  const params = {};

  if (status) {
    where.push("cps.status = :status");
    params.status = status;
  }

  if (search) {
    where.push("(u.name LIKE :search OR u.email LIKE :search OR u.phone LIKE :search OR cps.transfer_phone LIKE :search)");
    params.search = `%${search}%`;
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const [rows] = await pool.execute(
    `
      SELECT ${submissionSelect}
      FROM chat_payment_submissions cps
      JOIN users u ON u.id = cps.user_id
      LEFT JOIN users reviewer ON reviewer.id = cps.reviewed_by
      ${whereSql}
      ORDER BY FIELD(cps.status, 'pending', 'rejected', 'approved'), cps.created_at DESC, cps.id DESC
      ${paging.sql}
    `,
    params,
  );

  const [countRows] = await pool.execute(
    `
      SELECT COUNT(*) AS total
      FROM chat_payment_submissions cps
      JOIN users u ON u.id = cps.user_id
      ${whereSql}
    `,
    params,
  );

  return { rows, meta: { page: paging.page, perPage: paging.perPage, total: Number(countRows[0]?.total || 0) } };
};

export const getLatestChatPaymentSubmissionForUser = async (userId) => {
  const [rows] = await pool.execute(
    `
      SELECT ${submissionSelect}
      FROM chat_payment_submissions cps
      JOIN users u ON u.id = cps.user_id
      LEFT JOIN users reviewer ON reviewer.id = cps.reviewed_by
      WHERE cps.user_id = :userId
      ORDER BY cps.created_at DESC, cps.id DESC
      LIMIT 1
    `,
    { userId },
  );
  return rows[0] || null;
};

export const getChatPaymentSubmissionById = async (id) => {
  const [rows] = await pool.execute(
    `
      SELECT ${submissionSelect}
      FROM chat_payment_submissions cps
      JOIN users u ON u.id = cps.user_id
      LEFT JOIN users reviewer ON reviewer.id = cps.reviewed_by
      WHERE cps.id = :id
      LIMIT 1
    `,
    { id },
  );
  return rows[0] || null;
};

export const createChatPaymentSubmission = async (payload) => {
  const [result] = await pool.execute(
    `
      INSERT INTO chat_payment_submissions (
        user_id, transfer_phone, amount, currency, proof_file_name, proof_file_url,
        proof_mime_type, proof_file_size, proof_storage_provider, proof_storage_path
      )
      VALUES (
        :userId, :transferPhone, :amount, 'EGP', :proofFileName, :proofFileUrl,
        :proofMimeType, :proofFileSize, :proofStorageProvider, :proofStoragePath
      )
    `,
    payload,
  );
  return getChatPaymentSubmissionById(result.insertId);
};

export const reviewChatPaymentSubmission = async ({ id, status, reviewerId, reviewNote = null }) => {
  await pool.execute(
    `
      UPDATE chat_payment_submissions
      SET status = :status,
          reviewed_by = :reviewerId,
          review_note = :reviewNote,
          reviewed_at = NOW()
      WHERE id = :id
    `,
    { id, status, reviewerId, reviewNote: reviewNote || null },
  );
  return getChatPaymentSubmissionById(id);
};

export const setUserChatEnabled = async (userId, enabled) => {
  await pool.execute(
    `UPDATE users SET chat_enabled = :enabled WHERE id = :userId`,
    { userId, enabled: enabled ? 1 : 0 },
  );
};
