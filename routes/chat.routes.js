import { Router } from "express";
import {
  addMember,
  conversations,
  conversationMembers,
  contacts,
  createConversation,
  deleteConversation,
  markConversationRead,
  messages,
  removeMember,
  sendMessage,
} from "../controllers/chat.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { chatLimiter } from "../middlewares/rateLimit.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { asyncHandler } from "../utils/apiResponse.js";
import {
  chatListQuerySchema,
  chatMessagePayloadSchema,
  conversationParamSchema,
  createConversationSchema,
  memberPayloadSchema,
} from "../validators/chat.validator.js";

const router = Router();

router.use(requireAuth);

// ── Conversations ──────────────────────────────────────────────────────────
router.get("/contacts", asyncHandler(contacts));
router.get("/conversations", validate(chatListQuerySchema, "query"), asyncHandler(conversations));
router.post("/conversations", chatLimiter, validate(createConversationSchema), asyncHandler(createConversation));

// ── Individual Conversation ────────────────────────────────────────────────
router.get("/:conversationId/messages", validate(conversationParamSchema, "params"), validate(chatListQuerySchema, "query"), asyncHandler(messages));
router.post("/:conversationId/messages", chatLimiter, validate(conversationParamSchema, "params"), validate(chatMessagePayloadSchema), asyncHandler(sendMessage));
router.patch("/:conversationId/read", validate(conversationParamSchema, "params"), asyncHandler(markConversationRead));
router.delete("/:conversationId", validate(conversationParamSchema, "params"), asyncHandler(deleteConversation));

// ── Members ────────────────────────────────────────────────────────────────
router.get("/:conversationId/members", validate(conversationParamSchema, "params"), asyncHandler(conversationMembers));
router.post("/:conversationId/members", validate(conversationParamSchema, "params"), validate(memberPayloadSchema), asyncHandler(addMember));
router.delete("/:conversationId/members", validate(conversationParamSchema, "params"), validate(memberPayloadSchema), asyncHandler(removeMember));

export default router;
