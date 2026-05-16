/**
 * clientTalk.controller.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Request handlers for the Client Talk feature.
 *
 * Authorization is enforced both via route-level middleware (requireAuth,
 * requireUserDashboard, requireAdminOnly) and within individual handlers
 * where participant-level access is needed (send message, end session).
 */

import {
  acceptSession,
  createOrReuseSession,
  createOrReuseSessionForStaff,
  createSessionMessage,
  deleteArchiveSession,
  dismissOtherSessionNotifications,
  endSession,
  getArchiveSessionDetail,
  getOpenSessionByOrderForUser,
  getRecordSessionDetailForStaff,
  getRecordSessionDetailForUser,
  getSessionById,
  listArchiveSessions,
  listRecordSessionsForStaff,
  listRecordSessionsForUser,
  listSessionMessages,
  userCanAccessSession,
} from "../repositories/clientTalk.repository.js";
import {
  createNotification,
  listAdminAssistantNotificationRecipients,
} from "../repositories/notification.repository.js";
import { pool } from "../config/db.js";
import { triggerRealtimeEvent } from "../services/pusher.service.js";
import {
  uploadFileToSupabase,
  removeTempUploadFile,
  getSupabaseDownloadUrl,
} from "../services/supabase.service.js";
import { ApiError, sendSuccess } from "../utils/apiResponse.js";

const hydrateMessageImageUrls = async (messages = []) => Promise.all(
  messages.map(async (msg) => {
    if (msg.messageType === "image" && msg.attachmentStoragePath) {
      try {
        const signedUrl = await getSupabaseDownloadUrl({
          storagePath: msg.attachmentStoragePath,
          fileName: msg.attachmentName,
        }, 86400 * 7);
        if (signedUrl) {
          return { ...msg, attachmentUrl: signedUrl };
        }
      } catch {
        // Keep the persisted URL as a fallback when re-signing fails.
      }
    }
    return msg;
  }),
);


// ─── User endpoints ───────────────────────────────────────────────────────────

/**
 * POST /api/user/orders/:id/client-talk/request
 * Creates (or reuses) a Client Talk session for the given order.
 * Sends notifications to all active admins and assistants.
 */
export const requestTalk = async (req, res) => {
  const orderId = Number(req.params.id);
  const userId  = req.user.id;

  // Verify the order belongs to this user before creating a session
  const [[orderRow]] = await pool.query(
    `SELECT id, name FROM cases WHERE id = :orderId AND target_id = :userId LIMIT 1`,
    { orderId, userId },
  );

  if (!orderRow) {
    throw new ApiError(404, "Order not found or does not belong to you");
  }

  // Create or reuse the pending/active session (idempotent)
  const session = await createOrReuseSession(orderId, userId, "user-order");

  // Notify staff only for the first open session. The session is active immediately
  // so the client can send details before a team member joins.
  if (session.status === "active" && !session.acceptedAt && !session.wasReusedOpenSession) {
    const recipients = await listAdminAssistantNotificationRecipients();

    await Promise.all(
      recipients.map(async (recipient) => {
        const notification = await createNotification({
          userId: recipient.id,
          type: "client_talk",
          title: "Client Talk Request",
          body: `${req.user.name} is requesting a live chat on order "${orderRow.name}".`,
          data: {
            sessionId: session.id,
            orderId,
            userId,
            orderName: orderRow.name,
            userName: req.user.name,
            sessionStatus: "active",
            entryContext: session.entryContext || "user-order",
          },
        });

        // Realtime push to each admin/assistant's private channel
        await triggerRealtimeEvent(
          `private-user-${recipient.id}`,
          "notification.created",
          notification,
        );
      }),
    );

    // Also broadcast a session.requested event on the session channel so any
    // already-subscribed admin can react immediately
    await triggerRealtimeEvent(
      `private-client-talk-session-${session.id}`,
      "session.requested",
      { sessionId: session.id, userId, userName: req.user.name },
    );
  }

  sendSuccess(res, { data: session, status: 201 });
};

/**
 * POST /api/admin/(user-orders|cases)/:id/client-talk/open
 * Opens the active Client Talk session from a staff-owned order/case screen.
 * If the client already started a session, this reuses it and assigns the
 * current staff member when it is still unassigned.
 */
