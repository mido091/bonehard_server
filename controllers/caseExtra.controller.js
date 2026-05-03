import {
  createReadStream,
  existsSync,
  unlinkSync,
} from "node:fs";
import { Readable } from "node:stream";
import path from "node:path";
import {
  createCaseGenerator,
  createCaseFile,
  createCaseGeneralNote,
  createCaseNote,
  createCaseNotesExport,
  createCasePhase,
  createProduct,
  createSector,
  createCaseTimer,
  createCustomField,
  createOrder,
  createTemplate,
  createTemplateTask,
  deleteCaseFile,
  deleteProduct,
  deleteSector,
  deleteCasePhase,
  deleteCustomField,
  deleteTemplate,
  deleteTemplateTask,
  getOrderById,
  getCaseFileById,
  listCaseFiles,
  listCaseGenerators,
  listCaseGeneralNotes,
  listCaseNotes,
  listCaseNotesExports,
  listCasePhases,
  listCaseTimers,
  listGlobalNotesExports,
  listCaseSystemSettings,
  listCustomFields,
  listGlobalTimers,
  listOrders,
  listProducts,
  listSectors,
  listTemplateTasks,
  listTemplates,
  markOrderConverted,
  updateTemplateTask,
  updateTimerStatus,
  updateOrder,
  archiveOrder,
  upsertCaseSystemSettings,
  updateCasePhase,
} from "../repositories/caseExtra.repository.js";

import { getCaseDetails, getCases } from "../services/case.service.js";
import { CASE_UPLOAD_ROOT } from "../middlewares/caseFileUpload.middleware.js";
import { uploadFileToSupabase, deleteSupabaseFile } from "../services/supabase.service.js";
import { ApiError, sendSuccess } from "../utils/apiResponse.js";

const withDownloadFileName = (url, fileName) => {
  const cleanUrl = url.replace(/([?&])download=[^&]*/i, "$1").replace(/[?&]$/, "");
  return `${cleanUrl}${cleanUrl.includes("?") ? "&" : "?"}download=${encodeURIComponent(fileName)}`;
};



export const notes = async (req, res) => {
  await getCaseDetails(req.params.id);
  const result = await listCaseNotes(req.params.id, req.validatedQuery || req.query);
  sendSuccess(res, { data: result.rows, meta: result.meta });
};

export const createNote = async (req, res) => {
  await getCaseDetails(req.params.id);
  await createCaseNote(req.params.id, req.validatedBody || req.body, req.user.id);
  const result = await listCaseNotes(req.params.id, { page: 1, perPage: 20 });
  sendSuccess(res, { data: result.rows, meta: result.meta, message: "Note created", status: 201 });
};

export const generalNotes = async (req, res) => {
  await getCaseDetails(req.params.id);
  const result = await listCaseGeneralNotes(req.params.id, req.validatedQuery || req.query);
  sendSuccess(res, { data: result.rows, meta: result.meta });
};

export const createGeneralNote = async (req, res) => {
  await getCaseDetails(req.params.id);
  await createCaseGeneralNote(req.params.id, req.validatedBody || req.body, req.user.id);
  const result = await listCaseGeneralNotes(req.params.id, { page: 1, perPage: 20 });
  sendSuccess(res, { data: result.rows, meta: result.meta, message: "General note created", status: 201 });
};

export const timers = async (req, res) => {
  await getCaseDetails(req.params.id);
  const result = await listCaseTimers(req.params.id, req.validatedQuery || req.query);
  sendSuccess(res, { data: result.rows, meta: result.meta });
};

export const createTimer = async (req, res) => {
  await getCaseDetails(req.params.id);
  await createCaseTimer(req.params.id, req.validatedBody || req.body, req.user.id);
  const result = await listCaseTimers(req.params.id, { page: 1, perPage: 20 });
  sendSuccess(res, { data: result.rows, meta: result.meta, message: "Timer created", status: 201 });
};

export const files = async (req, res) => {
  await getCaseDetails(req.params.id);
  const result = await listCaseFiles(req.params.id, req.validatedQuery || req.query);
  sendSuccess(res, { data: result.rows, meta: result.meta });
};

export const createFile = async (req, res) => {
  await getCaseDetails(req.params.id);
  await createCaseFile(req.params.id, req.validatedBody || req.body, req.user.id);
  const result = await listCaseFiles(req.params.id, { page: 1, perPage: 20 });
  sendSuccess(res, { data: result.rows, meta: result.meta, message: "File saved", status: 201 });
};

