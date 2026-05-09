import { z } from "zod";
import {
  CASE_STATUS_NAMES,
  IMPLANT_SYSTEM_OPTIONS,
  SERVICES_NEEDED_OPTIONS,
} from "../constants/workflowOptions.js";

const optionalDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .nullable()
  .or(z.literal(""));

const optionalId = z.coerce.number().int().positive().optional().nullable();
const optionalIdArray = z.array(z.coerce.number().int().positive()).optional().default([]);
const optionalMoney = z.coerce.number().min(0).max(9999999999).optional().nullable().or(z.literal(""));
const optionalHexColor = z
  .string()
  .trim()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/)
  .optional()
  .nullable()
  .or(z.literal(""));

const optionalOtherText = z.string().trim().max(255).optional().nullable().or(z.literal(""));

const workflowFieldsSchema = {
  implantSystem: z.enum(IMPLANT_SYSTEM_OPTIONS).optional().nullable().or(z.literal("")),
  implantSystemOther: optionalOtherText,
  servicesNeeded: z.array(z.enum(SERVICES_NEEDED_OPTIONS)).optional().default([]),
  servicesNeededOther: optionalOtherText,
};

const validateWorkflowOtherFields = (payload, ctx) => {
  if (payload.implantSystem !== "Other" && payload.implantSystemOther) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["implantSystemOther"],
      message: "Implant system details are only allowed when Other is selected",
    });
  }

  if (!(payload.servicesNeeded || []).includes("Other") && payload.servicesNeededOther) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["servicesNeededOther"],
      message: "Service details are only allowed when Other is selected",
    });
  }
};

export const caseListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().max(120).optional().default(""),
  statusId: z.coerce.number().int().positive().optional(),
  statusIds: z
    .union([
      z.array(z.coerce.number().int().positive()),
      z.coerce.number().int().positive().transform((value) => [value]),
      z.string().trim().min(1).transform((value) => value.split(",").map(Number).filter(Number.isFinite)),
    ])
    .optional(),
  targetId: z.coerce.number().int().positive().optional(),
  secondaryClientId: z.coerce.number().int().positive().optional(),
  projectLeaderId: z.coerce.number().int().positive().optional(),
  teammateId: z.coerce.number().int().positive().optional(),
  teamId: z.coerce.number().int().positive().optional(),
  fromDueDate: optionalDate,
  toDueDate: optionalDate,
  customUid: z.string().trim().max(80).optional().default(""),
  archived: z.coerce.boolean().optional().default(false),
  view: z.enum(["list", "card"]).optional().default("list"),
  sortBy: z.enum(["name", "status", "target", "dueDate", "createdAt"]).optional().default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).optional().default("desc"),
});

export const casePayloadSchema = z.object({
  name: z.string().trim().min(2).max(190),
  statusId: z.coerce.number().int().positive(),
  description: z.string().trim().max(100000).optional().nullable(),
  clientDescription: z.string().trim().max(100000).optional().nullable(),
  targetId: optionalId,
  secondaryClientId: optionalId,
  projectLeaderId: optionalId,
  startDate: optionalDate,
  estimatedCompletionDate: optionalDate,
  targetTime: z.string().trim().max(40).optional().nullable().or(z.literal("")),
  customUid: z.string().trim().max(80).optional().nullable().or(z.literal("")),
  progressTracking: z.coerce.boolean().optional().default(true),
  price: optionalMoney,
  color: optionalHexColor,
  templateId: optionalId,
  teamMemberIds: optionalIdArray,
  customFieldValues: z.record(z.string(), z.any()).optional().default({}),
  ...workflowFieldsSchema,
}).superRefine(validateWorkflowOtherFields);

export const statusPayloadSchema = z.object({
  statusId: z.coerce.number().int().positive().optional(),
  statusName: z.enum(CASE_STATUS_NAMES).optional(),
}).refine(
  (value) => Boolean(value.statusId || value.statusName),
  { message: "statusId or statusName is required" },
);

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});
