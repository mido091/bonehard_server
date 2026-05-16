import {
  createReadStream,
  existsSync,
  unlinkSync,
} from "node:fs";
import { Readable } from "node:stream";
import path from "node:path";
import {
  CASE_ALLOWED_UPLOAD_EXTENSIONS,
  CASE_ALLOWED_UPLOAD_HINT,
  FILE_UPLOAD_CATEGORY_VALUES,
  MAX_CASE_FILE_SIZE_BYTES,
} from "../constants/uploadOptions.js";
import {
  createCaseGenerator,
  createCaseFile,
  createCaseGeneralNote,
  createAdminLibraryFile,
  createAdminLibraryNote,
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
  createNoteFileAttachment,
  deleteAllAdminNoteAttachments,
  deleteAllNoteAttachments,
  deleteCaseFile,
  deleteAdminLibraryFile,
  deleteAdminLibraryNote,
  deleteNoteFileAttachment,
  getNoteAttachmentById,
  deleteProduct,
  deleteSector,
  deleteCasePhase,
  deleteCustomField,
  deleteTemplate,
  deleteTemplateTask,
  getOrderById,
  getCaseFileById,
  getCaseFileByFileId,
  getCaseGeneralNoteById,
  getAdminLibraryFileById,
  listCaseFiles,
  listCaseFilesGlobal,
  listCaseGenerators,
  listCaseGeneralNotes,
  listCaseNotesGlobal,
  listAdminLibraryFiles,
  listAdminLibraryNotes,
  listCaseNotes,
  listCaseNotesExports,
  listCasePhases,
  listCaseTimers,
  listGlobalNotesExports,
  listCaseSystemSettings,
  listCustomFields,
  listGlobalTimers,
  listNoteAttachments,
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
  updateCaseFileName,
  updateCaseFileNameByFileId,
  updateAdminLibraryFileName,
  updateAdminLibraryNote,
  updateCaseGeneralNote,
  updateCaseGeneralNoteByNoteId,
  deleteCaseGeneralNote,
  deleteCaseGeneralNoteByNoteId,
  deleteCaseFileByFileId,
  replaceResourceLinks,
  getAdminLibraryNoteById,
  createAdminNoteFileAttachment,
  listAdminNoteAttachments,
  getAdminNoteAttachmentById,
  deleteAdminNoteFileAttachment,
} from "../repositories/caseExtra.repository.js";

import { getCaseDetails, getCases } from "../services/case.service.js";
import { CASE_UPLOAD_ROOT } from "../middlewares/caseFileUpload.middleware.js";
import {
  uploadFileToSupabase,
  deleteSupabaseFile,
  getSupabaseDownloadUrl,
  getSupabaseDownloadFileName,
  downloadSupabaseFile,
  removeTempUploadFile,
} from "../services/supabase.service.js";
import { ApiError, sendSuccess } from "../utils/apiResponse.js";

const allowedUploadCategorySet = new Set(FILE_UPLOAD_CATEGORY_VALUES);

const normalizeFinalizeFileList = (body = {}) => {
  const rawFiles = Array.isArray(body.files)
    ? body.files
    : Array.isArray(body.uploadedFiles)
      ? body.uploadedFiles
      : body.storagePath
        ? [body]
        : [];

  if (!rawFiles.length) {
    throw new ApiError(422, "Select at least one file to upload");
  }

  return rawFiles.map((file) => {
    const fileName = String(file.fileName || "").trim();
    const storagePath = String(file.storagePath || "").replace(/^\/+/, "");
    const fileSize = Number(file.fileSize || 0);
    const extension = path.extname(fileName).toLowerCase();
    const uploadCategory = allowedUploadCategorySet.has(file.uploadCategory)
      ? file.uploadCategory
      : "photos_documents";
    const uploadCategoryOtherLabel = String(file.uploadCategoryOtherLabel || "").trim().slice(0, 120);

    if (!fileName || !storagePath) {
      throw new ApiError(422, "Uploaded file metadata is incomplete");
    }
    if (!CASE_ALLOWED_UPLOAD_EXTENSIONS.includes(extension)) {
      throw new ApiError(415, `${fileName} has an invalid extension. ${CASE_ALLOWED_UPLOAD_HINT}`);
    }
    if (fileSize > MAX_CASE_FILE_SIZE_BYTES) {
      throw new ApiError(413, `${fileName} exceeds the 1GB per-file upload limit`);
    }
    if (!storagePath.startsWith("cases/") || /^https?:\/\//i.test(storagePath)) {
      throw new ApiError(422, "Uploaded file storage path is invalid");
    }
    if (uploadCategory === "other" && uploadCategoryOtherLabel.length < 2) {
      throw new ApiError(422, "Custom category name is required when category is Other");
    }

    return {
      storagePath,
      fileName,
      mimeType: file.mimeType || "application/octet-stream",
      fileSize,
      uploadCategory,
      uploadCategoryOtherLabel,
      visibility: file.visibility === "public" ? "public" : "private",
    };
  });
};

