import { z } from "zod";

export const chatPaymentSettingsSchema = z.object({
  paymentEnabled: z.coerce.boolean().default(false),
  planPrice: z.coerce.number().min(0).max(999999999).default(0),
  walletNumber: z.string().trim().max(80).optional().default(""),
  instapayHandle: z.string().trim().max(120).optional().default(""),
});

export const chatPaymentListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().positive().max(100).default(20),
  status: z.enum(["pending", "approved", "rejected"]).optional().or(z.literal("")).default(""),
  search: z.string().trim().max(120).optional().default(""),
});

export const chatPaymentParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const chatPaymentReviewSchema = z.object({
  reviewNote: z.string().trim().max(700).optional().nullable().or(z.literal("")),
});
