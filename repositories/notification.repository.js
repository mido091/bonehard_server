import { pool } from "../config/db.js";
import { toLimitOffsetSql } from "../utils/db.js";

export const listNotifications = async (userId, { page = 1, perPage = 20 } = {}) => {
  const paging = toLimitOffsetSql({ page, perPage });

  const [rows] = await pool.query(
    `
      SELECT id, type, title, body, data_json AS dataJson, read_at AS readAt, created_at AS createdAt
      FROM notifications
      WHERE user_id = :userId
      ORDER BY created_at DESC, id DESC
      ${paging.sql}
    `,
    { userId },
  );

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM notifications WHERE user_id = :userId`,
    { userId },
  );

  const [unreadRows] = await pool.query(
    `SELECT COUNT(*) AS unreadCount FROM notifications WHERE user_id = :userId AND read_at IS NULL`,
    { userId },
  );

  return {
    rows,
    meta: {
      page: paging.page,
      perPage: paging.perPage,
      total: Number(countRows[0]?.total || 0),
      unreadCount: Number(unreadRows[0]?.unreadCount || 0),
    },
  };
};

export const createNotification = async ({ userId, type, title, body, data = null }) => {
  const [result] = await pool.query(
    `
      INSERT INTO notifications (user_id, type, title, body, data_json)
      VALUES (:userId, :type, :title, :body, :dataJson)
    `,
    {
      userId,
      type,
      title,
      body: body || null,
      dataJson: data ? JSON.stringify(data) : null,
    },
  );

  const [rows] = await pool.query(
    `
      SELECT id, type, title, body, data_json AS dataJson, read_at AS readAt, created_at AS createdAt
      FROM notifications
      WHERE id = :id
      LIMIT 1
    `,
    { id: result.insertId },
  );

  return rows[0];
};

export const listAdminAssistantNotificationRecipients = async () => {
  const [rows] = await pool.query(
    `
      SELECT id, name, email, role
      FROM users
      WHERE role IN ('admin', 'assistant')
        AND COALESCE(is_active, 1) = 1
    `,
  );

  return rows;
};

export const markNotificationRead = async (id, userId) => {
  const [result] = await pool.query(
    `UPDATE notifications SET read_at = COALESCE(read_at, NOW()) WHERE id = :id AND user_id = :userId`,
    { id, userId },
  );

  return result.affectedRows > 0;
};

export const markAllNotificationsRead = async (userId) => {
  const [result] = await pool.query(
    `UPDATE notifications SET read_at = COALESCE(read_at, NOW()) WHERE user_id = :userId AND read_at IS NULL`,
    { userId },
  );

  return result.affectedRows;
};

export const deleteNotification = async (id, userId) => {
  const [result] = await pool.query(
    `DELETE FROM notifications WHERE id = :id AND user_id = :userId`,
    { id, userId },
  );

  return result.affectedRows > 0;
};

export const deleteAllNotifications = async (userId) => {
  const [result] = await pool.query(
    `DELETE FROM notifications WHERE user_id = :userId`,
    { userId },
  );

  return result.affectedRows;
};
