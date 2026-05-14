/**
 * clientTalk.repository.js
 * ─────────────────────────────────────────────────────────────────────────────
 * All database queries for the Client Talk request-based chat system.
 *
 * Design decisions:
 *  - A user can have at most one non-ended session per order (pending OR active).
 *    createOrReuseSession() enforces this — it returns the existing session if one
 *    is still open rather than creating a duplicate.
 *  - acceptSession() uses an atomic UPDATE with a WHERE guard (status='pending' AND
 *    assigned_to IS NULL) so two concurrent requests can never both succeed.
 *  - Messages are stored in case_client_messages with a session_id FK so they are
 *    linked to the specific live session and the legacy case chat is unaffected.
 */

import { pool } from "../config/db.js";
import { toLimitOffsetSql } from "../utils/db.js";

// ─── Session helpers ──────────────────────────────────────────────────────────

/**
 * Returns a full session row by primary key.
 */
export const getSessionById = async (sessionId) => {
  const [[row]] = await pool.execute(
    `SELECT
       s.id, s.order_id AS orderId, s.user_id AS userId,
       s.assigned_to AS assignedTo, s.status,
       s.requested_at AS requestedAt, s.accepted_at AS acceptedAt,
       s.ended_at AS endedAt, s.ended_by AS endedBy,
       s.last_message_at AS lastMessageAt,
       s.created_at AS createdAt, s.updated_at AS updatedAt,
       u.name AS userName, u.email AS userEmail,
       a.name AS assignedName,
       c.name AS orderName
     FROM client_talk_sessions s
     LEFT JOIN users u ON u.id = s.user_id
     LEFT JOIN users a ON a.id = s.assigned_to
     LEFT JOIN cases c ON c.id = s.order_id
     WHERE s.id = :sessionId
     LIMIT 1`,
    { sessionId },
  );
  return row || null;
};

/**
 * Returns the latest open (pending or active) session for a given order + user.
 * Returns null if no such session exists or the last one has ended.
 */
export const getOpenSessionByOrderForUser = async (orderId, userId) => {
  const [[row]] = await pool.execute(
    `SELECT
       s.id, s.order_id AS orderId, s.user_id AS userId,
       s.assigned_to AS assignedTo, s.status,
       s.requested_at AS requestedAt, s.accepted_at AS acceptedAt,
       s.ended_at AS endedAt, s.ended_by AS endedBy,
       s.last_message_at AS lastMessageAt,
       u.name AS userName, a.name AS assignedName, c.name AS orderName
     FROM client_talk_sessions s
     LEFT JOIN users u ON u.id = s.user_id
     LEFT JOIN users a ON a.id = s.assigned_to
     LEFT JOIN cases c ON c.id = s.order_id
     WHERE s.order_id = :orderId
       AND s.user_id  = :userId
       AND s.status IN ('pending', 'active')
     ORDER BY s.created_at DESC
     LIMIT 1`,
    { orderId, userId },
  );
  return row || null;
};

/**
 * Either returns the existing open session for this order/user, or creates
 * a fresh one with status='pending'. Prevents duplicate pending requests.
 */
export const createOrReuseSession = async (orderId, userId) => {
  const existing = await getOpenSessionByOrderForUser(orderId, userId);
  if (existing) return { ...existing, wasReusedOpenSession: true };

  const [result] = await pool.execute(
    `INSERT INTO client_talk_sessions (order_id, user_id, status)
     VALUES (:orderId, :userId, 'pending')`,
    { orderId, userId },
  );

  const created = await getSessionById(result.insertId);
  return { ...created, wasReusedOpenSession: false };
};

/**
 * Atomically marks a session as accepted by the given assignee.
 * Only succeeds if the session is still pending and unassigned.
 *
 * @returns {object|null} Updated session row, an already-owned active row, or null if someone else claimed it.
 */
export const acceptSession = async (sessionId, assigneeId) => {
  const [result] = await pool.execute(
    `UPDATE client_talk_sessions
     SET status      = 'active',
         assigned_to = :assigneeId,
         accepted_at = NOW()
     WHERE id          = :sessionId
       AND status      = 'pending'
       AND assigned_to IS NULL`,
    { sessionId, assigneeId },
  );

  if (result.affectedRows === 0) {
    const current = await getSessionById(sessionId);

    // Re-opening the same conversation must be idempotent for the assigned staff member.
    // This lets an admin refresh or minimize the modal and safely return from the notification.
    if (
      current?.status === "active" &&
      current.assignedTo &&
      Number(current.assignedTo) === Number(assigneeId)
    ) {
      return { ...current, wasAlreadyAcceptedByRequester: true };
    }

    return null;
  }

  return getSessionById(sessionId);
};

/**
 * Marks a session as ended. Only transitions if currently 'active'.
 *
 * @returns {object|null} Updated session row, or null if not active.
 */