export const openOrderTalkAsStaff = async (req, res) => {
  const orderId = Number(req.params.id);
  const entryContext = req.originalUrl.includes("/admin/cases/")
    ? "admin-case"
    : "admin-order";
  const session = await createOrReuseSessionForStaff(orderId, req.user.id, entryContext);

  if (!session) {
    throw new ApiError(404, "Order not found or is not linked to a user");
  }

  if (session.wasAssignedByRequester) {
    await dismissOtherSessionNotifications(session.id, req.user.id);
  }

  await triggerRealtimeEvent(
    `private-client-talk-session-${session.id}`,
    "session.accepted",
    {
      sessionId: session.id,
      assignedTo: session.assignedTo || req.user.id,
      assignedName: session.assignedName || req.user.name,
      entryContext: session.entryContext || "user-order",
    },
  );

  sendSuccess(res, {
    data: session,
    status: session.wasReusedOpenSession ? 200 : 201,
    message: "Conversation opened",
  });
};

/**
 * GET /api/user/orders/:id/client-talk/session
 * Returns the current open (pending or active) session for this order/user.
 * Returns null in data if no open session exists.
 */
export const getSession = async (req, res) => {
  const session = await getOpenSessionByOrderForUser(
    Number(req.params.id),
    req.user.id,
  );
  sendSuccess(res, { data: session });
};

/**
 * GET /api/user/orders/:id/client-talk/sessions
 * Lists all Client Talk sessions linked to one of the current user's orders.
 */
export const listUserOrderSessions = async (req, res) => {
  const orderId = Number(req.params.id);
  const userId = req.user.id;

  const [[orderRow]] = await pool.query(
    `SELECT id FROM cases WHERE id = :orderId AND target_id = :userId LIMIT 1`,
    { orderId, userId },
  );
  if (!orderRow) throw new ApiError(404, "Order not found or does not belong to you");

  const rows = await listRecordSessionsForUser(orderId, userId);
  sendSuccess(res, { data: rows });
};

/**
 * GET /api/user/orders/:id/client-talk/sessions/:sessionId
 * Returns a read-only transcript for a session owned by the current user.
 */
export const getUserOrderSessionTranscript = async (req, res) => {
  const orderId = Number(req.params.id);
  const sessionId = Number(req.params.sessionId);
  const session = await getRecordSessionDetailForUser(orderId, sessionId, req.user.id);

  if (!session) throw new ApiError(404, "Conversation not found");
  session.messages = await hydrateMessageImageUrls(session.messages || []);
  sendSuccess(res, { data: session });
};

// ─── Shared participant endpoints ─────────────────────────────────────────────

/**
 * GET /api/client-talk/sessions/:sessionId
 * Returns session metadata for active participants only.
 */
export const getParticipantSession = async (req, res) => {
  const sessionId = Number(req.params.sessionId);
  const session = await getSessionById(sessionId);

  if (!session) throw new ApiError(404, "Session not found");

  const allowed = await userCanAccessSession(sessionId, req.user);
  if (!allowed) {
    throw new ApiError(403, "You are not a participant of this conversation");
  }

  sendSuccess(res, { data: session });
};

/**
 * GET /api/client-talk/sessions/:sessionId/messages
 * Returns paginated messages for the session.
 * Accessible only to the user-owner and the assigned admin/assistant.
 */
export const listMessages = async (req, res) => {
  const sessionId = Number(req.params.sessionId);

  const allowed = await userCanAccessSession(sessionId, req.user);
  if (!allowed) {
    throw new ApiError(403, "You are not a participant of this conversation");
  }

  const result = await listSessionMessages(sessionId, req.validatedQuery || req.query);

  // Re-generate signed download URLs for image messages so recipients can view them
  const rows = await hydrateMessageImageUrls(result.rows);

  sendSuccess(res, { data: rows, meta: result.meta });
};


/**
 * POST /api/client-talk/sessions/:sessionId/messages
 * Sends a text message or an image into an active session.
 * Accepts both JSON (text) and multipart/form-data (image + optional text).
 * Only the user-owner and assigned admin/assistant may send.
 */
