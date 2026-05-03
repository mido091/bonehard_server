import { z } from "zod";

export const siteSettingsPayloadSchema = z.object({
  siteName: z.string().trim().min(2).max(160),
  addressCity: z.string().trim().max(190).optional().nullable().or(z.literal("")),
  mapTitle: z.string().trim().max(190).optional().nullable().or(z.literal("")),
  mapEmbedUrl: z.string().trim().url().max(700).optional().nullable().or(z.literal("")),
  copyrightText: z.string().trim().max(190).optional().nullable().or(z.literal("")),
  clearLogo: z.string().or(z.boolean()).optional(),
  clearFavicon: z.string().or(z.boolean()).optional(),
});

export const socialLinkPayloadSchema = z.object({
  label: z.string().trim().min(2).max(120),
  type: z.enum(["url", "whatsapp"]).default("url"),
  target: z.string().trim().min(3).max(700),
  sortOrder: z.coerce.number().int().min(0).max(100000).default(0),
  isActive: z.coerce.boolean().default(true),
});

export const recipientPayloadSchema = z.object({
  label: z.string().trim().max(120).optional().nullable().or(z.literal("")),
  email: z.string().trim().email().max(190),
  isActive: z.coerce.boolean().default(true),
});

export const contactSubmissionPayloadSchema = z.object({
  contactName: z.string().trim().min(2).max(160),
  contactNumber: z.string().trim().min(5).max(60),
  contactEmail: z.string().trim().email().max(190),
  scopeOfWork: z.string().trim().min(2).max(190),
  message: z.string().trim().max(10000).optional().nullable().or(z.literal("")),
  fileLink: z.string().trim().max(700).optional().nullable().or(z.literal("")),
});

export const contactSubmissionListSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().positive().max(100).default(20),
  status: z.enum(["new", "reviewed", "replied", "closed", "email_failed"]).optional(),
  search: z.string().trim().max(190).optional().default(""),
});

export const contactSubmissionUpdateSchema = z.object({
  status: z.enum(["new", "reviewed", "replied", "closed", "email_failed"]),
  notes: z.string().trim().max(5000).optional().nullable().or(z.literal("")),
});

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});
