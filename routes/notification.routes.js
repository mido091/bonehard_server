import { Router } from "express";
import {
  notifications,
  removeAllNotifications,
  removeNotification,
  readAllNotifications,
  readNotification,
} from "../controllers/notification.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { asyncHandler } from "../utils/apiResponse.js";
import {
  notificationListQuerySchema,
  notificationParamSchema,
} from "../validators/notification.validator.js";

const router = Router();

router.use(requireAuth);
router.get("/", validate(notificationListQuerySchema, "query"), asyncHandler(notifications));
router.delete("/", asyncHandler(removeAllNotifications));
router.patch("/read-all", asyncHandler(readAllNotifications));
router.patch("/:id/read", validate(notificationParamSchema, "params"), asyncHandler(readNotification));
router.delete("/:id", validate(notificationParamSchema, "params"), asyncHandler(removeNotification));

export default router;