export const sendMessage = async (req, res) => {
  const sessionId = Number(req.params.sessionId);
  const session   = await getSessionById(sessionId);

  if (!session) throw new ApiError(404, "Session not found");
  if (!["pending", "active"].includes(session.status)) {
    throw new ApiError(400, "Cannot send messages — conversation is not active");
  }

  if (session.status === "pending") {
    await pool.query(
      `UPDATE client_talk_sessions SET status = 'active' WHERE id = :sessionId`,
      { sessionId },
    );
    session.status = "active";
  }

  const isOwner    = Number(session.userId) === Number(req.user.id);
  const isAssigned = session.assignedTo && Number(session.assignedTo) === Number(req.user.id);
  if (!isOwner && !isAssigned) {
    throw new ApiError(403, "You are not a participant of this conversation");
  }

  // ── Image attachment handling ──────────────────────────────────────────────
  let attachmentData = null;
  const uploadedFile = req.file || null; // set by chatImageUpload middleware

  if (uploadedFile) {
    let uploadResult = null;
    try {
      // Upload to Supabase under a dedicated chat/ sub-folder
      uploadResult = await uploadFileToSupabase(`chat/${sessionId}`, uploadedFile);

      // Try to generate a 7-day signed URL for private-bucket access.
      // Fall back to the Supabase public URL (works when bucket is public).
      let resolvedUrl = uploadResult.publicUrl; // always a valid URL format
      try {
        const signedUrl = await getSupabaseDownloadUrl({
          storagePath: uploadResult.supabasePath,
          fileName:    uploadResult.fileName,
        }, 86400 * 7);
        if (signedUrl) resolvedUrl = signedUrl;
      } catch {
        // Non-fatal: stick with the public URL fallback
      }

      attachmentData = {
        attachmentName:            uploadResult.fileName,
        attachmentUrl:             resolvedUrl,          // valid URL for immediate display
        attachmentMimeType:        uploadedFile.mimetype,
        attachmentSize:            uploadedFile.size || 0,
        attachmentStorageProvider: 'supabase',
        attachmentStoragePath:     uploadResult.supabasePath, // raw path for re-signing later
      };
    } catch (uploadError) {
      await removeTempUploadFile(uploadedFile);
      throw new ApiError(500, 'Failed to upload image. Please try again.');
    } finally {
      await removeTempUploadFile(uploadedFile);
    }
  }

  // At least one of body or image must be present
  const body = String((req.validatedBody || req.body).body || '').trim();
  if (!body && !attachmentData) {
    throw new ApiError(422, 'Message cannot be empty — provide text or an image');
  }

  const message = await createSessionMessage(sessionId, req.user.id, body, attachmentData);

  // The message already carries the signed URL from above; use it directly for broadcast.
  // We only need to re-generate if message.attachmentUrl is missing (edge case).
  let broadcastMessage = message;
  if (message.messageType === 'image' && !message.attachmentUrl && message.attachmentStoragePath) {
    try {
      const signedUrl = await getSupabaseDownloadUrl({
        storagePath: message.attachmentStoragePath,
        fileName: message.attachmentName,
      }, 86400 * 7);
      broadcastMessage = { ...message, attachmentUrl: signedUrl };
    } catch {
      // Non-fatal: leave attachmentUrl as stored
    }
  }

  // Broadcast to both parties in real time
  await triggerRealtimeEvent(
    `private-client-talk-session-${sessionId}`,
    'message.created',
    broadcastMessage,
  );

  const senderIsClient = Number(session.userId) === Number(req.user.id);
  const recipientId = senderIsClient ? session.assignedTo : session.userId;

  const bodyPreview = body || (attachmentData ? '📷 Image' : '');

  if (recipientId && Number(recipientId) !== Number(req.user.id)) {
    const notification = await createNotification({
      userId: recipientId,
      type: 'client_talk_message',
      title: 'New Client Talk Message',
      body: `${req.user.name || 'Team'}: ${bodyPreview.slice(0, 140)}`,
      data: {
        sessionId,
        orderId: session.orderId,
        orderName: session.orderName,
        userId: session.userId,
        userName: session.userName,
        assignedTo: session.assignedTo,
        assignedName: session.assignedName,
        entryContext: session.entryContext || "user-order",
      },
    });

    await triggerRealtimeEvent(
      `private-user-${recipientId}`,
      'notification.created',
      notification,
    );
  }

  sendSuccess(res, { data: broadcastMessage, status: 201 });
};

// ─── Admin / assistant endpoints ──────────────────────────────────────────────

/**
 * PATCH /api/client-talk/sessions/:sessionId/accept
 * Claims the session for the requesting admin/assistant.
 * Returns 409 if another person already accepted.
 */
