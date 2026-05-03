import { z } from "zod";

export const notificationListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().positive().max(50).default(10),
});

export const notificationParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});
