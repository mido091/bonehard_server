import { Router } from "express";
import { createStatus, deleteStatus, listStatuses, updateStatus } from "../controllers/status.controller.js";
import { requireAdminDashboard, requireAuth, requireRoles } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { asyncHandler } from "../utils/apiResponse.js";
import { statusCreatePayloadSchema, statusParamSchema, statusUpdatePayloadSchema } from "../validators/status.validator.js";

const router = Router();

router.get("/", requireAuth, requireAdminDashboard, asyncHandler(listStatuses));
router.post("/", requireAuth, requireAdminDashboard, requireRoles("admin"), validate(statusCreatePayloadSchema), asyncHandler(createStatus));
router.patch("/:id", requireAuth, requireAdminDashboard, requireRoles("admin"), validate(statusParamSchema, "params"), validate(statusUpdatePayloadSchema), asyncHandler(updateStatus));
router.delete("/:id", requireAuth, requireAdminDashboard, requireRoles("admin"), validate(statusParamSchema, "params"), asyncHandler(deleteStatus));

export default router;