export const endSession = async (sessionId, endedBy) => {
  const [result] = await pool.execute(
    `UPDATE client_talk_sessions
     SET status   = 'ended',
         ended_by = :endedBy,
         ended_at = NOW()
     WHERE id     = :sessionId
       AND status = 'active'`,
    { sessionId, endedBy },
  );

  if (result.affectedRows === 0) return null;

  return getSessionById(sessionId);
};

// ─── Messages ─────────────────────────────────────────────────────────────────

/**
 * Returns paginated messages for a session in chronological order.
 */
export const listSessionMessages = async (sessionId, query = {}) => {
  const paging = toLimitOffsetSql(query);

  const [rows] = await pool.execute(
    `SELECT m.id, m.session_id AS sessionId, m.sender_id AS senderId,
            u.name AS senderName, m.body, m.created_at AS createdAt
     FROM case_client_messages m
     LEFT JOIN users u ON u.id = m.sender_id
     WHERE m.session_id = :sessionId
     ORDER BY m.created_at ASC, m.id ASC
     ${paging.sql}`,
    { sessionId },
  );

  return {
    rows,
    meta: { page: paging.page, perPage: paging.perPage },
  };
};

/**
 * Inserts a new message linked to the session and bumps last_message_at.
 */
export const createSessionMessage = async (sessionId, senderId, body) => {
  // Look up order_id (case_id) for this session to satisfy the NOT NULL constraint
  const [[sessionRow]] = await pool.execute(
    `SELECT order_id AS caseId FROM client_talk_sessions WHERE id = :sessionId LIMIT 1`,
    { sessionId },
  );
  if (!sessionRow) throw new Error("Session not found");

  const [result] = await pool.execute(
    `INSERT INTO case_client_messages (case_id, session_id, sender_id, body)
     VALUES (:caseId, :sessionId, :senderId, :body)`,
    { caseId: sessionRow.caseId, sessionId, senderId, body },
  );

  // Keep last_message_at fresh for archive sorting
  await pool.execute(
    `UPDATE client_talk_sessions SET last_message_at = NOW() WHERE id = :sessionId`,
    { sessionId },
  );

  const [[row]] = await pool.execute(
    `SELECT m.id, m.session_id AS sessionId, m.sender_id AS senderId,
            u.name AS senderName, m.body, m.created_at AS createdAt
     FROM case_client_messages m
     LEFT JOIN users u ON u.id = m.sender_id
     WHERE m.id = :id
     LIMIT 1`,
    { id: result.insertId },
  );

  return row;
};

// ─── Admin archive ────────────────────────────────────────────────────────────

/**
 * Lists all sessions for the admin archive with optional filters.
 */