export const uploadFiles = async (req, res) => {
  const caseId = Number(req.params.id);
  await getCaseDetails(caseId);

  if (!req.files?.length) {
    throw new ApiError(422, "Select at least one file to upload");
  }

  const uploadPromises = req.files.map(async (file) => {
    const uploadResult = await uploadFileToSupabase(caseId, file);

    return createCaseFile(caseId, {
      folderType:              "private",
      fileName:                uploadResult.fileName,
      fileUrl:                 uploadResult.fileUrl,
      mimeType:                file.mimetype,
      fileSize:                file.buffer.length,
      storageProvider:         "supabase",
      cloudinaryPublicId:      uploadResult.supabasePath || null,
      cloudinaryResourceType:  null,
      cloudinarySecureUrl:     uploadResult.fileUrl,
      cloudinaryVersion:       null,
    }, req.user?.id || null);
  });

  await Promise.all(uploadPromises);

  const result = await listCaseFiles(caseId, { page: 1, perPage: 20 });
  sendSuccess(res, { data: result.rows, meta: result.meta, message: "Files uploaded", status: 201 });
};

export const downloadFile = async (req, res) => {
  const caseId = Number(req.params.id);
  const fileId = Number(req.params.fileId);
  await getCaseDetails(caseId);

  const file = await getCaseFileById(caseId, fileId);
  if (!file) throw new ApiError(404, "File not found");

  // Cloud-hosted files (supabase, firebase, cloudinary) — redirect to their URL
  if (["supabase", "firebase", "cloudinary"].includes(file.storageProvider)) {
    let url = file.fileUrl || file.cloudinarySecureUrl;
    if (!url) throw new ApiError(404, "File not found");

    // Force Supabase URLs to download if they don't already have the query param
    if (file.storageProvider === "supabase") {
      url = withDownloadFileName(url, file.fileName);
    }

    return res.redirect(url);
  }

  // Local files — stream directly from disk
  const relativePath = file.cloudinaryPublicId || file.fileUrl;
  if (!relativePath) throw new ApiError(404, "File not found");

  // Try uploads root first, then legacy CASE_UPLOAD_ROOT
  const { join } = await import("node:path");
  let resolvedPath = join(UPLOADS_ROOT, relativePath);

  if (!existsSync(resolvedPath)) {
    // Fallback: legacy local path
    resolvedPath = path.resolve(CASE_UPLOAD_ROOT, file.fileUrl || "");
    if (!resolvedPath.startsWith(CASE_UPLOAD_ROOT) || !existsSync(resolvedPath)) {
      throw new ApiError(404, "File not found on disk");
    }
  }

  res.setHeader("Content-Type", file.mimeType || "application/octet-stream");
  res.setHeader("Content-Length", file.fileSize || 0);
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`);
  createReadStream(resolvedPath).pipe(res);
};

export const removeFile = async (req, res) => {
  const caseId = Number(req.params.id);
  const fileId = Number(req.params.fileId);
  await getCaseDetails(caseId);

  const file = await getCaseFileById(caseId, fileId);
  if (!file) throw new ApiError(404, "File not found");

  await deleteCaseFile(caseId, fileId);

  // Delete from the appropriate storage
  if (file.storageProvider === "supabase" && file.cloudinaryPublicId) {
    await deleteSupabaseFile(file.cloudinaryPublicId);
  } else if (file.storageProvider === "firebase" && file.cloudinaryPublicId) {
    try {
      const { deleteFirebaseFile } = await import("../services/firebase.service.js");
      await deleteFirebaseFile(file.cloudinaryPublicId);
    } catch (e) {
      console.warn("Could not load firebase.service to delete legacy firebase file", e.message);
    }
  } else if (["local", null, "external"].includes(file.storageProvider) && file.cloudinaryPublicId) {
    try {
      const { deleteLocalFile } = await import("../services/localStorage.service.js");
      await deleteLocalFile(file.cloudinaryPublicId);
    } catch (e) {
      console.warn("Could not load localStorage.service to delete legacy local file", e.message);
    }
  }

  // Legacy disk cleanup for old fileUrl-based local files
  if (file.storageProvider === "local" && file.fileUrl && !file.cloudinaryPublicId) {
    const resolvedPath = path.resolve(CASE_UPLOAD_ROOT, file.fileUrl);
    if (resolvedPath.startsWith(CASE_UPLOAD_ROOT) && existsSync(resolvedPath)) {
      try { unlinkSync(resolvedPath); } catch (err) {
        console.error("Failed to delete legacy local file:", err);
      }
    }
  }

  sendSuccess(res, { message: "File deleted" });
};

export const orders = async (req, res) => {
  const result = await listOrders(req.validatedQuery || req.query);
  sendSuccess(res, { data: result.rows, meta: result.meta });
};

export const createOrderRecord = async (req, res) => {
  await createOrder(req.validatedBody || req.body);
  const result = await listOrders({ page: 1, perPage: 20 });
  sendSuccess(res, { data: result.rows, meta: result.meta, message: "Order created", status: 201 });
};

export const updateOrderRecord = async (req, res) => {
  await updateOrder(req.params.orderId, req.validatedBody || req.body);
  const result = await listOrders({ page: 1, perPage: 20 });
  sendSuccess(res, { data: result.rows, meta: result.meta, message: "Order updated" });
};

export const removeOrderRecord = async (req, res) => {
  await archiveOrder(req.params.orderId);
  const result = await listOrders({ page: 1, perPage: 20 });
  sendSuccess(res, { data: result.rows, meta: result.meta, message: "Order archived" });
};

/**
 * POST /api/cases/orders/:orderId/convert
 * Converts an existing Work Order into a full Case, linking them together.
 * - Fetches the order to pre-populate the case name.
 * - Creates the case via the service layer (handles template + custom fields).
 * - Marks the original order as 'converted' with a reference to the new case.
 */
export const convertOrderToCase = async (req, res) => {
  const orderId = Number(req.params.orderId);
  const order = await getOrderById(orderId);
  if (!order) {
    return res.status(404).json({ success: false, error: "Order not found" });
  }
  if (order.status === "converted") {
    return res.status(422).json({ success: false, error: "This order has already been converted to a case" });
  }

  // Use the patient name as the default case name; allow override from body
  const caseName = req.body?.caseName || order.patient_name || order.title || `Case from Order #${orderId}`;

  // We need a default status — pick the first available one
  const [statusRows] = await import("../config/db.js").then(m =>
    m.pool.execute(`SELECT id FROM case_statuses ORDER BY sort_order ASC, id ASC LIMIT 1`),
  );
  const defaultStatusId = statusRows[0]?.id;
  if (!defaultStatusId) {
    return res.status(500).json({ success: false, error: "No case statuses configured. Please add at least one status in Settings." });
  }

  const newCase = await createCaseRecord(
    {
      name: caseName,
      statusId: defaultStatusId,
      description: order.order_notes || null,
      targetId: order.target_id || null,
      teamMemberIds: [],
      customFieldValues: {},
    },
    req.user.id,
  );

  // Link the original order to the new case and mark it as converted
  await markOrderConverted(orderId, newCase.id);

  sendSuccess(res, { data: newCase, message: "Order successfully converted to a case", status: 201 });
};

