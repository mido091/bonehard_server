import { z } from "zod";

const orderStatusSchema = z.enum(["new", "in_review", "contacted", "completed"]);

export const orderParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const orderListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: orderStatusSchema.optional(),
});

export const publicOrderPayloadSchema = z.object({
  contactName: z.string().trim().min(2).max(160),
  contactNumber: z.string().trim().min(5).max(40),
  contactEmail: z.string().trim().email().max(190),
  scopeOfWork: z.string().trim().min(10).max(10000),
  fileLink: z.string().trim().url().max(700).optional().nullable().or(z.literal("")),
});

export const orderUpdatePayloadSchema = z.object({
  status: orderStatusSchema,
  notes: z.string().trim().max(5000).optional().nullable(),
});
