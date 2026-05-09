import { Router } from "express";
import {
  analytics,
  assistants,
  changeRole,
  createAssistant,
  createUserRecord,
  createUserOrderNote,
  dashboard,
  deleteAdminOrderFileHandler,
  deleteUserRecord,
  deleteUserOrderNote,
  downloadUserOrderFile,
  exportDashboardCsv,
  exportUserOrderCsv,
  notifications,
  readNotification,
  stats,
  teamOptions,
  userOptions,
  exportUserOrderPackage,
  removeUserOrder,
  renameUserOrderFile,
  updateUserOrderNote,
  updateUserOrderStatus,
  uploadAdminOrderFile,
  userOrderDetail,
  userOrderNotes,
  userOrders,
  userReport,
  updateUserRecord,
  users,
} from "../controllers/admin.controller.js";
import {
  adminPaymentProof,
  adminPaymentSubmissions,
  approvePaymentSubmission,
  paymentSettings,
  rejectPaymentSubmission,
  updatePaymentSettings,
} from "../controllers/chatPayment.controller.js";
import {
  adminSiteSettings,
  createRecipient,
  createSocial,
  listSubmissions,
  removeRecipient,
  removeSocial,
  removeSubmission,
  saveSiteSettings,
  updateRecipient,
  updateSocial,
  updateSubmission,
} from "../controllers/siteSettings.controller.js";

import { requireAdminOnly, requireAdminOrAssistant, requireAuth } from "../middlewares/auth.middleware.js";
import { handleBrandAssetUpload, handleSocialIconUpload } from "../middlewares/siteAssetUpload.middleware.js";
import { handleCaseFileUpload } from "../middlewares/caseFileUpload.middleware.js";
import { uploadLimiter } from "../middlewares/rateLimit.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { asyncHandler } from "../utils/apiResponse.js";
import {
  assistantPayloadSchema,
  adminUserCreatePayloadSchema,
  adminUserUpdatePayloadSchema,
  listQuerySchema,
  notificationParamSchema,
  rolePayloadSchema,
  userRoleParamSchema,
} from "../validators/admin.validator.js";
import {
  chatPaymentListQuerySchema,
  chatPaymentParamSchema,
  chatPaymentReviewSchema,
  chatPaymentSettingsSchema,
} from "../validators/chatPayment.validator.js";
import { caseListQuerySchema, idParamSchema as caseIdParamSchema, statusPayloadSchema } from "../validators/case.validator.js";
import { generalNotePayloadSchema, listQuerySchema as caseExtraListQuerySchema } from "../validators/caseExtra.validator.js";
import { userOrderFileParamSchema, userOrderFileRenameSchema, userOrderNoteParamSchema } from "../validators/userOrder.validator.js";
import {
  contactSubmissionListSchema,
  contactSubmissionUpdateSchema,
  idParamSchema,
  recipientPayloadSchema,
  siteSettingsPayloadSchema,
  socialLinkPayloadSchema,
} from "../validators/siteSettings.validator.js";

const router = Router();

