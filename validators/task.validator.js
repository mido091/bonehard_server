import { z } from "zod";

const optionalDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .nullable()
  .or(z.literal(""));

const optionalMinutes = z.coerce.number().int().min(0).max(5256000).optional().nullable().or(z.literal(""));
const optionalIdArray = z.array(z.coerce.number().int().positive()).optional().default([]);

export const taskPayloadSchema = z.object({
  title: z.string().trim().min(2).max(190),
  description: z.string().trim().max(50000).optional().nullable(),
  priority: z.enum(["low", "normal", "medium", "high", "urgent"]).default("normal"),
  status: z.enum(["open", "assigned", "to-do", "in-progress", "completed"]).default("open"),
  privateTask: z.coerce.boolean().optional().default(false),
  preventEditing: z.coerce.boolean().optional().default(false),
  estimatedMinutes: optionalMinutes,
  timeSpentMinutes: optionalMinutes.default(0),
  taskType: z.enum(["to-do", "milestone"]).optional().default("to-do"),
  startDate: optionalDate,
  assigneeId: z.coerce.number().int().positive().optional().nullable(),
  dueDate: optionalDate,
  phaseId: z.coerce.number().int().positive().optional().nullable(),
  tags: z.array(z.string().trim().min(1).max(60)).optional().default([]),
  watcherIds: optionalIdArray,
  recurring: z.record(z.string(), z.any()).optional().nullable(),
});

export const taskUpdatePayloadSchema = z.object({
  title: z.string().trim().min(2).max(190).optional(),
  description: z.string().trim().max(50000).optional().nullable(),
  priority: z.enum(["low", "normal", "medium", "high", "urgent"]).optional(),
  status: z.enum(["open", "assigned", "to-do", "in-progress", "completed"]).optional(),
  privateTask: z.coerce.boolean().optional(),
  preventEditing: z.coerce.boolean().optional(),
  estimatedMinutes: optionalMinutes,
  timeSpentMinutes: optionalMinutes,
  taskType: z.enum(["to-do", "milestone"]).optional(),
  startDate: optionalDate,
  assigneeId: z.coerce.number().int().positive().optional().nullable(),
  dueDate: optionalDate,
  phaseId: z.coerce.number().int().positive().optional().nullable(),
  tags: z.array(z.string().trim().min(1).max(60)).optional(),
  watcherIds: z.array(z.coerce.number().int().positive()).optional(),
  recurring: z.record(z.string(), z.any()).optional().nullable(),
}).refine(
  (payload) => Object.keys(payload).length > 0,
  { message: "At least one task field is required" },
);

export const taskListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().max(120).optional().default(""),
  taskId: z.coerce.number().int().positive().optional(),
  status: z.enum(["open", "assigned", "to-do", "in-progress", "completed"]).optional(),
  priority: z.enum(["low", "normal", "medium", "high", "urgent"]).optional(),
  assigneeId: z.coerce.number().int().positive().optional(),
  phaseId: z.coerce.number().int().positive().optional(),
  taskType: z.enum(["to-do", "milestone"]).optional(),
  tag: z.string().trim().max(60).optional(),
  clientId: z.coerce.number().int().positive().optional(),
  dueFrom: optionalDate,
  dueTo: optionalDate,
  view: z.enum(["list", "card"]).optional().default("list"),
});

export const caseTaskParamSchema = z.object({
  id: z.coerce.number().int().positive(),
  // taskId is required for PATCH /tasks/:taskId and DELETE /tasks/:taskId
  taskId: z.coerce.number().int().positive(),
});
