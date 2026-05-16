import { z } from "zod";

// Param: /sessions/:sessionId
export const sessionParamSchema = z.object({
  sessionId: z.coerce.number().int().positive(),
});

// Param: /orders/:id (for request & get-session)
export const orderParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

// Body: send message — body is optional when an image is attached
export const sendMessageSchema = z.object({
  body: z.string().trim().max(4000).optional().default(""),
});

// Query: archive list
export const archiveQuerySchema = z.object({
  page:       z.coerce.number().int().positive().default(1),
  perPage:    z.coerce.number().int().positive().max(100).default(20),
  search:     z.string().trim().max(120).optional().default(""),
  status:     z.enum(["pending","active","ended","all"]).optional().default("all"),
  assignedTo: z.coerce.number().int().positive().optional(),
  orderId:    z.coerce.number().int().positive().optional(),
  dateFrom:   z.string().trim().max(20).optional(),
  dateTo:     z.string().trim().max(20).optional(),
});

// Query: list messages (paginated)
export const messagesQuerySchema = z.object({
  page:    z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().positive().max(100).default(50),
});
