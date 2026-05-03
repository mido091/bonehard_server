import { z } from "zod";

const allowedFolders = new Set([
  "bonehard/site",
  "bonehard/social",
  "bonehard/general",
]);

export const uploadSignatureSchema = z.object({
  folder: z.string().trim().max(120).optional().default("bonehard/general"),
  public_id: z.string().trim().max(160).optional(),
  timestamp: z.coerce.number().int().positive().optional(),
}).strict().refine(
  (value) => allowedFolders.has(value.folder),
  { path: ["folder"], message: "Upload folder is not allowed" },
);