export const templates = async (req, res) => {
  const result = await listTemplates(req.validatedQuery || req.query);
  sendSuccess(res, { data: result.rows, meta: result.meta });
};

export const createTemplateRecord = async (req, res) => {
  await createTemplate(req.validatedBody || req.body, req.user.id);
  const result = await listTemplates({ page: 1, perPage: 20 });
  sendSuccess(res, { data: result.rows, meta: result.meta, message: "Template created", status: 201 });
};

// ── Template Tasks CRUD ────────────────────────────────────────────────────────

/** GET /api/cases/templates/:templateId/tasks */
export const templateTasks = async (req, res) => {
  const rows = await listTemplateTasks(req.params.templateId);
  sendSuccess(res, { data: rows });
};

/** POST /api/cases/templates/:templateId/tasks */
export const addTemplateTask = async (req, res) => {
  const task = await createTemplateTask(req.params.templateId, req.validatedBody || req.body);
  const rows = await listTemplateTasks(req.params.templateId);
  sendSuccess(res, { data: rows, message: "Task added", status: 201 });
};

/** PATCH /api/cases/templates/:templateId/tasks/:taskId */
export const editTemplateTask = async (req, res) => {
  await updateTemplateTask(req.params.templateId, req.params.taskId, req.validatedBody || req.body);
  const rows = await listTemplateTasks(req.params.templateId);
  sendSuccess(res, { data: rows, message: "Task updated" });
};

/** DELETE /api/cases/templates/:templateId/tasks/:taskId */
export const removeTemplateTask = async (req, res) => {
  await deleteTemplateTask(req.params.templateId, req.params.taskId);
  const rows = await listTemplateTasks(req.params.templateId);
  sendSuccess(res, { data: rows, message: "Task removed" });
};

/** DELETE /api/cases/templates/:templateId */
export const removeTemplate = async (req, res) => {
  await deleteTemplate(req.params.templateId);
  sendSuccess(res, { message: "Template deleted" });
};


export const settings = async (_req, res) => {
  const [fields, persistedSettings, products, sectors] = await Promise.all([
    listCustomFields(),
    listCaseSystemSettings(),
    listProducts(),
    listSectors(),
  ]);
  sendSuccess(res, { data: { customFields: fields, settings: persistedSettings, products, sectors } });
};

export const createCustomFieldRecord = async (req, res) => {
  await createCustomField(req.validatedBody || req.body);
  const fields = await listCustomFields();
  sendSuccess(res, { data: { customFields: fields }, message: "Custom field created", status: 201 });
};

