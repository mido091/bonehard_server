/**
 * clientTalk.repository.js
 * ─────────────────────────────────────────────────────────────────────────────
 * All database queries for the Client Talk request-based chat system.
 *
 * Design decisions:
 *  - A user can have at most one non-ended session per order (pending OR active).
 *    createOrReuseSession() enforces this — it returns the existing session if one
 *    is still open rather than creating a duplicate.
 *  - New sessions are active immediately so users can send context before staff
 *    joins. acceptSession() still uses an atomic UPDATE guard so two concurrent
 *    claim attempts can never both own the same unassigned session.
 *  - Messages are stored in case_client_messages with a session_id FK so they are
 *    linked to the specific live session and the legacy case chat is unaffected.
 */

import { pool } from "../config/db.js";
import { toLimitOffsetSql } from "../utils/db.js";

const ENTRY_CONTEXTS = new Set(["user-order", "admin-order", "admin-case"]);
let entryContextColumnReady = null;

const normalizeEntryContext = (value) =>
  ENTRY_CONTEXTS.has(value) ? value : "user-order";

export const ensureClientTalkEntryContextColumn = async () => {
  if (entryContextColumnReady) return entryContextColumnReady;

  entryContextColumnReady = (async () => {
    const [[column]] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'client_talk_sessions'
         AND COLUMN_NAME = 'entry_context'`,
    );

    if (Number(column?.total || 0) === 0) {
      await pool.query(
        `ALTER TABLE client_talk_sessions
         ADD COLUMN entry_context VARCHAR(32) NOT NULL DEFAULT 'user-order' AFTER status`,
      );
      await pool.query(
        `ALTER TABLE client_talk_sessions
         ADD INDEX idx_ct_entry_context (entry_context)`,
      );
    }
  })();

  return entryContextColumnReady;
};

const sessionSelectColumns = `
       s.id, s.order_id AS orderId, s.user_id AS userId,
       s.assigned_to AS assignedTo, s.status,
       s.entry_context AS entryContext,
       s.requested_at AS requestedAt, s.accepted_at AS acceptedAt,
       s.ended_at AS endedAt, s.ended_by AS endedBy,
       s.last_message_at AS lastMessageAt,
       s.created_at AS createdAt, s.updated_at AS updatedAt,
       u.name AS userName, u.email AS userEmail,
       a.name AS assignedName,
       c.name AS orderName`;

// ─── Session helpers ──────────────────────────────────────────────────────────

/**
 * Returns a full session row by primary key.
 */
export const getSessionById = async (sessionId) => {
  await ensureClientTalkEntryContextColumn();
  const [[row]] = await pool.query(
    `SELECT
       ${sessionSelectColumns}
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
  await ensureClientTalkEntryContextColumn();
  const [[row]] = await pool.query(
    `SELECT
       ${sessionSelectColumns}
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
 * a fresh active one. Prevents duplicate open conversations.
 */
export const createOrReuseSession = async (orderId, userId, entryContext = "user-order") => {
  await ensureClientTalkEntryContextColumn();
  const existing = await getOpenSessionByOrderForUser(orderId, userId);
  if (existing) {
    if (existing.status === "pending") {
      await pool.query(
        `UPDATE client_talk_sessions SET status = 'active' WHERE id = :sessionId`,
        { sessionId: existing.id },
      );
      return { ...(await getSessionById(existing.id)), wasReusedOpenSession: true };
    }
    return { ...existing, wasReusedOpenSession: true };
  }

  const [result] = await pool.query(
    `INSERT INTO client_talk_sessions (order_id, user_id, status, entry_context)
     VALUES (:orderId, :userId, 'active', :entryContext)`,
    { orderId, userId, entryContext: normalizeEntryContext(entryContext) },
  );

  const created = await getSessionById(result.insertId);
  return { ...created, wasReusedOpenSession: false };
};

export const createOrReuseSessionForStaff = async (orderId, assigneeId, entryContext = "admin-order") => {
  await ensureClientTalkEntryContextColumn();
  const [[orderRow]] = await pool.query(
    `SELECT id, target_id AS userId
     FROM cases
     WHERE id = :orderId
       AND target_id IS NOT NULL
     LIMIT 1`,
    { orderId },
  );
  if (!orderRow) return null;

  const existing = await getOpenSessionByOrderForUser(orderId, orderRow.userId);
  if (existing) {
    if (!existing.assignedTo) {
      await pool.query(
        `UPDATE client_talk_sessions
         SET status = 'active',
             assigned_to = :assigneeId,
             accepted_at = COALESCE(accepted_at, NOW())
         WHERE id = :sessionId`,
        { assigneeId, sessionId: existing.id },
      );
      return {
        ...(await getSessionById(existing.id)),
        wasReusedOpenSession: true,
        wasAssignedByRequester: true,
      };
    }
    return {
      ...existing,
      wasReusedOpenSession: true,
      wasAssignedByRequester: Number(existing.assignedTo) === Number(assigneeId),
    };
  }

  const [result] = await pool.query(
    `INSERT INTO client_talk_sessions (order_id, user_id, assigned_to, status, accepted_at, entry_context)
     VALUES (:orderId, :userId, :assigneeId, 'active', NOW(), :entryContext)`,
    { orderId, userId: orderRow.userId, assigneeId, entryContext: normalizeEntryContext(entryContext) },
  );

  return {
    ...(await getSessionById(result.insertId)),
    wasReusedOpenSession: false,
    wasAssignedByRequester: true,
  };
};

/**
 * Atomically marks a session as accepted by the given assignee.
 * Only succeeds if the session is still pending and unassigned.
 *
 * @returns {object|null} Updated session row, an already-owned active row, or null if someone else claimed it.
 */
export const acceptSession = async (sessionId, assigneeId) => {
  const [result] = await pool.query(
    `UPDATE client_talk_sessions
     SET status      = 'active',
         assigned_to = :assigneeId,
         accepted_at = NOW()
     WHERE id          = :sessionId
       AND status      IN ('pending', 'active')
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
  const [result] = await pool.query(
    `UPDATE client_talk_sessions
     SET status   = 'ended',
         ended_by = :endedBy,
         ended_at = NOW()
     WHERE id     = :sessionId
       AND status IN ('pending', 'active')`,
    { sessionId, endedBy },
  );

  if (result.affectedRows === 0) return null;

  return getSessionById(sessionId);
};

// ─── Messages ─────────────────────────────────────────────────────────────────

/**
 * Returns paginated messages for a session in chronological order.
 * Returns message_type and attachment fields so images render correctly.
 */
export const listSessionMessages = async (sessionId, query = {}) => {
  const paging = toLimitOffsetSql(query);

  const [rows] = await pool.query(
    `SELECT m.id, m.session_id AS sessionId, m.sender_id AS senderId,
            u.name AS senderName,
            m.body, m.message_type AS messageType,
            m.attachment_name AS attachmentName,
            m.attachment_url AS attachmentUrl,
            m.attachment_mime_type AS attachmentMimeType,
            m.attachment_size AS attachmentSize,
            m.attachment_storage_provider AS attachmentStorageProvider,
            m.attachment_storage_path AS attachmentStoragePath,
            m.created_at AS createdAt
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
 *
 * @param {number}      sessionId      - The session this message belongs to.
 * @param {number}      senderId       - The user sending the message.
 * @param {string}      body           - Text body (may be empty for image-only messages).
 * @param {object|null} attachmentData - Optional image attachment metadata.
 * @param {string}      attachmentData.attachmentName
 * @param {string}      attachmentData.attachmentUrl     - Supabase signed path
 * @param {string}      attachmentData.attachmentMimeType
 * @param {number}      attachmentData.attachmentSize
 * @param {string}      attachmentData.attachmentStorageProvider
 * @param {string}      attachmentData.attachmentStoragePath
 */
export const createSessionMessage = async (sessionId, senderId, body, attachmentData = null) => {
  // Look up order_id (case_id) for this session to satisfy the NOT NULL constraint
  const [[sessionRow]] = await pool.query(
    `SELECT order_id AS caseId FROM client_talk_sessions WHERE id = :sessionId LIMIT 1`,
    { sessionId },
  );
  if (!sessionRow) throw new Error("Session not found");

  const messageType = attachmentData ? "image" : "text";

  const [result] = await pool.query(
    `INSERT INTO case_client_messages (
       case_id, session_id, sender_id, body,
       message_type,
       attachment_name, attachment_url, attachment_mime_type,
       attachment_size, attachment_storage_provider, attachment_storage_path
     )
     VALUES (
       :caseId, :sessionId, :senderId, :body,
       :messageType,
       :attachmentName, :attachmentUrl, :attachmentMimeType,
       :attachmentSize, :attachmentStorageProvider, :attachmentStoragePath
     )`,
    {
      caseId:                  sessionRow.caseId,
      sessionId,
      senderId,
      body:                    body || "",
      messageType,
      attachmentName:          attachmentData?.attachmentName          || null,
      attachmentUrl:           attachmentData?.attachmentUrl           || null,
      attachmentMimeType:      attachmentData?.attachmentMimeType      || null,
      attachmentSize:          attachmentData?.attachmentSize          || 0,
      attachmentStorageProvider: attachmentData?.attachmentStorageProvider || null,
      attachmentStoragePath:   attachmentData?.attachmentStoragePath   || null,
    },
  );

  // Keep last_message_at fresh for archive sorting
  await pool.query(
    `UPDATE client_talk_sessions SET last_message_at = NOW() WHERE id = :sessionId`,
    { sessionId },
  );

  const [[row]] = await pool.query(
    `SELECT m.id, m.session_id AS sessionId, m.sender_id AS senderId,
            u.name AS senderName,
            m.body, m.message_type AS messageType,
            m.attachment_name AS attachmentName,
            m.attachment_url AS attachmentUrl,
            m.attachment_mime_type AS attachmentMimeType,
            m.attachment_size AS attachmentSize,
            m.attachment_storage_provider AS attachmentStorageProvider,
            m.attachment_storage_path AS attachmentStoragePath,
            m.created_at AS createdAt
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
  await ensureClientTalkEntryContextColumn();
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

  const [rows] = await pool.query(
    `SELECT
       ${sessionSelectColumns}
     FROM client_talk_sessions s
     LEFT JOIN users u ON u.id = s.user_id
     LEFT JOIN users a ON a.id = s.assigned_to
     LEFT JOIN cases c ON c.id = s.order_id
     ${where}
     ORDER BY s.requested_at DESC
     ${paging.sql}`,
    params,
  );

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM client_talk_sessions s
     LEFT JOIN users u ON u.id = s.user_id
     LEFT JOIN cases c ON c.id = s.order_id
     ${where}`,
    params,
  );

  const [statusRows] = await pool.query(
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
 * Includes attachment fields so images render in the archive transcript.
 */
export const getArchiveSessionDetail = async (sessionId) => {
  const session = await getSessionById(sessionId);
  if (!session) return null;

  const [messages] = await pool.query(
    `SELECT m.id, m.session_id AS sessionId, m.sender_id AS senderId,
            u.name AS senderName,
            m.body, m.message_type AS messageType,
            m.attachment_name AS attachmentName,
            m.attachment_url AS attachmentUrl,
            m.attachment_mime_type AS attachmentMimeType,
            m.attachment_size AS attachmentSize,
            m.created_at AS createdAt
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

    const [[session]] = await connection.query(
      `SELECT id FROM client_talk_sessions WHERE id = :sessionId LIMIT 1`,
      { sessionId },
    );

    if (!session) {
      await connection.rollback();
      return false;
    }

    await connection.query(
      `DELETE FROM case_client_messages WHERE session_id = :sessionId`,
      { sessionId },
    );

    await connection.query(
      `DELETE FROM notifications WHERE data_json LIKE :sessionPattern`,
      { sessionPattern: `%"sessionId":${sessionId}%` },
    );

    await connection.query(
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
  const [rows] = await pool.query(
    `SELECT id, user_id AS userId FROM notifications
     WHERE user_id != :acceptedByUserId
       AND data_json LIKE :sessionPattern`,
    { acceptedByUserId, sessionPattern },
  );

  if (rows.length > 0) {
    // Actually delete them from the database to clean up the bell dropdown completely
    await pool.query(
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
 * - Any admin/assistant may inspect an unassigned open session so they can
 *   claim it from the notification request modal.
 * - Admin role can access via the archive API but not the live Pusher channel.
 */
export const userCanAccessSession = async (sessionId, user) => {
  await ensureClientTalkEntryContextColumn();
  const [[row]] = await pool.query(
    `SELECT user_id AS userId, assigned_to AS assignedTo, status
     FROM client_talk_sessions
     WHERE id = :sessionId
     LIMIT 1`,
    { sessionId },
  );

  if (!row) return false;

  if (Number(row.userId) === Number(user.id)) return true;
  if (row.assignedTo && Number(row.assignedTo) === Number(user.id)) return true;
  if (
    !row.assignedTo &&
    ["admin", "assistant"].includes(user.role) &&
    ["pending", "active"].includes(row.status)
  ) {
    return true;
  }

  return false;
};

export const listRecordSessionsForUser = async (orderId, userId) => {
  await ensureClientTalkEntryContextColumn();
  const [rows] = await pool.query(
    `SELECT
       ${sessionSelectColumns}
     FROM client_talk_sessions s
     LEFT JOIN users u ON u.id = s.user_id
     LEFT JOIN users a ON a.id = s.assigned_to
     LEFT JOIN cases c ON c.id = s.order_id
     WHERE s.order_id = :orderId
       AND s.user_id = :userId
     ORDER BY COALESCE(s.last_message_at, s.requested_at) DESC, s.id DESC`,
    { orderId, userId },
  );
  return rows;
};

export const listRecordSessionsForStaff = async (orderId) => {
  await ensureClientTalkEntryContextColumn();
  const [rows] = await pool.query(
    `SELECT
       ${sessionSelectColumns}
     FROM client_talk_sessions s
     LEFT JOIN users u ON u.id = s.user_id
     LEFT JOIN users a ON a.id = s.assigned_to
     LEFT JOIN cases c ON c.id = s.order_id
     WHERE s.order_id = :orderId
     ORDER BY COALESCE(s.last_message_at, s.requested_at) DESC, s.id DESC`,
    { orderId },
  );
  return rows;
};

export const getRecordSessionDetailForUser = async (orderId, sessionId, userId) => {
  await ensureClientTalkEntryContextColumn();
  const session = await getSessionById(sessionId);
  if (!session) return null;
  if (Number(session.orderId) !== Number(orderId) || Number(session.userId) !== Number(userId)) {
    return null;
  }

  const result = await listSessionMessages(sessionId, { page: 1, perPage: 100 });
  return { ...session, messages: result.rows };
};

export const getRecordSessionDetailForStaff = async (orderId, sessionId) => {
  await ensureClientTalkEntryContextColumn();
  const session = await getSessionById(sessionId);
  if (!session) return null;
  if (Number(session.orderId) !== Number(orderId)) return null;

  const result = await listSessionMessages(sessionId, { page: 1, perPage: 100 });
  return { ...session, messages: result.rows };
};
