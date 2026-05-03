import { z } from "zod";

const optionalDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .nullable()
  .or(z.literal(""));

const optionalMoney = z.coerce.number().min(0).max(9999999999).optional().nullable().or(z.literal(""));
const optionalId = z.coerce.number().int().positive().optional().nullable();
const optionalUid = z.string().trim().max(120).optional().nullable().or(z.literal(""));

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const phaseParamSchema = z.object({
  id: z.coerce.number().int().positive(),
  phaseId: z.coerce.number().int().positive(),
});

export const customFieldParamSchema = z.object({
  fieldId: z.coerce.number().int().positive(),
});

export const resourceIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const timerParamSchema = z.object({
  id: z.coerce.number().int().positive(),
  timerId: z.coerce.number().int().positive(),
});

export const templateApplyParamSchema = z.object({
  id: z.coerce.number().int().positive(),
  templateId: z.coerce.number().int().positive(),
});

export const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().max(190).optional().default(""),
  folderType: z.enum(["private", "public", "tasks"]).optional(),
  status: z.enum(["running", "stopped", "pending", "exported", "failed", "open", "converted", "closed", "new", "quoted", "approved", "in-progress", "completed", "cancelled"]).optional(),
  targetId: z.coerce.number().int().positive().optional(),
  clientId: z.coerce.number().int().positive().optional(),
  price: optionalMoney,
  customUid: z.string().trim().max(80).optional().default(""),
  createdFrom: optionalDate,
  createdTo: optionalDate,
  dateFrom: optionalDate,
  dateTo: optionalDate,
  type: z.enum(["counting", "manual"]).optional(),
  archived: z.coerce.boolean().optional().default(false),
});

export const notePayloadSchema = z.object({
  subject: z.string().trim().min(2).max(190),
  content: z.string().trim().max(10000).optional().nullable(),
});

export const generalNotePayloadSchema = z.object({
  title: z.string().trim().min(2).max(190),
  content: z.string().trim().max(200000).optional().nullable(),
});

export const timerPayloadSchema = z.object({
  title: z.string().trim().min(2).max(190),
  taskId: z.coerce.number().int().positive().optional().nullable(),
  clientId: optionalId,
  timerType: z.enum(["counting", "manual"]).optional().default("counting"),
  status: z.enum(["running", "stopped"]).optional().default("stopped"),
  startedAt: z.string().trim().datetime().optional(),
  endedAt: z.string().trim().datetime().optional().nullable(),
  workDate: optionalDate,
  durationSeconds: z.coerce.number().int().min(0).max(31536000).optional().default(0),
  hourlyRate: optionalMoney,
  totalAmount: optionalMoney,
  isInvoiced: z.coerce.boolean().optional().default(false),
  note: z.string().trim().max(500).optional().nullable(),
});

export const filePayloadSchema = z.object({
  fileName: z.string().trim().min(2).max(190),
  fileUrl: z.string().trim().url().max(700),
  folderType: z.enum(["private", "public", "tasks"]).optional().default("private"),
  mimeType: z.string().trim().max(120).optional().nullable(),
  fileSize: z.coerce.number().int().min(0).optional().default(0),
  storageProvider: z.string().trim().max(60).optional().default("external"),
});

export const clientTalkPayloadSchema = z.object({
  body: z.string().trim().min(1).max(5000),
});

