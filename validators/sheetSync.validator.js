import { z } from "zod";

export const sheetExportQuerySchema = z.object({
  apiKey: z.string().trim().min(1),
});

export const sheetSyncPayloadSchema = z.object({
  apiKey: z.string().trim().min(1),
  caseId: z.coerce.number().int().positive(),
  patientName: z.string().trim().min(1).max(190).optional(),
  status: z.string().trim().min(1).max(80).optional(),
  rowNumber: z.coerce.number().int().positive().optional(),
  sheetName: z.string().trim().max(120).optional(),
  updatedAt: z.string().trim().max(80).optional(),
  source: z.string().trim().max(40).optional(),
});
