import { z } from "zod";
import { IMPLANT_SYSTEM_OPTIONS, SERVICES_NEEDED_OPTIONS } from "../constants/workflowOptions.js";

export const userOrderParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const userOrderFileParamSchema = z.object({
  id: z.coerce.number().int().positive(),
  fileId: z.coerce.number().int().positive(),
});

export const userOrderNoteParamSchema = z.object({
  id: z.coerce.number().int().positive(),
  noteId: z.coerce.number().int().positive(),
});

export const userOrderFileRenameSchema = z.object({
  fileName: z.string().trim().min(2).max(190),
});

export const adminFileVisibilitySchema = z.object({
  folderType: z.enum(['public', 'private']).optional().default('private'),
});

export const userOrderListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().max(120).optional().default(''),
  sortBy: z.enum(['name', 'status', 'target', 'dueDate', 'createdAt']).optional().default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).optional().default('desc'),
});

const optionalOtherText = z.string().trim().max(255).optional().nullable().or(z.literal(""));
const referenceLinkSchema = z.object({
  label: z.string().trim().max(160).optional().nullable().or(z.literal("")),
  url: z.string().trim().url().max(1000),
});

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

export const userOrderPayloadSchema = z.object({
  name: z.string().trim().min(2).max(190),
  contactPhone: z.string().trim().min(5).max(40),
  contactEmail: z.string().trim().email().max(190),
  targetTime: z.string().trim().max(40).optional().nullable().or(z.literal('')),
  clientDescription: z.string().trim().max(100000).optional().nullable(),
  customFieldValues: z.record(z.string(), z.any()).optional().default({}),
  fileCategories: z.array(z.enum(["dicom", "stl", "photos_documents", "general"])).optional().default([]),
  implantSystem: z.enum(IMPLANT_SYSTEM_OPTIONS).optional().nullable().or(z.literal("")),
  implantSystemOther: optionalOtherText,
  servicesNeeded: z.array(z.enum(SERVICES_NEEDED_OPTIONS)).optional().default([]),
  servicesNeededOther: optionalOtherText,
  referenceLinks: z.array(referenceLinkSchema).optional().default([]),
  links: z.array(referenceLinkSchema).optional().default([]),
}).superRefine(validateWorkflowOtherFields);