export const acceptSessionHandler = async (req, res) => {
  const sessionId = Number(req.params.sessionId);

  const session = await acceptSession(sessionId, req.user.id);

  if (!session) {
    const current = await getSessionById(sessionId);
    if (!current) throw new ApiError(404, "Session not found");
    if (current.status === "ended") {
      throw new ApiError(409, "Conversation has ended", {
        status: current.status,
        endedAt: current.endedAt,
      });
    }
    throw new ApiError(409, "Conversation already accepted", {
      assignedTo:   current.assignedTo,
      assignedName: current.assignedName,
    });
  }

  if (!session.wasAlreadyAcceptedByRequester) {
    // Dismiss pending-request notifications for other admins/assistants only once.
    await dismissOtherSessionNotifications(sessionId, req.user.id);

    // Reopening an already-owned active session should not duplicate context messages.
    const clientOrigin = req.headers.origin || "http://localhost:5173";
    const orderUrl     = `${clientOrigin}/dashboard/orders/${session.orderId}`;
    const contextMsgText = `Order Details:\n${session.orderName || `Order #${session.orderId}`}\nLink: ${orderUrl}`;

    const initialMsg = await createSessionMessage(sessionId, req.user.id, contextMsgText);

    await triggerRealtimeEvent(
      `private-client-talk-session-${sessionId}`,
      "message.created",
      initialMsg,
    );

    await triggerRealtimeEvent(
      `private-client-talk-session-${sessionId}`,
      "session.accepted",
      {
        sessionId,
        assignedTo:   req.user.id,
        assignedName: req.user.name,
      },
    );
  }

  sendSuccess(res, {
    data: session,
    message: session.wasAlreadyAcceptedByRequester ? "Conversation opened" : "Conversation started",
  });
};

/**
 * PATCH /api/client-talk/sessions/:sessionId/end
 * Ends an active conversation. Both the user and the assigned staff may call this.
 */
export const endSessionHandler = async (req, res) => {
  const sessionId = Number(req.params.sessionId);
  const session   = await getSessionById(sessionId);

  if (!session) throw new ApiError(404, "Session not found");
  if (!["pending", "active"].includes(session.status)) {
    throw new ApiError(400, "This conversation is not active");
  }

  // Keep the close action symmetric with message access: only the client or the
  // assigned staff member may end a live conversation.
  const isOwner    = Number(session.userId) === Number(req.user.id);
  const isAssigned = session.assignedTo && Number(session.assignedTo) === Number(req.user.id);
  if (!isOwner && !isAssigned) {
    throw new ApiError(403, "You are not a participant of this conversation");
  }

  const ended = await endSession(sessionId, req.user.id);

  // Notify the other party that the conversation has ended
  await triggerRealtimeEvent(
    `private-client-talk-session-${sessionId}`,
    "session.ended",
    {
      sessionId,
      endedBy:   req.user.id,
      endedName: req.user.name,
      endedAt:   ended.endedAt,
    },
  );

  sendSuccess(res, { data: ended, message: "Conversation ended" });
};

export const listAdminRecordSessions = async (req, res) => {
  const rows = await listRecordSessionsForStaff(Number(req.params.id));
  sendSuccess(res, { data: rows });
};

export const getAdminRecordSessionTranscript = async (req, res) => {
  const session = await getRecordSessionDetailForStaff(
    Number(req.params.id),
    Number(req.params.sessionId),
  );

  if (!session) throw new ApiError(404, "Conversation not found");
  session.messages = await hydrateMessageImageUrls(session.messages || []);
  sendSuccess(res, { data: session });
};

// ─── Admin-only archive endpoints ─────────────────────────────────────────────

/**
 * GET /api/admin/client-talk/archive
 * Lists all Client Talk sessions for the admin archive with filters.
 */
export const listArchive = async (req, res) => {
  const result = await listArchiveSessions(req.validatedQuery || req.query);
  sendSuccess(res, { data: result.rows, meta: result.meta });
};

/**
 * GET /api/admin/client-talk/archive/:sessionId
 * Returns a full session with all messages for the archive detail view.
 */
export const getArchiveDetail = async (req, res) => {
  const session = await getArchiveSessionDetail(Number(req.params.sessionId));
  if (!session) throw new ApiError(404, "Session not found");
  session.messages = await hydrateMessageImageUrls(session.messages || []);
  sendSuccess(res, { data: session });
};

/**
 * DELETE /api/admin/client-talk/archive/:sessionId
 * Permanently removes a Client Talk transcript from the admin archive.
 */
export const deleteArchive = async (req, res) => {
  const sessionId = Number(req.params.sessionId);
  const session = await getSessionById(sessionId);

  if (!session) throw new ApiError(404, "Session not found");

  if (session.status === "active") {
    await triggerRealtimeEvent(
      `private-client-talk-session-${sessionId}`,
      "session.ended",
      {
        sessionId,
        endedBy: req.user.id,
        endedName: req.user.name,
        endedAt: new Date().toISOString(),
      },
    );
  }

  await deleteArchiveSession(sessionId);
  sendSuccess(res, { message: "Conversation deleted" });
};
