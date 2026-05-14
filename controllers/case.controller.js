import {
  applyTemplateToCaseRecord,
  cloneCaseRecord,
  createCaseRecord,
  createCaseRecordWithFiles,
  createCaseTask,
  deleteCaseRecord,
  deleteCaseTask,
  getCaseDetails,
  getCases,
  getCaseTasks,
  getTasksGlobal,
  setCaseStatus,
  updateCaseRecord,
  updateCaseRecordWithFiles,
  updateCaseTask,
} from "../services/case.service.js";
import { exportCasePackage } from "../services/exportPackage.service.js";
import { exportCaseCsvPackage } from "../services/csvExport.service.js";
import { createSupabaseSignedUploadTarget } from "../services/supabase.service.js";
import {
  CASE_ALLOWED_UPLOAD_EXTENSIONS,
  CASE_ALLOWED_UPLOAD_HINT,
  MAX_CASE_FILE_SIZE_BYTES,
} from "../constants/uploadOptions.js";
import { ApiError, sendSuccess } from "../utils/apiResponse.js";
import { safeOriginalName } from "../utils/fileValidation.js";
import { casePayloadSchema } from "../validators/case.validator.js";

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
    folderKey: body.folderKey || (body.caseId ? String(body.caseId) : undefined),
  };
};

export const list = async (req, res) => {
  const result = await getCases(req.validatedQuery || req.query);
  sendSuccess(res, { data: result.rows, meta: result.meta });
};

export const create = async (req, res) => {
  const item = await createCaseRecord(req.validatedBody || req.body, req.user.id);
  sendSuccess(res, { data: item, message: "Case created", status: 201 });
};

/**
 * Parses and validates the JSON payload from a multipart/form-data request.
 * Multer places non-file fields in req.body; the case payload is sent
 * as a JSON string under the 'payload' key.
 */
const parseMultipartCasePayload = (req) => {
  let rawPayload = req.body?.payload;
  if (Array.isArray(rawPayload)) rawPayload = rawPayload[0];

  let parsed = req.body;
  if (rawPayload) {
    try {
      parsed = JSON.parse(rawPayload);
    } catch {
      throw new ApiError(422, "Case payload must be valid JSON");
    }
  }

  if (!parsed || typeof parsed !== "object") throw new ApiError(422, "Case payload is required");

  const result = casePayloadSchema.safeParse(parsed);
  if (!result.success) throw new ApiError(422, "Validation failed", result.error.flatten());

  return result.data;
};

export const signUpload = async (req, res) => {
  const input = validateSignedUploadRequest(req.body);
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

export const createWithFiles = async (req, res) => {
  const payload = parseMultipartCasePayload(req);
  const item = await createCaseRecordWithFiles(payload, req.user.id, req.files || []);
  sendSuccess(res, { data: item, message: "Case created", status: 201 });
};

export const detail = async (req, res) => {
  const item = await getCaseDetails(req.params.id);
  sendSuccess(res, { data: item });
};

export const exportPackage = async (req, res) => {
  await exportCasePackage(req.params.id, res);
};

export const exportCsv = async (req, res) => {
  await exportCaseCsvPackage(req.params.id, res);
};

export const update = async (req, res) => {
  const item = await updateCaseRecord(req.params.id, req.validatedBody || req.body);
  sendSuccess(res, { data: item, message: "Case updated" });
};

export const updateWithFiles = async (req, res) => {
  const payload = parseMultipartCasePayload(req);
  const item = await updateCaseRecordWithFiles(req.params.id, payload, req.user.id, req.files || []);
  sendSuccess(res, { data: item, message: "Case updated" });
};

export const updateStatus = async (req, res) => {
  const item = await setCaseStatus(req.params.id, req.validatedBody || req.body);
  sendSuccess(res, { data: item, message: "Case status updated" });
};

export const remove = async (req, res) => {
  await deleteCaseRecord(req.params.id);
  sendSuccess(res, { message: "Case deleted" });
};

export const listTasks = async (req, res) => {
  const result = await getCaseTasks(req.params.id, req.validatedQuery || req.query);
  sendSuccess(res, { data: result.rows, meta: result.meta });
};

export const createTask = async (req, res) => {
  const result = await createCaseTask(req.params.id, req.validatedBody || req.body);
  sendSuccess(res, { data: result.rows, meta: result.meta, message: "Task created", status: 201 });
};

export const updateTask = async (req, res) => {
  const result = await updateCaseTask(req.params.id, req.params.taskId, req.validatedBody || req.body);
  sendSuccess(res, { data: result.rows, meta: result.meta, message: "Task updated" });
};

export const removeTask = async (req, res) => {
  await deleteCaseTask(req.params.id, req.params.taskId);
  sendSuccess(res, { message: "Task deleted" });
};

export const clone = async (req, res) => {
  const item = await cloneCaseRecord(req.params.id, req.user.id);
  sendSuccess(res, { data: item, message: "Case cloned", status: 201 });
};

export const myTasks = async (req, res) => {
  const result = await getTasksGlobal(req.validatedQuery || req.query, "mine", req.user.id);
  sendSuccess(res, { data: result.rows, meta: result.meta });
};

export const allTasks = async (req, res) => {
  const result = await getTasksGlobal(req.validatedQuery || req.query, "all", req.user.id);
  sendSuccess(res, { data: result.rows, meta: result.meta });
};

export const applyTemplate = async (req, res) => {
  const result = await applyTemplateToCaseRecord(req.params.id, req.params.templateId);
  sendSuccess(res, { data: result.rows, meta: result.meta, message: "Template applied to case" });
};
