/**
 * clientTalk.routes.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Routes for the Client Talk request-based chat system.
 *
 * Mounting points (in index.js):
 *   app.use("/api",        clientTalkUserRoutes);      // user-facing
 *   app.use("/api",        clientTalkSharedRoutes);    // shared participants
 *   app.use("/api/admin",  clientTalkAdminRoutes);     // admin archive
 */

import { Router } from "express";
import {
  acceptSessionHandler,
  deleteArchive,
  endSessionHandler,
  getArchiveDetail,
  getParticipantSession,
  getSession,
  listArchive,
  listMessages,
  openOrderTalkAsStaff,
  requestTalk,
  sendMessage,
} from "../controllers/clientTalk.controller.js";
import {
  requireAdminOnly,
  requireAdminOrAssistant,
  requireAuth,
  requireUserDashboard,
} from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { asyncHandler } from "../utils/apiResponse.js";
import {
  archiveQuerySchema,
  messagesQuerySchema,
  orderParamSchema,
  sendMessageSchema,
  sessionParamSchema,
} from "../validators/clientTalk.validator.js";

// ── User-only endpoints ────────────────────────────────────────────────────────
export const clientTalkUserRoutes = Router();

clientTalkUserRoutes.post(
  "/user/orders/:id/client-talk/request",
  requireAuth,
  requireUserDashboard,
  validate(orderParamSchema, "params"),
  asyncHandler(requestTalk),
);

clientTalkUserRoutes.get(
  "/user/orders/:id/client-talk/session",
  requireAuth,
  requireUserDashboard,
  validate(orderParamSchema, "params"),
  asyncHandler(getSession),
);

// ── Shared participant endpoints (auth only — participant check inside handler) ─
export const clientTalkSharedRoutes = Router();

clientTalkSharedRoutes.get(
  "/client-talk/sessions/:sessionId",
  requireAuth,
  validate(sessionParamSchema, "params"),
  asyncHandler(getParticipantSession),
);

clientTalkSharedRoutes.get(
  "/client-talk/sessions/:sessionId/messages",
  requireAuth,
  validate(sessionParamSchema, "params"),
  validate(messagesQuerySchema, "query"),
  asyncHandler(listMessages),
);

clientTalkSharedRoutes.post(
  "/client-talk/sessions/:sessionId/messages",
  requireAuth,
  validate(sessionParamSchema, "params"),
  validate(sendMessageSchema),
  asyncHandler(sendMessage),
);

clientTalkSharedRoutes.patch(
  "/client-talk/sessions/:sessionId/accept",
  requireAuth,
  requireAdminOrAssistant,
  validate(sessionParamSchema, "params"),
  asyncHandler(acceptSessionHandler),
);

clientTalkSharedRoutes.patch(
  "/client-talk/sessions/:sessionId/end",
  requireAuth,
  validate(sessionParamSchema, "params"),
  asyncHandler(endSessionHandler),
);

// ── Admin-only archive endpoints ───────────────────────────────────────────────
export const clientTalkAdminRoutes = Router();

clientTalkAdminRoutes.get(
  "/client-talk/archive",
  requireAuth,
  requireAdminOnly,
  validate(archiveQuerySchema, "query"),
  asyncHandler(listArchive),
);

clientTalkAdminRoutes.post(
  "/user-orders/:id/client-talk/open",
  requireAuth,
  requireAdminOrAssistant,
  validate(orderParamSchema, "params"),
  asyncHandler(openOrderTalkAsStaff),
);

clientTalkAdminRoutes.post(
  "/cases/:id/client-talk/open",
  requireAuth,
  requireAdminOrAssistant,
  validate(orderParamSchema, "params"),
  asyncHandler(openOrderTalkAsStaff),
);

clientTalkAdminRoutes.get(
  "/client-talk/archive/:sessionId",
  requireAuth,
  requireAdminOnly,
  validate(sessionParamSchema, "params"),
  asyncHandler(getArchiveDetail),
);

clientTalkAdminRoutes.delete(
  "/client-talk/archive/:sessionId",
  requireAuth,
  requireAdminOnly,
  validate(sessionParamSchema, "params"),
  asyncHandler(deleteArchive),
);
