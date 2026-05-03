import { Router } from "express";
import { createWithFiles, dashboard, detail, downloadFile, list, settings } from "../controllers/userOrder.controller.js";
import { requireAuth, requireUserDashboard } from "../middlewares/auth.middleware.js";
import { handleCaseFileUpload } from "../middlewares/caseFileUpload.middleware.js";
import { uploadLimiter } from "../middlewares/rateLimit.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { asyncHandler } from "../utils/apiResponse.js";
import { userOrderFileParamSchema, userOrderListQuerySchema, userOrderParamSchema } from "../validators/userOrder.validator.js";

const router = Router();

router.use(requireAuth, requireUserDashboard);

router.get("/", validate(userOrderListQuerySchema, "query"), asyncHandler(list));
router.get("/dashboard", asyncHandler(dashboard));
router.get("/settings", asyncHandler(settings));
router.post("/with-files", uploadLimiter, handleCaseFileUpload, asyncHandler(createWithFiles));
router.get("/:id/files/:fileId/download", validate(userOrderFileParamSchema, "params"), asyncHandler(downloadFile));
router.get("/:id", validate(userOrderParamSchema, "params"), asyncHandler(detail));

export default router;