export const listArchiveSessions = async (query = {}) => {
  const paging = toLimitOffsetSql(query);

  // Build dynamic WHERE clauses. We keep a status-free copy for accurate status summary cards.
  const conditions = [];
  const summaryConditions = [];
  const params = {};
  const summaryParams = {};

  if (query.status && query.status !== "all") {
    conditions.push("s.status = :status");
    params.status = query.status;
  }

  if (query.assignedTo) {
    conditions.push("s.assigned_to = :assignedTo");
    summaryConditions.push("s.assigned_to = :assignedTo");
    params.assignedTo = query.assignedTo;
    summaryParams.assignedTo = query.assignedTo;
  }

  if (query.orderId) {
    conditions.push("s.order_id = :orderId");
    summaryConditions.push("s.order_id = :orderId");
    params.orderId = query.orderId;
    summaryParams.orderId = query.orderId;
  }

  if (query.search) {
    conditions.push("(u.name LIKE :search OR c.name LIKE :search)");
    summaryConditions.push("(u.name LIKE :search OR c.name LIKE :search)");
    params.search = `%${query.search}%`;
    summaryParams.search = `%${query.search}%`;
  }

  if (query.dateFrom) {
    conditions.push("s.requested_at >= :dateFrom");
    summaryConditions.push("s.requested_at >= :dateFrom");
    params.dateFrom = query.dateFrom;
    summaryParams.dateFrom = query.dateFrom;
  }

  if (query.dateTo) {
    conditions.push("s.requested_at <= :dateTo");
    summaryConditions.push("s.requested_at <= :dateTo");
    params.dateTo = `${query.dateTo} 23:59:59`;
    summaryParams.dateTo = `${query.dateTo} 23:59:59`;
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const summaryWhere = summaryConditions.length ? `WHERE ${summaryConditions.join(" AND ")}` : "";

  const [rows] = await pool.execute(
    `SELECT
       s.id, s.order_id AS orderId, s.user_id AS userId,
       s.assigned_to AS assignedTo, s.status,
       s.requested_at AS requestedAt, s.accepted_at AS acceptedAt,
       s.ended_at AS endedAt, s.last_message_at AS lastMessageAt,
       u.name AS userName, u.email AS userEmail,
       a.name AS assignedName,
       c.name AS orderName
     FROM client_talk_sessions s
     LEFT JOIN users u ON u.id = s.user_id
     LEFT JOIN users a ON a.id = s.assigned_to
     LEFT JOIN cases c ON c.id = s.order_id
     ${where}
     ORDER BY s.requested_at DESC
     ${paging.sql}`,
    params,
  );

  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total
     FROM client_talk_sessions s
     LEFT JOIN users u ON u.id = s.user_id
     LEFT JOIN cases c ON c.id = s.order_id
     ${where}`,
    params,
  );

  const [statusRows] = await pool.execute(
    `SELECT s.status, COUNT(*) AS total
     FROM client_talk_sessions s
     LEFT JOIN users u ON u.id = s.user_id
     LEFT JOIN cases c ON c.id = s.order_id
     ${summaryWhere}
     GROUP BY s.status`,
    summaryParams,
  );

  const statusCounts = statusRows.reduce((acc, row) => {
    acc[row.status] = Number(row.total || 0);
    return acc;
  }, { pending: 0, active: 0, ended: 0 });

  return {
    rows,
    meta: {
      page: paging.page,
      perPage: paging.perPage,
      total: Number(countRows[0]?.total || 0),
      statusCounts,
    },
  };
};

/**
 * Returns a single session with all its messages for the archive detail view.
 */
export const getArchiveSessionDetail = async (sessionId) => {
  const session = await getSessionById(sessionId);
  if (!session) return null;

  const [messages] = await pool.execute(
    `SELECT m.id, m.session_id AS sessionId, m.sender_id AS senderId,
            u.name AS senderName, m.body, m.created_at AS createdAt
     FROM case_client_messages m
     LEFT JOIN users u ON u.id = m.sender_id
     WHERE m.session_id = :sessionId
     ORDER BY m.created_at ASC, m.id ASC`,
    { sessionId },
  );

  return { ...session, messages };
};

/**
 * Permanently deletes a Client Talk session transcript from the admin archive.
 * Messages and stale notifications are removed first to satisfy FK constraints.
 */
export const deleteArchiveSession = async (sessionId) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [[session]] = await connection.execute(
      `SELECT id FROM client_talk_sessions WHERE id = :sessionId LIMIT 1`,
      { sessionId },
    );

    if (!session) {
      await connection.rollback();
      return false;
    }

    await connection.execute(
      `DELETE FROM case_client_messages WHERE session_id = :sessionId`,
      { sessionId },
    );

    await connection.execute(
      `DELETE FROM notifications WHERE data_json LIKE :sessionPattern`,
      { sessionPattern: `%"sessionId":${sessionId}%` },
    );

    await connection.execute(
      `DELETE FROM client_talk_sessions WHERE id = :sessionId`,
      { sessionId },
    );

    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

/**
 * Marks all notifications for a specific session as read for every user
 * EXCEPT the one who just accepted (they keep theirs, now it navigates to chat).
 * This dismisses the pending request notification for other admins/assistants.
 */
export const dismissOtherSessionNotifications = async (sessionId, acceptedByUserId) => {
  const sessionPattern = `%"sessionId":${sessionId}%`;

  // Find target notifications before deleting them so we can broadcast deletion to specific users
  const [rows] = await pool.execute(
    `SELECT id, user_id AS userId FROM notifications
     WHERE user_id != :acceptedByUserId
       AND data_json LIKE :sessionPattern`,
    { acceptedByUserId, sessionPattern },
  );

  if (rows.length > 0) {
    // Actually delete them from the database to clean up the bell dropdown completely
    await pool.execute(
      `DELETE FROM notifications
       WHERE user_id != :acceptedByUserId
         AND data_json LIKE :sessionPattern`,
      { acceptedByUserId, sessionPattern },
    );

    // Trigger realtime event for each user to remove the notification from their live view instantly
    const { triggerRealtimeEvent } = await import("../services/pusher.service.js");
    await Promise.all(
      rows.map((row) =>
        triggerRealtimeEvent(`private-user-${row.userId}`, "notification.deleted", {
          id: row.id,
        }),
      ),
    );
  }
};

// ─── Authorization helper ─────────────────────────────────────────────────────

/**
 * Checks whether a user is allowed to access a specific session's messages/channel.
 * - The session owner (user) is always allowed.
 * - The assigned admin/assistant is allowed.
 * - Admin role can access via the archive API but not the live Pusher channel.
 */
export const userCanAccessSession = async (sessionId, user) => {
  const [[row]] = await pool.execute(
    `SELECT user_id AS userId, assigned_to AS assignedTo
     FROM client_talk_sessions
     WHERE id = :sessionId
     LIMIT 1`,
    { sessionId },
  );

  if (!row) return false;

  if (Number(row.userId) === Number(user.id)) return true;
  if (row.assignedTo && Number(row.assignedTo) === Number(user.id)) return true;

  return false;
};
