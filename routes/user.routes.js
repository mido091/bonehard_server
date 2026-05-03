import { Router } from "express";
import { createUserChatPaymentSubmission, userChatOffer } from "../controllers/chatPayment.controller.js";
import { requireAuth, requireUserDashboard } from "../middlewares/auth.middleware.js";
import { handleCaseFileUpload } from "../middlewares/caseFileUpload.middleware.js";
import { uploadLimiter } from "../middlewares/rateLimit.middleware.js";
import { asyncHandler } from "../utils/apiResponse.js";

const router = Router();

router.use(requireAuth, requireUserDashboard);

router.get("/chat-offer", asyncHandler(userChatOffer));
router.post("/chat-payment-submissions", uploadLimiter, handleCaseFileUpload, asyncHandler(createUserChatPaymentSubmission));

export default router;
