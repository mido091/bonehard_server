import { z } from "zod";

const optionalSheetId = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) return undefined;
  return value;
}, z.coerce.number().int().positive().optional());

export const sheetExportQuerySchema = z.object({
  apiKey: z.string().trim().min(1),
});

export const sheetSyncPayloadSchema = z.object({
  apiKey: z.string().trim().min(1),
  caseId: optionalSheetId,
  action: z.enum(["none", "delete"]).optional().default("none"),
  patientName: z.string().trim().min(1).max(190).optional(),
  status: z.string().trim().min(1).max(80).optional(),
  clientName: z.string().trim().max(220).optional(),
  projectLeader: z.string().trim().max(220).optional(),
  targetTime: z.string().trim().max(120).optional(),
  staffNotes: z.string().trim().max(100000).optional(),
  clientNotes: z.string().trim().max(100000).optional(),
  startDate: z.string().trim().max(30).optional(),
  dueDate: z.string().trim().max(30).optional(),
  rowNumber: z.coerce.number().int().positive().optional(),
  sheetName: z.string().trim().max(120).optional(),
  updatedAt: z.string().trim().max(80).optional(),
  source: z.string().trim().max(40).optional(),
});
