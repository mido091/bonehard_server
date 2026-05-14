import { Router } from "express";
import { createWithFiles, dashboard, deleteFile, detail, downloadFile, files, list, notes, renameFile, settings, signUpload, updateWithFiles } from "../controllers/userOrder.controller.js";
import { requireAuth, requireUserDashboard } from "../middlewares/auth.middleware.js";
import { handleCaseFileUpload } from "../middlewares/caseFileUpload.middleware.js";
import { uploadLimiter } from "../middlewares/rateLimit.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { asyncHandler } from "../utils/apiResponse.js";
import { userOrderFileParamSchema, userOrderFileRenameSchema, userOrderListQuerySchema, userOrderParamSchema } from "../validators/userOrder.validator.js";
import { listQuerySchema } from "../validators/caseExtra.validator.js";

const router = Router();

router.use(requireAuth, requireUserDashboard);

router.get("/", validate(userOrderListQuerySchema, "query"), asyncHandler(list));
router.get("/dashboard", asyncHandler(dashboard));
router.get("/settings", asyncHandler(settings));
router.get("/files", validate(listQuerySchema, "query"), asyncHandler(files));
router.get("/notes", validate(listQuerySchema, "query"), asyncHandler(notes));
router.post("/uploads/sign", uploadLimiter, asyncHandler(signUpload));
router.post("/with-files", uploadLimiter, handleCaseFileUpload, asyncHandler(createWithFiles));
router.get("/:id/files/:fileId/download", validate(userOrderFileParamSchema, "params"), asyncHandler(downloadFile));
router.patch("/:id/files/:fileId", validate(userOrderFileParamSchema, "params"), validate(userOrderFileRenameSchema), asyncHandler(renameFile));
router.delete("/:id/files/:fileId", validate(userOrderFileParamSchema, "params"), asyncHandler(deleteFile));
router.get("/:id", validate(userOrderParamSchema, "params"), asyncHandler(detail));
router.put("/:id/with-files", validate(userOrderParamSchema, "params"), uploadLimiter, handleCaseFileUpload, asyncHandler(updateWithFiles));


export default router;
