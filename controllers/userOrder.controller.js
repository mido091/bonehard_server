import { listCaseFilesGlobal, listCaseNotesGlobal, listCustomFields } from "../repositories/caseExtra.repository.js";
import {
  createNotification,
  listAdminAssistantNotificationRecipients,
} from "../repositories/notification.repository.js";
import { getUserOrderDashboardAnalytics } from "../repositories/userDashboard.repository.js";
import { createUserOrderRecordWithFiles, deleteUserOrderFile, getUserOrderDetails, getUserOrderFile, getUserOrders, renameUserOrderFile, updateUserOrderRecordWithFiles } from "../services/case.service.js";
import { triggerRealtimeEvent } from "../services/pusher.service.js";
import { createSupabaseSignedUploadTarget, getSupabaseDownloadUrl } from "../services/supabase.service.js";
import {
  CASE_ALLOWED_UPLOAD_EXTENSIONS,
  CASE_ALLOWED_UPLOAD_HINT,
  MAX_CASE_FILE_SIZE_BYTES,
} from "../constants/uploadOptions.js";
import { ApiError, sendSuccess } from "../utils/apiResponse.js";
import { safeOriginalName } from "../utils/fileValidation.js";
import { userOrderPayloadSchema } from "../validators/userOrder.validator.js";

const ALLOWED_EXTENSIONS = new Set(CASE_ALLOWED_UPLOAD_EXTENSIONS);

const getUploadExtension = (fileName = "") => {
  const match = String(fileName).toLowerCase().match(/\.[a-z0-9]+$/);
  return match ? match[0] : "";
};

const validateSignedUploadRequest = (body = {}) => {
  const fileName = safeOriginalName(body.fileName || "");
  const extension = getUploadExtension(fileName);
  const fileSize = Number(body.fileSize || 0);

  if (!fileName || !ALLOWED_EXTENSIONS.has(extension)) {
    throw new ApiError(415, CASE_ALLOWED_UPLOAD_HINT);
  }
  if (!Number.isFinite(fileSize) || fileSize < 0 || fileSize > MAX_CASE_FILE_SIZE_BYTES) {
    throw new ApiError(413, "File size too large. Maximum is 1024MB per file.");
  }

  return {
    fileName,
    fileSize,
    mimeType: String(body.mimeType || "application/octet-stream").slice(0, 190),
    folderKey: body.folderKey || (body.orderId ? String(body.orderId) : undefined),
    orderId: body.orderId ? Number(body.orderId) : null,
  };
};

export const list = async (req, res) => {
  const result = await getUserOrders(req.validatedQuery || req.query, req.user.id);
  sendSuccess(res, { data: result.rows, meta: result.meta });
};

export const dashboard = async (req, res) => {
  const result = await getUserOrderDashboardAnalytics(req.user.id);
  sendSuccess(res, { data: result });
};

export const detail = async (req, res) => {
  const item = await getUserOrderDetails(req.params.id, req.user.id);
  sendSuccess(res, { data: item });
};

export const downloadFile = async (req, res) => {
  const file = await getUserOrderFile(req.params.id, req.params.fileId, req.user.id);
  const url = file.storageProvider === "supabase"
    ? await getSupabaseDownloadUrl(file)
    : file.fileUrl || file.cloudinarySecureUrl;
  if (!url) throw new ApiError(404, "File not found");

  return res.redirect(url);
};

export const settings = async (_req, res) => {
  const customFields = await listCustomFields();
  sendSuccess(res, { data: { customFields } });
};

export const files = async (req, res) => {
  const result = await listCaseFilesGlobal(req.validatedQuery || req.query, req.user);
  sendSuccess(res, { data: result.rows, meta: result.meta });
};

export const notes = async (req, res) => {
  const result = await listCaseNotesGlobal(req.validatedQuery || req.query, req.user);
  sendSuccess(res, { data: result.rows, meta: result.meta });
};

const parseMultipartOrderPayload = (req) => {
  let rawPayload = req.body?.payload;
  if (Array.isArray(rawPayload)) rawPayload = rawPayload[0];

  let parsed = req.body;
  if (rawPayload) {
    try {
      parsed = JSON.parse(rawPayload);
    } catch {
      throw new ApiError(422, "Order payload must be valid JSON");
    }
  }

  if (!parsed || typeof parsed !== "object") throw new ApiError(422, "Order payload is required");

  const result = userOrderPayloadSchema.safeParse(parsed);
  if (!result.success) throw new ApiError(422, "Validation failed", result.error.flatten());

  return result.data;
};

export const signUpload = async (req, res) => {
  const input = validateSignedUploadRequest(req.body);
  if (input.orderId) {
    await getUserOrderDetails(input.orderId, req.user.id);
  }

  const target = await createSupabaseSignedUploadTarget(input);
  sendSuccess(res, {
    data: {
      ...target,
      fileSize: input.fileSize,
    },
    message: "Upload target created",
    status: 201,
  });
};

const validateCustomFieldValues = async (values = {}) => {
  const fields = await listCustomFields();
  const errors = {};

  fields.forEach((field) => {
    const value = values[field.fieldKey];
    const isEmpty = value === undefined || value === null || value === "";

    if (field.isRequired && isEmpty) {
      errors[field.fieldKey] = [`${field.label} is required`];
      return;
    }

    const optionValues = (field.options || []).map((option) =>
      typeof option === "object" && option !== null ? option.value ?? option.id ?? option.label : option
    );
    if (!isEmpty && field.fieldType === "select" && optionValues.length && !optionValues.map(String).includes(String(value))) {
      errors[field.fieldKey] = [`${field.label} has an invalid value`];
    }
  });

  if (Object.keys(errors).length) {
    throw new ApiError(422, "Validation failed", { fieldErrors: errors });
  }
};

export const createWithFiles = async (req, res) => {
  const payload = parseMultipartOrderPayload(req);
  await validateCustomFieldValues(payload.customFieldValues);
  const item = await createUserOrderRecordWithFiles(payload, req.user.id, req.files || []);
  const recipients = await listAdminAssistantNotificationRecipients();

  await Promise.all(
    recipients.map(async (recipient) => {
      const notification = await createNotification({
        userId: recipient.id,
        type: "order",
        title: "New user order",
        body: `${req.user.name} submitted order "${item.name}".`,
        data: { orderId: item.id, userId: req.user.id },
      });

      await triggerRealtimeEvent(`private-user-${recipient.id}`, "notification.created", notification);
    }),
  );

  sendSuccess(res, { data: item, message: "Order submitted", status: 201 });
};

export const updateWithFiles = async (req, res) => {
  const payload = parseMultipartOrderPayload(req);
  await validateCustomFieldValues(payload.customFieldValues);
  
  const item = await updateUserOrderRecordWithFiles(req.params.id, payload, req.user.id, req.files || []);

  sendSuccess(res, { data: item, message: "Order updated successfully" });
};

/**
 * DELETE /api/user/orders/:id/files/:fileId
 * Deletes a single file from the user's order, verifying ownership first.
 */
export const deleteFile = async (req, res) => {
  const item = await deleteUserOrderFile(req.params.id, req.params.fileId, req.user.id);
  sendSuccess(res, { data: item, message: "File deleted" });
};

/**
 * PATCH /api/user/orders/:id/files/:fileId
 * Lets the order owner rename an uploaded file without changing the stored object.
 */
export const renameFile = async (req, res) => {
  const item = await renameUserOrderFile(req.params.id, req.params.fileId, req.user.id, (req.validatedBody || req.body).fileName);
  sendSuccess(res, { data: item, message: "File renamed" });
};
