import { Router } from "express";
import { getUploadSignature } from "../controllers/storage.controller.js";
import { requireAdminOnly, requireAuth } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { asyncHandler } from "../utils/apiResponse.js";
import { uploadSignatureSchema } from "../validators/storage.validator.js";

const router = Router();

router.post("/signature", requireAuth, requireAdminOnly, validate(uploadSignatureSchema), asyncHandler(getUploadSignature));

export default router;