router.use(requireAuth, requireAdminOrAssistant);
router.get("/dashboard", asyncHandler(dashboard));
router.get("/dashboard/export-csv", asyncHandler(exportDashboardCsv));
router.get("/stats", asyncHandler(stats));
router.get("/payment-settings", requireAdminOnly, asyncHandler(paymentSettings));
router.patch("/payment-settings", requireAdminOnly, validate(chatPaymentSettingsSchema), asyncHandler(updatePaymentSettings));
router.get("/chat-payment-submissions", validate(chatPaymentListQuerySchema, "query"), asyncHandler(adminPaymentSubmissions));
router.get("/chat-payment-submissions/:id/proof", validate(chatPaymentParamSchema, "params"), asyncHandler(adminPaymentProof));
router.patch("/chat-payment-submissions/:id/approve", validate(chatPaymentParamSchema, "params"), validate(chatPaymentReviewSchema), asyncHandler(approvePaymentSubmission));
router.patch("/chat-payment-submissions/:id/reject", validate(chatPaymentParamSchema, "params"), validate(chatPaymentReviewSchema), asyncHandler(rejectPaymentSubmission));
router.get("/user-orders", validate(caseListQuerySchema, "query"), asyncHandler(userOrders));
router.get("/user-orders/:id/team-notes", validate(caseIdParamSchema, "params"), validate(caseExtraListQuerySchema, "query"), asyncHandler(userOrderNotes));
router.post("/user-orders/:id/team-notes", validate(caseIdParamSchema, "params"), validate(generalNotePayloadSchema), asyncHandler(createUserOrderNote));
router.patch("/user-orders/:id/team-notes/:noteId", validate(userOrderNoteParamSchema, "params"), validate(generalNotePayloadSchema), asyncHandler(updateUserOrderNote));
router.delete("/user-orders/:id/team-notes/:noteId", validate(userOrderNoteParamSchema, "params"), asyncHandler(deleteUserOrderNote));
router.post("/user-orders/:id/files", validate(caseIdParamSchema, "params"), uploadLimiter, handleCaseFileUpload, asyncHandler(uploadAdminOrderFile));
router.delete("/user-orders/:id/files/:fileId", validate(userOrderFileParamSchema, "params"), asyncHandler(deleteAdminOrderFileHandler));
router.get("/user-orders/:id/export-package", validate(caseIdParamSchema, "params"), asyncHandler(exportUserOrderPackage));
router.get("/user-orders/:id/export-csv", validate(caseIdParamSchema, "params"), asyncHandler(exportUserOrderCsv));
router.get("/user-orders/:id/files/:fileId/download", validate(userOrderFileParamSchema, "params"), asyncHandler(downloadUserOrderFile));
router.patch("/user-orders/:id/files/:fileId", validate(userOrderFileParamSchema, "params"), validate(userOrderFileRenameSchema), asyncHandler(renameUserOrderFile));
router.patch("/user-orders/:id/status", validate(caseIdParamSchema, "params"), validate(statusPayloadSchema), asyncHandler(updateUserOrderStatus));
router.delete("/user-orders/:id", validate(caseIdParamSchema, "params"), asyncHandler(removeUserOrder));
router.get("/user-orders/:id", validate(caseIdParamSchema, "params"), asyncHandler(userOrderDetail));
router.get("/users/options", asyncHandler(userOptions));
router.get("/teams/options", asyncHandler(teamOptions));
router.get("/users", requireAdminOnly, validate(listQuerySchema, "query"), asyncHandler(users));
router.post("/users", requireAdminOnly, validate(adminUserCreatePayloadSchema), asyncHandler(createUserRecord));
router.get("/users/:id/report", requireAdminOnly, asyncHandler(userReport));
router.patch("/users/:id", requireAdminOnly, validate(userRoleParamSchema, "params"), validate(adminUserUpdatePayloadSchema), asyncHandler(updateUserRecord));
router.delete("/users/:id", requireAdminOnly, validate(userRoleParamSchema, "params"), asyncHandler(deleteUserRecord));
router.patch("/users/:id/role", requireAdminOnly, validate(userRoleParamSchema, "params"), validate(rolePayloadSchema), asyncHandler(changeRole));

router.get("/assistants", requireAdminOnly, validate(listQuerySchema, "query"), asyncHandler(assistants));
router.post("/assistants", requireAdminOnly, validate(assistantPayloadSchema), asyncHandler(createAssistant));
router.get("/analytics", asyncHandler(analytics));
router.get("/notifications", validate(listQuerySchema, "query"), asyncHandler(notifications));
router.patch("/notifications/:id/read", validate(notificationParamSchema, "params"), asyncHandler(readNotification));

router.get("/site-settings", requireAdminOnly, asyncHandler(adminSiteSettings));
router.patch("/site-settings", requireAdminOnly, uploadLimiter, handleBrandAssetUpload, validate(siteSettingsPayloadSchema), asyncHandler(saveSiteSettings));
router.post("/site-settings/social-links", requireAdminOnly, uploadLimiter, handleSocialIconUpload, validate(socialLinkPayloadSchema), asyncHandler(createSocial));
router.patch("/site-settings/social-links/:id", requireAdminOnly, validate(idParamSchema, "params"), uploadLimiter, handleSocialIconUpload, validate(socialLinkPayloadSchema), asyncHandler(updateSocial));
router.delete("/site-settings/social-links/:id", requireAdminOnly, validate(idParamSchema, "params"), asyncHandler(removeSocial));
router.post("/site-settings/contact-recipients", requireAdminOnly, validate(recipientPayloadSchema), asyncHandler(createRecipient));
router.patch("/site-settings/contact-recipients/:id", requireAdminOnly, validate(idParamSchema, "params"), validate(recipientPayloadSchema), asyncHandler(updateRecipient));
router.delete("/site-settings/contact-recipients/:id", requireAdminOnly, validate(idParamSchema, "params"), asyncHandler(removeRecipient));
router.get("/contact-submissions", requireAdminOnly, validate(contactSubmissionListSchema, "query"), asyncHandler(listSubmissions));
router.patch("/contact-submissions/:id", requireAdminOnly, validate(idParamSchema, "params"), validate(contactSubmissionUpdateSchema), asyncHandler(updateSubmission));
router.delete("/contact-submissions/:id", requireAdminOnly, validate(idParamSchema, "params"), asyncHandler(removeSubmission));

export default router;
