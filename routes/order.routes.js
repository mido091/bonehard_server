import { Router } from "express";
import { submitOrder, getOrders, getOrder, updateOrder, removeOrder } from "../controllers/order.controller.js";
import { requireAuth, requireAdminDashboard } from "../middlewares/auth.middleware.js";
import { publicFormLimiter } from "../middlewares/rateLimit.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { asyncHandler } from "../utils/apiResponse.js";
import { orderListQuerySchema, orderParamSchema, orderUpdatePayloadSchema, publicOrderPayloadSchema } from "../validators/order.validator.js";

const router = Router();

// Public — anyone can submit an order
router.post("/", publicFormLimiter, validate(publicOrderPayloadSchema), asyncHandler(submitOrder));

// Admin only
router.use(requireAuth, requireAdminDashboard);
router.get("/", validate(orderListQuerySchema, "query"), asyncHandler(getOrders));
router.get("/:id", validate(orderParamSchema, "params"), asyncHandler(getOrder));
router.patch("/:id", validate(orderParamSchema, "params"), validate(orderUpdatePayloadSchema), asyncHandler(updateOrder));
router.delete("/:id", validate(orderParamSchema, "params"), asyncHandler(removeOrder));

export default router;
