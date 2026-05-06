import { Router } from "express";
import { syncFromSheet, syncToSheet } from "../controllers/sheetSync.controller.js";
import { validate } from "../middlewares/validate.middleware.js";
import { asyncHandler } from "../utils/apiResponse.js";
import { sheetExportQuerySchema, sheetSyncPayloadSchema } from "../validators/sheetSync.validator.js";

const router = Router();

router.get(
  "/sync-to-sheet",
  validate(sheetExportQuerySchema, "query"),
  asyncHandler(syncToSheet),
);

router.post(
  "/sync-from-sheet",
  validate(sheetSyncPayloadSchema),
  asyncHandler(syncFromSheet),
);

export default router;
