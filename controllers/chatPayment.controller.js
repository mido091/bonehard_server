import {
  createChatPaymentSubmission,
  getChatPaymentSettings,
  getChatPaymentSubmissionById,
  getLatestChatPaymentSubmissionForUser,
  listChatPaymentSubmissions,
  reviewChatPaymentSubmission,
  saveChatPaymentSettings,
  setUserChatEnabled,
} from "../repositories/chatPayment.repository.js";
import { createNotification } from "../repositories/notification.repository.js";
import { downloadSupabaseFile, uploadFileToSupabase } from "../services/supabase.service.js";
import { triggerRealtimeEvent } from "../services/pusher.service.js";
import { ApiError, sendSuccess } from "../utils/apiResponse.js";
import { cleanUploadDisplayName } from "../utils/fileValidation.js";

export const paymentSettings = async (_req, res) => {
  const settings = await getChatPaymentSettings();
  sendSuccess(res, { data: settings });
};

export const updatePaymentSettings = async (req, res) => {
  const settings = await saveChatPaymentSettings(req.validatedBody || req.body);
  sendSuccess(res, { data: settings, message: "Payment settings saved" });
};

export const userChatOffer = async (req, res) => {
  const [settings, latestSubmission] = await Promise.all([
    getChatPaymentSettings(),
    getLatestChatPaymentSubmissionForUser(req.user.id),
  ]);

  sendSuccess(res, {
    data: {
      settings,
      chatEnabled: req.user.role !== "user" || req.user.chatEnabled === true || req.user.chatEnabled === 1,
      latestSubmission,
    },
  });
};

export const createUserChatPaymentSubmission = async (req, res) => {
  const settings = await getChatPaymentSettings();
  if (!settings.paymentEnabled) throw new ApiError(422, "Paid chat plan is currently disabled");
  if (req.user.chatEnabled) throw new ApiError(422, "Chat access is already enabled");

  const transferPhone = String(req.body?.transferPhone || "").trim();
  if (!transferPhone || transferPhone.length > 60) {
    throw new ApiError(422, "Transfer phone or account number is required");
  }

  const latest = await getLatestChatPaymentSubmissionForUser(req.user.id);
  if (latest?.status === "pending") {
    throw new ApiError(422, "Your payment is already under review");
  }

  const proof = req.files?.[0];
  if (!proof) throw new ApiError(422, "Payment proof is required");

  const upload = await uploadFileToSupabase(`chat-payments-${req.user.id}`, proof);
  const item = await createChatPaymentSubmission({
    userId: req.user.id,
    transferPhone,
    amount: settings.planPrice,
    proofFileName: cleanUploadDisplayName(proof.originalname),
    proofFileUrl: upload.fileUrl,
    proofMimeType: proof.mimetype,
    proofFileSize: proof.buffer.length,
    proofStorageProvider: "supabase",
    proofStoragePath: upload.supabasePath,
  });

  sendSuccess(res, { data: item, message: "Payment submitted for review", status: 201 });
};

export const adminPaymentSubmissions = async (req, res) => {
  const result = await listChatPaymentSubmissions(req.validatedQuery || req.query);
  sendSuccess(res, { data: result.rows, meta: result.meta });
};

export const adminPaymentProof = async (req, res) => {
  const submission = await getChatPaymentSubmissionById(req.params.id);
  if (!submission) throw new ApiError(404, "Payment submission not found");
  if (submission.proofStorageProvider !== "supabase" || !submission.proofStoragePath) {
    throw new ApiError(404, "Payment proof is not available for preview");
  }

  const file = await downloadSupabaseFile(submission.proofStoragePath);
  if (!file) throw new ApiError(404, "Payment proof is not available for preview");

  const buffer = Buffer.from(await file.arrayBuffer());
  const filename = encodeURIComponent(submission.proofFileName || "payment-proof");

  // Force inline rendering so admins can review proofs without downloading files.
  res.setHeader("Content-Type", submission.proofMimeType || "application/octet-stream");
  res.setHeader("Content-Length", buffer.length);
  res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${filename}`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.send(buffer);
};

const notifyPaymentReview = async (submission, approved) => {
  const notification = await createNotification({
    userId: submission.userId,
    type: "chat_payment",
    title: approved ? "Payment approved" : "Payment rejected",
    body: approved
      ? "Your chat payment has been approved. Team Chat is now available."
      : "Your chat payment was not approved. Please review your payment details and submit again.",
    data: { paymentSubmissionId: submission.id, status: submission.status },
  });
  await triggerRealtimeEvent(`private-user-${submission.userId}`, "notification.created", notification);
};

export const approvePaymentSubmission = async (req, res) => {
  const existing = await getChatPaymentSubmissionById(req.params.id);
  if (!existing) throw new ApiError(404, "Payment submission not found");
  if (existing.status !== "pending") throw new ApiError(422, "Payment submission has already been reviewed");

  const item = await reviewChatPaymentSubmission({
    id: req.params.id,
    status: "approved",
    reviewerId: req.user.id,
    reviewNote: req.body?.reviewNote,
  });
  await setUserChatEnabled(item.userId, true);
  await notifyPaymentReview(item, true);
  sendSuccess(res, { data: item, message: "Payment approved" });
};

export const rejectPaymentSubmission = async (req, res) => {
  const existing = await getChatPaymentSubmissionById(req.params.id);
  if (!existing) throw new ApiError(404, "Payment submission not found");
  if (existing.status !== "pending") throw new ApiError(422, "Payment submission has already been reviewed");

  const item = await reviewChatPaymentSubmission({
    id: req.params.id,
    status: "rejected",
    reviewerId: req.user.id,
    reviewNote: req.body?.reviewNote,
  });
  await notifyPaymentReview(item, false);
  sendSuccess(res, { data: item, message: "Payment rejected" });
};
