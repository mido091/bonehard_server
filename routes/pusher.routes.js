import { Router } from "express";
import { pusherAuth } from "../controllers/chat.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { pusherLimiter } from "../middlewares/rateLimit.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { asyncHandler } from "../utils/apiResponse.js";
import { pusherAuthSchema } from "../validators/chat.validator.js";

const router = Router();

router.post("/auth", pusherLimiter, requireAuth, validate(pusherAuthSchema), asyncHandler(pusherAuth));

export default router;
