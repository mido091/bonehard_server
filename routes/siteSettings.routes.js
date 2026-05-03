import { Router } from "express";
import { publicSiteSettings, submitContact } from "../controllers/siteSettings.controller.js";
import { publicFormLimiter } from "../middlewares/rateLimit.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { asyncHandler } from "../utils/apiResponse.js";
import { contactSubmissionPayloadSchema } from "../validators/siteSettings.validator.js";

const router = Router();

router.get("/site-settings/public", asyncHandler(publicSiteSettings));
router.post("/contact-submissions", publicFormLimiter, validate(contactSubmissionPayloadSchema), asyncHandler(submitContact));

export default router;