export const orderPayloadSchema = z.object({
  caseId: z.coerce.number().int().positive().optional().nullable(),
  userId: z.coerce.number().int().positive().optional().nullable(),
  patientName: z.string().trim().min(2).max(190),
  targetId: optionalId,
  title: z.string().trim().min(2).max(190).optional(),
  status: z.enum(["open", "converted", "closed", "new", "quoted", "approved", "in-progress", "completed", "cancelled"]).optional().default("open"),
  amount: z.coerce.number().min(0).optional().nullable(),
  price: optionalMoney,
  currency: z.string().trim().length(3).optional().default("USD"),
  customUid: optionalUid,
  integrationUid: optionalUid,
  orderNotes: z.string().trim().max(200000).optional().nullable(),
  surgeryDate: optionalDate,
  dob: optionalDate,
  jawSelection: z.enum(["maxilla", "mandible", "both"]).optional().nullable().or(z.literal("")),
  guideSupportType: z.enum(["tooth", "tissue", "bone"]).optional().nullable().or(z.literal("")),
  impressionType: z.string().trim().max(120).optional().nullable().or(z.literal("")),
  implantType: z.string().trim().max(120).optional().nullable().or(z.literal("")),
  numberOfImplants: z.coerce.number().int().min(0).max(64).optional().nullable().or(z.literal("")),
  dueDate: optionalDate,
});

export const templatePayloadSchema = z.object({
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(10000).optional().nullable(),
  isActive: z.coerce.boolean().optional().default(true),
  tasks: z.array(z.object({
    title: z.string().trim().min(2).max(190),
    description: z.string().trim().max(5000).optional().nullable(),
    priority: z.enum(["low", "normal", "medium", "high", "urgent"]).optional().default("normal"),
    status: z.enum(["open", "assigned", "to-do", "in-progress", "completed"]).optional().default("open"),
    phaseName: z.string().trim().max(160).optional().nullable(),
    privateTask: z.coerce.boolean().optional().default(false),
    estimatedMinutes: z.coerce.number().int().min(0).max(5256000).optional().nullable().or(z.literal("")),
    taskType: z.enum(["to-do", "milestone"]).optional().default("to-do"),
    startOffsetDays: z.coerce.number().int().min(-3650).max(3650).optional().nullable().or(z.literal("")),
    dueOffsetDays: z.coerce.number().int().min(-3650).max(3650).optional().nullable().or(z.literal("")),
    tags: z.array(z.string().trim().min(1).max(60)).optional().default([]),
    sortOrder: z.coerce.number().int().min(0).optional().default(0),
  })).optional().default([]),
});

export const customFieldPayloadSchema = z.object({
  label: z.string().trim().min(2).max(160),
  fieldKey: z.string().trim().regex(/^[a-z0-9_]+$/).max(120),
  fieldType: z.enum(["text", "number", "date", "select", "textarea", "checkbox"]).optional().default("text"),
  options: z.array(z.string().trim().max(120)).optional().default([]),
  isRequired: z.coerce.boolean().optional().default(false),
  sortOrder: z.coerce.number().int().min(0).optional().default(0),
});

export const phasePayloadSchema = z.object({
  name: z.string().trim().min(2).max(160),
  sortOrder: z.coerce.number().int().min(0).max(10000).optional().default(0),
});

export const phaseUpdatePayloadSchema = phasePayloadSchema.partial().refine(
  (payload) => Object.keys(payload).length > 0,
  { message: "At least one phase field is required" },
);

export const exportPayloadSchema = z.object({
  fileRows: z.coerce.number().int().min(0).optional().default(0),
  fileUrl: z.string().trim().url().max(700).optional().nullable().or(z.literal("")),
});

export const generatorPayloadSchema = z.object({
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(10000).optional().nullable(),
  templateId: z.coerce.number().int().positive().optional().nullable(),
  isActive: z.coerce.boolean().optional().default(true),
});

export const systemSettingsPayloadSchema = z.object({
  global: z.record(z.string(), z.any()).optional().default({}),
  notifications: z.record(z.string(), z.any()).optional().default({}),
  dashboard: z.record(z.string(), z.any()).optional().default({}),
  workRequest: z.record(z.string(), z.any()).optional().default({}),
});

export const productPayloadSchema = z.object({
  name: z.string().trim().min(2).max(190),
  price: z.coerce.number().min(0).optional().nullable(),
  description: z.string().trim().max(255).optional().nullable(),
});

export const sectorPayloadSchema = z.object({
  name: z.string().trim().min(2).max(160),
});