const assertFinalizeStorageScope = (files, folderKeys) => {
  const prefixes = folderKeys
    .filter(Boolean)
    .map((key) => `cases/${String(key).replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "")}/`);

  files.forEach((file) => {
    if (!prefixes.some((prefix) => file.storagePath.startsWith(prefix))) {
      throw new ApiError(422, "Uploaded file does not belong to this save operation");
    }
  });
};

const finalizedCaseFilePayload = (file, folderType = "private") => ({
  folderType,
  uploadCategory: file.uploadCategory,
  uploadCategoryOtherLabel: file.uploadCategoryOtherLabel,
  fileName: file.fileName,
  fileUrl: file.storagePath,
  mimeType: file.mimeType,
  fileSize: file.fileSize,
  storageProvider: "supabase",
  cloudinaryPublicId: file.storagePath,
  cloudinaryResourceType: null,
  cloudinarySecureUrl: null,
  cloudinaryVersion: null,
});

const removeStoredAttachments = async (attachments = []) => {
  await Promise.all(
    attachments.map(async (file) => {
      if (file?.storageProvider === "supabase" && file.storagePath) {
        await deleteSupabaseFile(file.storagePath);
      }
    }),
  );
};

const contentDispositionHeader = (fileName) => {
  const fallbackName = String(fileName || "attachment").replace(/[^\x20-\x7E]+/g, "_").replace(/["\\]/g, "");
  return `attachment; filename="${fallbackName}"; filename*=UTF-8''${encodeURIComponent(fileName || "attachment")}`;
};

const streamSupabaseAttachment = async (file, res) => {
  const storagePath = file.storagePath || file.cloudinaryPublicId || file.fileUrl;
  const blob = await downloadSupabaseFile(storagePath);
  if (!blob) throw new ApiError(404, "File not found");

  const fileName = getSupabaseDownloadFileName(file);
  res.setHeader("Content-Type", file.mimeType || blob.type || "application/octet-stream");
  res.setHeader("Content-Length", file.fileSize || blob.size || 0);
  res.setHeader("Content-Disposition", contentDispositionHeader(fileName));

  return Readable.fromWeb(blob.stream()).pipe(res);
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
  const payload = req.validatedBody || req.body;
  const note = await createCaseGeneralNote(req.params.id, payload, req.user.id);
  await replaceResourceLinks("case_note", note.id, payload.referenceLinks || payload.links || [], req.user.id, { caseId: Number(req.params.id) });
  const result = await listCaseGeneralNotes(req.params.id, { page: 1, perPage: 20 });
  sendSuccess(res, { data: result.rows, meta: result.meta, message: "General note created", status: 201 });
};

export const updateGeneralNote = async (req, res) => {
  await getCaseDetails(req.params.id);
  const note = await getCaseGeneralNoteById(req.params.id, req.params.noteId);
  if (!note) throw new ApiError(404, "Note not found");

  const payload = req.validatedBody || req.body;
  await updateCaseGeneralNote(req.params.id, req.params.noteId, payload, req.user.id);
  await replaceResourceLinks("case_note", Number(req.params.noteId), payload.referenceLinks || payload.links || [], req.user.id, { caseId: Number(req.params.id) });
  const result = await listCaseGeneralNotes(req.params.id, { page: 1, perPage: 20 });
  sendSuccess(res, { data: result.rows, meta: result.meta, message: "Note updated" });
};

export const removeGeneralNote = async (req, res) => {
  await getCaseDetails(req.params.id);
  const note = await getCaseGeneralNoteById(req.params.id, req.params.noteId);
  if (!note) throw new ApiError(404, "Note not found");
  const attachments = await deleteAllNoteAttachments(Number(req.params.id), Number(req.params.noteId));
  await removeStoredAttachments(attachments);
  const deleted = await deleteCaseGeneralNote(req.params.id, req.params.noteId);
  if (!deleted) throw new ApiError(404, "Note not found");

  sendSuccess(res, { message: "Note deleted" });
};

/**
 * POST /api/cases/:id/general-notes/:noteId/attachments
 * Uploads one or more files and links them to a specific general note.
 * Accepts multipart/form-data with field "files" (same as regular case uploads).
 */
export const uploadNoteAttachments = async (req, res) => {
  const caseId  = Number(req.params.id);
  const noteId  = Number(req.params.noteId);
  await getCaseDetails(caseId);

  const note = await getCaseGeneralNoteById(caseId, noteId);
  if (!note) throw new ApiError(404, "Note not found");

  if (!req.files?.length) {
    throw new ApiError(422, "Select at least one file to upload");
  }

  const uploadPromises = req.files.map(async (file) => {
    let uploadResult = null;
    try {
      uploadResult = await uploadFileToSupabase(caseId, file);
      await removeTempUploadFile(file);

      await createNoteFileAttachment(caseId, noteId, {
        fileName:        uploadResult.fileName,
        fileUrl:         uploadResult.supabasePath,
        mimeType:        file.mimetype,
        fileSize:        file.size || file.buffer?.length || 0,
        storageProvider: "supabase",
        storagePath:     uploadResult.supabasePath,
      }, req.user?.id || null);
    } catch (error) {
      await deleteSupabaseFile(uploadResult?.supabasePath);
      await removeTempUploadFile(file);
      throw error;
    }
  });

  await Promise.all(uploadPromises);

  const attachments = await listNoteAttachments(noteId);
  sendSuccess(res, { data: attachments, message: "Attachments uploaded", status: 201 });
};

export const finalizeNoteAttachments = async (req, res) => {
  const caseId = Number(req.params.id);
  const noteId = Number(req.params.noteId);
  await getCaseDetails(caseId);

  const note = await getCaseGeneralNoteById(caseId, noteId);
  if (!note) throw new ApiError(404, "Note not found");

  const files = normalizeFinalizeFileList(req.body);
  assertFinalizeStorageScope(files, [caseId]);

  try {
    await Promise.all(files.map((file) => createNoteFileAttachment(caseId, noteId, {
      fileName: file.fileName,
      fileUrl: file.storagePath,
      mimeType: file.mimeType,
      fileSize: file.fileSize,
      storageProvider: "supabase",
      storagePath: file.storagePath,
    }, req.user?.id || null)));
  } catch (error) {
    await Promise.allSettled(files.map((file) => deleteSupabaseFile(file.storagePath)));
    throw error;
  }

  const attachments = await listNoteAttachments(noteId);
  sendSuccess(res, { data: attachments, message: "Attachments uploaded", status: 201 });
};

/**
 * DELETE /api/cases/:id/general-notes/:noteId/attachments/:fileId
 * Removes a single file attachment from a note (DB + Supabase storage).
 */
export const removeNoteAttachment = async (req, res) => {
  const caseId  = Number(req.params.id);
  const noteId  = Number(req.params.noteId);
  const fileId  = Number(req.params.fileId);
  await getCaseDetails(caseId);

  const file = await deleteNoteFileAttachment(caseId, noteId, fileId);
  if (!file) throw new ApiError(404, "Attachment not found");

  // Remove from Supabase if possible — failure is non-fatal
  if (file.storageProvider === "supabase" && file.storagePath) {
    await deleteSupabaseFile(file.storagePath);
  }

  sendSuccess(res, { message: "Attachment deleted" });
};

export const downloadNoteAttachment = async (req, res) => {
  const caseId = Number(req.params.id);
  const noteId = Number(req.params.noteId);
  const fileId = Number(req.params.fileId);
  await getCaseDetails(caseId);

  const note = await getCaseGeneralNoteById(caseId, noteId);
  if (!note) throw new ApiError(404, "Note not found");

  const file = await getNoteAttachmentById(caseId, noteId, fileId);
  if (!file) throw new ApiError(404, "Attachment not found");

  if (file.storageProvider === "supabase") {
    return streamSupabaseAttachment(file, res);
  }

  return streamOrRedirectCaseFile(file, res);
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

const mergedWorkspaceResult = (libraryResult, caseResult, query = {}) => {
  const page = Math.max(Number(query.page) || 1, 1);
  const perPage = Math.min(Math.max(Number(query.perPage) || 20, 1), 100);
  const rows = [...libraryResult.rows, ...caseResult.rows];
  const offset = (page - 1) * perPage;

  return {
    rows: rows.slice(offset, offset + perPage),
    meta: {
      page,
      perPage,
      total: Number(libraryResult.meta.total || 0) + Number(caseResult.meta.total || 0),
    },
  };
};

const workspaceFetchQuery = (query = {}) => {
  const page = Math.max(Number(query.page) || 1, 1);
  const perPage = Math.min(Math.max(Number(query.perPage) || 20, 1), 100);
  return { ...query, page: 1, perPage: Math.min(page * perPage, 100) };
};

export const uploadFiles = async (req, res) => {
  const caseId = Number(req.params.id);
  await getCaseDetails(caseId);

  if (!req.files?.length) {
    throw new ApiError(422, "Select at least one file to upload");
  }

  const categories = (() => {
    try {
      return JSON.parse(req.body.fileCategories || "[]");
    } catch {
      return [];
    }
  })();

  const uploadPromises = req.files.map(async (file, index) => {
    let uploadResult = null;
    try {
      uploadResult = await uploadFileToSupabase(caseId, file);
      await removeTempUploadFile(file);

      return await createCaseFile(caseId, {
        folderType:              "private",
        uploadCategory:          categories[index] || "photos_documents",
        fileName:                uploadResult.fileName,
        fileUrl:                 uploadResult.fileUrl,
        mimeType:                file.mimetype,
        fileSize:                file.size || file.buffer?.length || 0,
        storageProvider:         "supabase",
        cloudinaryPublicId:      uploadResult.supabasePath || null,
        cloudinaryResourceType:  null,
        cloudinarySecureUrl:     uploadResult.secure_url || null,
        cloudinaryVersion:       null,
      }, req.user?.id || null);
    } catch (error) {
      await deleteSupabaseFile(uploadResult?.supabasePath);
      await removeTempUploadFile(file);
      throw error;
    }
  });

  await Promise.all(uploadPromises);

  const result = await listCaseFiles(caseId, { page: 1, perPage: 20 });
  sendSuccess(res, { data: result.rows, meta: result.meta, message: "Files uploaded", status: 201 });
};

export const finalizeFiles = async (req, res) => {
  const caseId = Number(req.params.id);
  await getCaseDetails(caseId);

  const folderType = req.body.folderType === "public" ? "public" : "private";
  const files = normalizeFinalizeFileList(req.body);
  assertFinalizeStorageScope(files, [caseId]);

  try {
    await Promise.all(files.map((file) =>
      createCaseFile(caseId, finalizedCaseFilePayload(file, folderType), req.user?.id || null),
    ));
  } catch (error) {
    await Promise.allSettled(files.map((file) => deleteSupabaseFile(file.storagePath)));
    throw error;
  }

  const result = await listCaseFiles(caseId, { page: 1, perPage: 20 });
  sendSuccess(res, { data: result.rows, meta: result.meta, message: "Files uploaded", status: 201 });
};

export const globalFiles = async (req, res) => {
  const query = req.validatedQuery || req.query;
  const fetchQuery = workspaceFetchQuery(query);
  const [caseFiles, libraryFiles] = await Promise.all([
    listCaseFilesGlobal(fetchQuery, req.user),
    listAdminLibraryFiles(fetchQuery, req.user),
  ]);
  const result = mergedWorkspaceResult(libraryFiles, caseFiles, query);

  sendSuccess(res, { data: result.rows, meta: result.meta });
};

export const uploadGeneralFile = async (req, res) => {
  if (!req.files?.length) throw new ApiError(422, "Select at least one file to upload");
  const visibility = req.body.visibility === "public" ? "public" : "private";
  const allowedCategories = new Set(["dicom", "stl", "photos_documents", "general", "other"]);
  const uploadCategory = allowedCategories.has(req.body.uploadCategory) ? req.body.uploadCategory : "general";
  const uploadCategoryOtherLabel = String(req.body.uploadCategoryOtherLabel || "").trim().slice(0, 120);
  if (uploadCategory === "other" && uploadCategoryOtherLabel.length < 2) {
    throw new ApiError(422, "Custom category name is required when category is Other");
  }
  const uploaded = [];
  for (const file of req.files) {
    let uploadResult = null;
    try {
      uploadResult = await uploadFileToSupabase(`general/${req.user.id}`, file);
      await createAdminLibraryFile({
        visibility,
        uploadCategory,
        uploadCategoryOtherLabel,
        fileName: uploadResult.fileName,
        fileUrl: uploadResult.fileUrl,
        mimeType: file.mimetype,
        fileSize: file.size || file.buffer?.length || 0,
        storageProvider: "supabase",
        storagePath: uploadResult.supabasePath,
      }, req.user.id);
      uploaded.push(uploadResult);
    } catch (error) {
      await deleteSupabaseFile(uploadResult?.supabasePath);
      throw error;
    } finally {
      await removeTempUploadFile(file);
    }
  }
  const result = await listAdminLibraryFiles({ page: 1, perPage: 20 }, req.user);
  sendSuccess(res, { data: result.rows, meta: result.meta, message: `${uploaded.length} file(s) uploaded`, status: 201 });
};

export const finalizeGeneralFile = async (req, res) => {
  const visibility = req.body.visibility === "public" ? "public" : "private";
  const uploadCategory = allowedUploadCategorySet.has(req.body.uploadCategory) ? req.body.uploadCategory : "general";
  const uploadCategoryOtherLabel = String(req.body.uploadCategoryOtherLabel || "").trim().slice(0, 120);
  if (uploadCategory === "other" && uploadCategoryOtherLabel.length < 2) {
    throw new ApiError(422, "Custom category name is required when category is Other");
  }

  const files = normalizeFinalizeFileList({
    ...req.body,
    files: (req.body.files || req.body.uploadedFiles || []).map((file) => ({
      ...file,
      visibility,
      uploadCategory,
      uploadCategoryOtherLabel,
    })),
  });
  assertFinalizeStorageScope(files, ["general-library"]);

  try {
    await Promise.all(files.map((file) => createAdminLibraryFile({
      visibility,
      uploadCategory,
      uploadCategoryOtherLabel,
      fileName: file.fileName,
      fileUrl: file.storagePath,
      mimeType: file.mimeType,
      fileSize: file.fileSize,
      storageProvider: "supabase",
      storagePath: file.storagePath,
    }, req.user.id)));
  } catch (error) {
    await Promise.allSettled(files.map((file) => deleteSupabaseFile(file.storagePath)));
    throw error;
  }

  const result = await listAdminLibraryFiles({ page: 1, perPage: 20 }, req.user);
  sendSuccess(res, { data: result.rows, meta: result.meta, message: `${files.length} file(s) uploaded`, status: 201 });
};

export const downloadGeneralFile = async (req, res) => {
  const file = await getAdminLibraryFileById(Number(req.params.fileId), req.user);
  if (!file) throw new ApiError(404, "File not found");

  return streamOrRedirectCaseFile(file, res);
};

export const renameGeneralFile = async (req, res) => {
  const file = await updateAdminLibraryFileName(
    Number(req.params.fileId),
    (req.validatedBody || req.body).fileName,
    req.user,
  );
  if (!file) throw new ApiError(404, "File not found");

  const result = await listAdminLibraryFiles({ page: 1, perPage: 20 }, req.user);
  sendSuccess(res, { data: result.rows, meta: result.meta, message: "File renamed" });
};

export const removeGeneralFile = async (req, res) => {
  const file = await deleteAdminLibraryFile(Number(req.params.fileId), req.user);
  if (!file) throw new ApiError(404, "File not found");

  if (file.storageProvider === "supabase" && file.cloudinaryPublicId) {
    await deleteSupabaseFile(file.cloudinaryPublicId);
  }

  sendSuccess(res, { message: "File deleted" });
};

export const globalNotes = async (req, res) => {
  const query = req.validatedQuery || req.query;
  const fetchQuery = workspaceFetchQuery(query);
  const [caseNotes, libraryNotes] = await Promise.all([
    listCaseNotesGlobal(fetchQuery, req.user),
    listAdminLibraryNotes(fetchQuery, req.user),
  ]);
  const result = mergedWorkspaceResult(libraryNotes, caseNotes, query);

  sendSuccess(res, { data: result.rows, meta: result.meta });
};

export const createGeneralLibraryNote = async (req, res) => {
  const payload = req.validatedBody || req.body;
  const note = await createAdminLibraryNote(payload, req.user.id);
  await replaceResourceLinks("admin_library_note", note.id, payload.referenceLinks || payload.links || [], req.user.id);
  const hydratedNote = await getAdminLibraryNoteById(note.id, req.user);
  sendSuccess(res, { data: hydratedNote, message: "General note created", status: 201 });
};

export const updateGeneralLibraryNote = async (req, res) => {
  const payload = req.validatedBody || req.body;
  const note = await updateAdminLibraryNote(Number(req.params.noteId), payload, req.user);
  if (!note) throw new ApiError(404, "Note not found");
  await replaceResourceLinks("admin_library_note", Number(req.params.noteId), payload.referenceLinks || payload.links || [], req.user.id);

  const result = await listAdminLibraryNotes({ page: 1, perPage: 20 }, req.user);
  sendSuccess(res, { data: result.rows, meta: result.meta, message: "Note updated" });
};

export const removeGeneralLibraryNote = async (req, res) => {
  const existingNote = await getAdminLibraryNoteById(Number(req.params.noteId), req.user);
  if (!existingNote) throw new ApiError(404, "Note not found");
  const attachments = await deleteAllAdminNoteAttachments(Number(req.params.noteId));
  await removeStoredAttachments(attachments);
  const note = await deleteAdminLibraryNote(Number(req.params.noteId), req.user);
  if (!note) throw new ApiError(404, "Note not found");

  sendSuccess(res, { message: "Note deleted" });
};

/**
 * POST /api/cases/notes/general/:noteId/attachments
 * Uploads one or more files and links them to an admin library note.
 */
export const uploadAdminNoteAttachments = async (req, res) => {
  const noteId = Number(req.params.noteId);
  const note = await getAdminLibraryNoteById(noteId, req.user);
  if (!note) throw new ApiError(404, "Note not found");

  if (!req.files?.length) {
    throw new ApiError(400, "No files uploaded");
  }

  const uploadPromises = req.files.map(async (file) => {
    let uploadResult = null;
    try {
      uploadResult = await uploadFileToSupabase(`general-note-${noteId}`, file);
      await removeTempUploadFile(file);

      await createAdminNoteFileAttachment(noteId, {
        fileName:        uploadResult.fileName,
        fileUrl:         uploadResult.supabasePath,
        mimeType:        file.mimetype,
        fileSize:        file.size || file.buffer?.length || 0,
        storageProvider: "supabase",
        storagePath:     uploadResult.supabasePath,
      }, req.user?.id || null);
    } catch (error) {
      await deleteSupabaseFile(uploadResult?.supabasePath);
      await removeTempUploadFile(file);
      throw error;
    }
  });

  await Promise.all(uploadPromises);

  const attachments = await listAdminNoteAttachments(noteId);
  sendSuccess(res, { data: attachments, message: "Attachments uploaded", status: 201 });
};

export const finalizeAdminNoteAttachments = async (req, res) => {
  const noteId = Number(req.params.noteId);
  const note = await getAdminLibraryNoteById(noteId, req.user);
  if (!note) throw new ApiError(404, "Note not found");

  const files = normalizeFinalizeFileList(req.body);
  assertFinalizeStorageScope(files, [`general-note-${noteId}`]);

  try {
    await Promise.all(files.map((file) => createAdminNoteFileAttachment(noteId, {
      fileName: file.fileName,
      fileUrl: file.storagePath,
      mimeType: file.mimeType,
      fileSize: file.fileSize,
      storageProvider: "supabase",
      storagePath: file.storagePath,
    }, req.user?.id || null)));
  } catch (error) {
    await Promise.allSettled(files.map((file) => deleteSupabaseFile(file.storagePath)));
    throw error;
  }

  const attachments = await listAdminNoteAttachments(noteId);
  sendSuccess(res, { data: attachments, message: "Attachments uploaded", status: 201 });
};

/**
 * DELETE /api/cases/notes/general/:noteId/attachments/:fileId
 * Removes a single file attachment from an admin library note.
 */
export const removeAdminNoteAttachment = async (req, res) => {
  const noteId  = Number(req.params.noteId);
  const fileId  = Number(req.params.fileId);
  
  // Basic ownership/existence check
  const note = await getAdminLibraryNoteById(noteId, req.user);
  if (!note) throw new ApiError(404, "Note not found");

  const file = await deleteAdminNoteFileAttachment(noteId, fileId);
  if (!file) throw new ApiError(404, "Attachment not found");

  if (file.storageProvider === "supabase" && file.storagePath) {
    await deleteSupabaseFile(file.storagePath);
  }

  sendSuccess(res, { message: "Attachment deleted" });
};

export const downloadAdminNoteAttachment = async (req, res) => {
  const noteId = Number(req.params.noteId);
  const fileId = Number(req.params.fileId);

  const note = await getAdminLibraryNoteById(noteId, req.user);
  if (!note) throw new ApiError(404, "Note not found");

  const file = await getAdminNoteAttachmentById(noteId, fileId, req.user);
  if (!file) throw new ApiError(404, "Attachment not found");

  if (file.storageProvider === "supabase") {
    return streamSupabaseAttachment(file, res);
  }

  return streamOrRedirectCaseFile(file, res);
};

async function streamOrRedirectCaseFile(file, res) {
  if (["supabase", "firebase", "cloudinary"].includes(file.storageProvider)) {
    const url = file.storageProvider === "supabase"
      ? await getSupabaseDownloadUrl(file)
      : file.fileUrl || file.cloudinarySecureUrl;
    if (!url) throw new ApiError(404, "File not found");
    return res.redirect(url);
  }

  const relativePath = file.cloudinaryPublicId || file.fileUrl;
  if (!relativePath) throw new ApiError(404, "File not found");

  const { join } = await import("node:path");
  let resolvedPath = join(CASE_UPLOAD_ROOT, relativePath);
  if (!existsSync(resolvedPath)) {
    resolvedPath = path.resolve(CASE_UPLOAD_ROOT, file.fileUrl || "");
    if (!resolvedPath.startsWith(CASE_UPLOAD_ROOT) || !existsSync(resolvedPath)) {
      throw new ApiError(404, "File not found on disk");
    }
  }

  res.setHeader("Content-Type", file.mimeType || "application/octet-stream");
  res.setHeader("Content-Length", file.fileSize || 0);
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`);
  return createReadStream(resolvedPath).pipe(res);
};

const removeFileFromStorage = async (file) => {
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

  if (file.storageProvider === "local" && file.fileUrl && !file.cloudinaryPublicId) {
    const resolvedPath = path.resolve(CASE_UPLOAD_ROOT, file.fileUrl);
    if (resolvedPath.startsWith(CASE_UPLOAD_ROOT) && existsSync(resolvedPath)) {
      try { unlinkSync(resolvedPath); } catch (err) {
        console.error("Failed to delete legacy local file:", err);
      }
    }
  }
};

export const downloadFileById = async (req, res) => {
  const file = await getCaseFileByFileId(Number(req.params.fileId));
  if (!file) throw new ApiError(404, "File not found");
  return streamOrRedirectCaseFile(file, res);
};

export const renameFileById = async (req, res) => {
  const existing = await getCaseFileByFileId(Number(req.params.fileId));
  if (!existing) throw new ApiError(404, "File not found");
  const file = await updateCaseFileNameByFileId(Number(req.params.fileId), (req.validatedBody || req.body).fileName);
  sendSuccess(res, { data: file, message: "File renamed" });
};

export const removeFileById = async (req, res) => {
  const existing = await getCaseFileByFileId(Number(req.params.fileId));
  if (!existing) throw new ApiError(404, "File not found");
  const file = await deleteCaseFileByFileId(Number(req.params.fileId));
  await removeFileFromStorage(file);
  sendSuccess(res, { message: "File deleted" });
};

export const updateGeneralNoteById = async (req, res) => {
  const payload = req.validatedBody || req.body;
  const note = await updateCaseGeneralNoteByNoteId(Number(req.params.noteId), payload, req.user.id);
  if (!note) throw new ApiError(404, "Note not found");
  await replaceResourceLinks("case_note", Number(req.params.noteId), payload.referenceLinks || payload.links || [], req.user.id, { caseId: Number(note.caseId) });
  sendSuccess(res, { data: note, message: "Note updated" });
};

export const removeGeneralNoteById = async (req, res) => {
  const note = await deleteCaseGeneralNoteByNoteId(Number(req.params.noteId));
  if (!note) throw new ApiError(404, "Note not found");
  sendSuccess(res, { message: "Note deleted" });
};

export const downloadFile = async (req, res) => {
  const caseId = Number(req.params.id);
  const fileId = Number(req.params.fileId);
  await getCaseDetails(caseId);

  const file = await getCaseFileById(caseId, fileId);
  if (!file) throw new ApiError(404, "File not found");
  return streamOrRedirectCaseFile(file, res);

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

export const renameFile = async (req, res) => {
  const caseId = Number(req.params.id);
  const fileId = Number(req.params.fileId);
  await getCaseDetails(caseId);

  const file = await updateCaseFileName(caseId, fileId, (req.validatedBody || req.body).fileName);
  if (!file) throw new ApiError(404, "File not found");

  const result = await listCaseFiles(caseId, { page: 1, perPage: 100 });
  sendSuccess(res, { data: result.rows, meta: result.meta, message: "File renamed" });
};

export const orders = async (req, res) => {
  const result = await listOrders(req.validatedQuery || req.query);
  sendSuccess(res, { data: result.rows, meta: result.meta });
};

export const createOrderRecord = async (req, res) => {
  const payload = req.validatedBody || req.body;
  const orderId = await createOrder(payload);
  await replaceResourceLinks("order", orderId, payload.referenceLinks || payload.links || [], req.user?.id);
  const result = await listOrders({ page: 1, perPage: 20 });
  sendSuccess(res, { data: result.rows, meta: result.meta, message: "Order created", status: 201 });
};

export const updateOrderRecord = async (req, res) => {
  const payload = req.validatedBody || req.body;
  const orderId = req.params.orderId;
  await updateOrder(orderId, payload);
  await replaceResourceLinks("order", orderId, payload.referenceLinks || payload.links || [], req.user?.id);
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