export const deleteCustomFieldRecord = async (req, res) => {
  await deleteCustomField(req.params.fieldId);
  const fields = await listCustomFields();
  sendSuccess(res, { data: { customFields: fields }, message: "Custom field deleted" });
};

// ── Phases ───────────────────────────────────────────────────────────────────

export const phases = async (req, res) => {
  await getCaseDetails(req.params.id);
  const rows = await listCasePhases(req.params.id);
  sendSuccess(res, { data: rows });
};

export const createPhase = async (req, res) => {
  await getCaseDetails(req.params.id);
  const phase = await createCasePhase(req.params.id, req.validatedBody || req.body);
  sendSuccess(res, { data: phase, message: "Phase created", status: 201 });
};

export const updatePhase = async (req, res) => {
  await getCaseDetails(req.params.id);
  await updateCasePhase(req.params.id, req.params.phaseId, req.validatedBody || req.body);
  sendSuccess(res, { message: "Phase updated" });
};

export const deletePhase = async (req, res) => {
  await getCaseDetails(req.params.id);
  await deleteCasePhase(req.params.id, req.params.phaseId);
  sendSuccess(res, { message: "Phase deleted" });
};

export const archive = async (req, res) => {
  const result = await getCases({ ...(req.validatedQuery || req.query), archived: true });
  sendSuccess(res, { data: result.rows, meta: result.meta });
};

export const globalTimers = async (req, res) => {
  const result = await listGlobalTimers(req.validatedQuery || req.query);
  sendSuccess(res, { data: result.rows, meta: result.meta });
};

export const startTimer = async (req, res) => {
  await getCaseDetails(req.params.id);
  await updateTimerStatus(req.params.id, req.params.timerId, "running");
  const result = await listCaseTimers(req.params.id, { page: 1, perPage: 20 });
  sendSuccess(res, { data: result.rows, meta: result.meta, message: "Timer started" });
};

export const stopTimer = async (req, res) => {
  await getCaseDetails(req.params.id);
  await updateTimerStatus(req.params.id, req.params.timerId, "stopped");
  const result = await listCaseTimers(req.params.id, { page: 1, perPage: 20 });
  sendSuccess(res, { data: result.rows, meta: result.meta, message: "Timer stopped" });
};

export const notesExports = async (req, res) => {
  await getCaseDetails(req.params.id);
  const result = await listCaseNotesExports(req.params.id, req.validatedQuery || req.query);
  sendSuccess(res, { data: result.rows, meta: result.meta });
};

export const globalNotesExports = async (req, res) => {
  const result = await listGlobalNotesExports(req.validatedQuery || req.query);
  sendSuccess(res, { data: result.rows, meta: result.meta });
};

export const createNotesExport = async (req, res) => {
  await getCaseDetails(req.params.id);
  await createCaseNotesExport(req.params.id, req.validatedBody || req.body, req.user.id);
  const result = await listCaseNotesExports(req.params.id, { page: 1, perPage: 20 });
  sendSuccess(res, { data: result.rows, meta: result.meta, message: "Notes export created", status: 201 });
};

export const generators = async (_req, res) => {
  const rows = await listCaseGenerators();
  sendSuccess(res, { data: rows });
};

export const createGeneratorRecord = async (req, res) => {
  await createCaseGenerator(req.validatedBody || req.body);
  const rows = await listCaseGenerators();
  sendSuccess(res, { data: rows, message: "Generator created", status: 201 });
};

export const saveSystemSettings = async (req, res) => {
  await upsertCaseSystemSettings(req.validatedBody || req.body);
  const data = await listCaseSystemSettings();
  sendSuccess(res, { data, message: "Settings saved" });
};

export const products = async (_req, res) => {
  const rows = await listProducts();
  sendSuccess(res, { data: rows });
};

export const createProductRecord = async (req, res) => {
  await createProduct(req.validatedBody || req.body);
  const rows = await listProducts();
  sendSuccess(res, { data: rows, message: "Product created", status: 201 });
};

export const removeProductRecord = async (req, res) => {
  await deleteProduct(req.params.id);
  const rows = await listProducts();
  sendSuccess(res, { data: rows, message: "Product deleted" });
};

export const sectors = async (_req, res) => {
  const rows = await listSectors();
  sendSuccess(res, { data: rows });
};

export const createSectorRecord = async (req, res) => {
  await createSector(req.validatedBody || req.body);
  const rows = await listSectors();
  sendSuccess(res, { data: rows, message: "Sector created", status: 201 });
};

export const removeSectorRecord = async (req, res) => {
  await deleteSector(req.params.id);
  const rows = await listSectors();
  sendSuccess(res, { data: rows, message: "Sector deleted" });
};
