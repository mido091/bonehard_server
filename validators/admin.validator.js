import { z } from "zod";

export const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().max(120).optional().default(""),
});

export const userRoleParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const rolePayloadSchema = z.object({
  role: z.enum(["user", "assistant", "admin"]),
});

export const assistantPayloadSchema = z.object({
  name: z.string().trim().min(2).max(160),
  email: z.string().trim().email().max(190),
  password: z.string().min(8).max(200),
  phone: z.string().trim().max(40).optional().nullable().or(z.literal("")),
  address: z.string().trim().max(255).optional().nullable().or(z.literal("")),
});

export const adminUserCreatePayloadSchema = z.object({
  name: z.string().trim().min(2).max(160),
  email: z.string().trim().email().max(190),
  password: z.string().min(8).max(200),
  phone: z.string().trim().max(40).optional().nullable().or(z.literal("")),
  address: z.string().trim().max(255).optional().nullable().or(z.literal("")),
  role: z.enum(["user", "assistant", "admin"]).default("user"),
  isActive: z.coerce.boolean().optional().default(true),
  chatEnabled: z.coerce.boolean().optional().default(false),
});

export const adminUserUpdatePayloadSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  email: z.string().trim().email().max(190).optional(),
  password: z.string().min(8).max(200).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().nullable().or(z.literal("")),
  address: z.string().trim().max(255).optional().nullable().or(z.literal("")),
  role: z.enum(["user", "assistant", "admin"]).optional(),
  isActive: z.coerce.boolean().optional(),
  chatEnabled: z.coerce.boolean().optional(),
}).refine(
  (value) => Object.keys(value).length > 0,
  { message: "At least one field is required" },
);

export const notificationParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});
