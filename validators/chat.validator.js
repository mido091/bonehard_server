import { z } from "zod";

export const chatListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().positive().max(100).default(30),
});

export const conversationParamSchema = z.object({
  conversationId: z.coerce.number().int().positive(),
});

export const chatMessagePayloadSchema = z.object({
  body: z.string().trim().min(1).max(5000),
});

export const pusherAuthSchema = z.object({
  socket_id: z.string().trim().min(1).max(80),
  channel_name: z.string().trim().min(1).max(190),
});

export const createConversationSchema = z.object({
  type: z.enum(["direct", "group"]),
  name: z.string().trim().max(160).optional().nullable(),
  memberIds: z.array(z.coerce.number().int().positive()).min(1).max(50),
});

export const memberPayloadSchema = z.object({
  userId: z.coerce.number().int().positive(),
});
