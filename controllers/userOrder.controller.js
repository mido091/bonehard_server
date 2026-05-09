import { listCustomFields } from "../repositories/caseExtra.repository.js";
import {
  createNotification,
  listAdminAssistantNotificationRecipients,
} from "../repositories/notification.repository.js";
import { getUserOrderDashboardAnalytics } from "../repositories/userDashboard.repository.js";
import { createUserOrderRecordWithFiles, deleteUserOrderFile, getUserOrderDetails, getUserOrderFile, getUserOrders, renameUserOrderFile, updateUserOrderRecordWithFiles } from "../services/case.service.js";
import { triggerRealtimeEvent } from "../services/pusher.service.js";
import { ApiError, sendSuccess } from "../utils/apiResponse.js";
import { userOrderPayloadSchema } from "../validators/userOrder.validator.js";

const withDownloadFileName = (url, fileName) => {
  const cleanUrl = url.replace(/([?&])download=[^&]*/i, "$1").replace(/[?&]$/, "");
  return `${cleanUrl}${cleanUrl.includes("?") ? "&" : "?"}download=${encodeURIComponent(fileName)}`;
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
  let url = file.fileUrl || file.cloudinarySecureUrl;
  if (!url) throw new ApiError(404, "File not found");

  if (file.storageProvider === "supabase") {
    url = withDownloadFileName(url, file.fileName);
  }

  return res.redirect(url);
};

export const settings = async (_req, res) => {
  const customFields = await listCustomFields();
  sendSuccess(res, { data: { customFields } });
};

const parseMultipartOrderPayload = (req) => {
  let rawPayload = req.body?.payload;
  if (Array.isArray(rawPayload)) rawPayload = rawPayload[0];

  if (!rawPayload) throw new ApiError(422, "Order payload is required");

  let parsed;
  try {
    parsed = JSON.parse(rawPayload);
  } catch {
    throw new ApiError(422, "Order payload must be valid JSON");
  }

  const result = userOrderPayloadSchema.safeParse(parsed);
  if (!result.success) throw new ApiError(422, "Validation failed", result.error.flatten());

  return result.data;
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
