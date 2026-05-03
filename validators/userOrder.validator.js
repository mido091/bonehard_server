import { z } from "zod";

export const userOrderParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const userOrderFileParamSchema = z.object({
  id: z.coerce.number().int().positive(),
  fileId: z.coerce.number().int().positive(),
});

export const userOrderListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().max(120).optional().default(""),
  sortBy: z.enum(["name", "status", "target", "dueDate", "createdAt"]).optional().default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).optional().default("desc"),
});

export const userOrderPayloadSchema = z.object({
  name: z.string().trim().min(2).max(190),
  contactPhone: z.string().trim().min(5).max(40),
  contactEmail: z.string().trim().email().max(190),
  targetTime: z.string().trim().max(40).optional().nullable().or(z.literal("")),
  clientDescription: z.string().trim().max(100000).optional().nullable(),
  customFieldValues: z.record(z.string(), z.any()).optional().default({}),
});
