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
import { ApiError, sendSuccess } from "../utils/apiResponse.js";
import { casePayloadSchema } from "../validators/case.validator.js";

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

  if (!rawPayload) throw new ApiError(422, "Case payload is required");

  let parsed;
  try {
    parsed = JSON.parse(rawPayload);
  } catch {
    throw new ApiError(422, "Case payload must be valid JSON");
  }

  const result = casePayloadSchema.safeParse(parsed);
  if (!result.success) throw new ApiError(422, "Validation failed", result.error.flatten());

  return result.data;
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
