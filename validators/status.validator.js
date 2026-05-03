import { z } from "zod";

export const statusParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const statusCreatePayloadSchema = z.object({
  name: z.string().trim().min(2).max(80),
  color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).optional().default("#64748b"),
  sortOrder: z.coerce.number().int().min(0).max(10000).optional().default(0),
});

export const statusUpdatePayloadSchema = statusCreatePayloadSchema.partial().refine(
  (payload) => Object.keys(payload).length > 0,
  { message: "At least one status field is required" },
);
