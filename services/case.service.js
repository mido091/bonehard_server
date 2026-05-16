import {
  archiveCase,
  cloneCase,
  createCase,
  getCaseById,
  listCases,
  refreshCaseProgress,
  updateCase,
  updateCaseStatus,
} from "../repositories/case.repository.js";
import {
  applyTemplateToCase,
  createCaseFile,
  createCaseGeneralNote,
  deleteCaseFile,
  deleteCaseGeneralNote,
  getCaseFileById,
  getCaseGeneralNoteById,
  getCaseTeamMemberIds,
  getCustomFieldValues,
  listCaseGeneralNotes,
  listCaseFiles,
  listResourceLinks,
  replaceResourceLinks,
  replaceCaseTeamMembers,
  updateCaseFileName,
  updateCaseGeneralNote,
  upsertCustomFieldValues,
} from "../repositories/caseExtra.repository.js";
import { getOfficialStatusByName, statusExists } from "../repositories/status.repository.js";
import { DEFAULT_CASE_STATUS_NAME } from "../constants/workflowOptions.js";
import { createTask, deleteTask, listTasksByCase, listTasksGlobal, replaceTaskWatchers, updateTask } from "../repositories/task.repository.js";
import { uploadFileToSupabase, deleteSupabaseFile, deleteCaseFolder, moveSupabaseFileToCase, removeTempUploadFile } from "./supabase.service.js";
import { notifyUser } from "./notification.service.js";

import { ApiError } from "../utils/apiResponse.js";
import { withTransaction } from "../utils/db.js";

// ── Guards ─────────────────────────────────────────────────────────────────────

const ensureCaseExists = async (id) => {
  const item = await getCaseById(id);
  if (!item) throw new ApiError(404, "Case not found");
  if (isUserOrderCase(item)) throw new ApiError(404, "Case not found");
  return item;
};

const isUserOrderCase = (item) =>
  Number(item?.targetId) > 0 &&
  Number(item?.createdBy) > 0 &&
  Number(item.targetId) === Number(item.createdBy) &&
  item.createdByRole === "user";

const ensureAdminUserOrderExists = async (id) => {
  const item = await getCaseById(id);
  if (!item || !isUserOrderCase(item)) throw new ApiError(404, "Order not found");
  return item;
};

const ensureStatusExists = async (statusId) => {
  if (!(await statusExists(statusId))) {
    throw new ApiError(422, "Selected case status does not exist");
  }
};

// ── Case CRUD ──────────────────────────────────────────────────────────────────

export const getCases = (query) => listCases({
  ...query,
  excludeUserOrders: true,
});

export const getUserOrders = (query, userId) => listCases({
  ...query,
  targetId: userId,
  createdBy: userId,
  archived: false,
});

export const getAdminUserOrders = (query) => listCases({
  ...query,
  userOrdersOnly: true,
  archived: false,
});

const ensureUserOrderExists = async (id, userId) => {
  const item = await getCaseById(id);
  if (!item || !isUserOrderCase(item) || Number(item.targetId) !== Number(userId) || Number(item.createdBy) !== Number(userId)) {
    throw new ApiError(404, "Order not found");
  }
  return item;
};

export const getUserOrderDetails = async (id, userId) => {
  const item = await ensureUserOrderExists(id, userId);
  item.customFieldValues = await getCustomFieldValues(id);
  item.links = await listResourceLinks("case", id, { caseId: id });
  // Users only see public files (folder_type = 'public')
  const filesResult = await listCaseFiles(id, { page: 1, perPage: 100, folderType: 'public' });
  item.files = filesResult.rows;

  // Include public team notes
  const notesResult = await listCaseGeneralNotes(id, { page: 1, perPage: 50 }, { publicOnly: true });
  item.notes = notesResult.rows;

  return item;
};

export const getAdminUserOrderDetails = async (id) => {
  const item = await ensureAdminUserOrderExists(id);
  item.customFieldValues = await getCustomFieldValues(id);
  item.links = await listResourceLinks("case", id, { caseId: id });
  // Admins see ALL files (no folder_type filter)
  const filesResult = await listCaseFiles(id, { page: 1, perPage: 100 });
  item.files = filesResult.rows;
  return item;
};

export const getAdminUserOrderFile = async (id, fileId) => {
  await ensureAdminUserOrderExists(id);
  const file = await getCaseFileById(id, fileId);
  if (!file) throw new ApiError(404, "File not found");
  return file;
};

export const renameAdminUserOrderFile = async (id, fileId, fileName) => {
  await ensureAdminUserOrderExists(id);
  const file = await updateCaseFileName(id, fileId, fileName);
  if (!file) throw new ApiError(404, "File not found");
  return getAdminUserOrderDetails(id);
};

export const setAdminUserOrderStatus = async (id, { statusId, statusName }) => {
  await ensureAdminUserOrderExists(id);
  if (statusName) {
    const status = await getOfficialStatusByName(statusName);
    if (!status) throw new ApiError(422, "Selected order status is not allowed");
    statusId = status.id;
  }
  await ensureStatusExists(statusId);
  await updateCaseStatus(id, statusId);
  return getAdminUserOrderDetails(id);
};

export const deleteAdminUserOrder = async (id) => {
  await ensureAdminUserOrderExists(id);
  await archiveCase(id);
  await deleteCaseFolder(id);
};

export const getAdminUserOrderNotes = async (id, query) => {
  await ensureAdminUserOrderExists(id);
  // Admins see all notes (public + private)
  return listCaseGeneralNotes(id, query);
};

/** Fetch notes visible to a user (public only). */
export const getUserOrderPublicNotes = async (id, userId, query) => {
  await ensureUserOrderExists(id, userId);
  return listCaseGeneralNotes(id, query, { publicOnly: true });
};

export const createAdminUserOrderNote = async (id, payload, userId) => {
  const order = await ensureAdminUserOrderExists(id);
  const note = await createCaseGeneralNote(id, payload, userId);
  await replaceResourceLinks("case_note", note.id, payload.referenceLinks || payload.links || [], userId, { caseId: id });

  // If the note is public, notify the customer
  if (!payload.isPrivate && order.targetId) {
    await notifyUser({
      userId: order.targetId,
      type: 'order',
      title: 'New Team Note',
      body: `An update has been added to your order "${order.name}".`,
      data: { orderId: id, noteId: note.id }
    });
  }

  return getAdminUserOrderNotes(id, { page: 1, perPage: 50 });
};

/** Update an existing team note (admin/assistant only). */
export const updateAdminUserOrderNote = async (orderId, noteId, payload, userId) => {
  await ensureAdminUserOrderExists(orderId);
  const note = await getCaseGeneralNoteById(orderId, noteId);
  if (!note) throw new ApiError(404, 'Note not found');
  await updateCaseGeneralNote(orderId, noteId, payload, userId);
  await replaceResourceLinks("case_note", noteId, payload.referenceLinks || payload.links || [], userId, { caseId: orderId });
  return getAdminUserOrderNotes(orderId, { page: 1, perPage: 50 });
};

/** Delete a team note (admin/assistant only). */
export const deleteAdminUserOrderNote = async (orderId, noteId) => {
  await ensureAdminUserOrderExists(orderId);
  const note = await getCaseGeneralNoteById(orderId, noteId);
  if (!note) throw new ApiError(404, 'Note not found');
  await deleteCaseGeneralNote(orderId, noteId);
};

/**
 * Upload files to a user order as admin/assistant.
 * @param {string} folderType - 'public' (visible to user) or 'private' (admin-only)
 */
export const uploadAdminFilesToOrder = async (orderId, files, userId, folderType = 'private') => {
  const order = await ensureAdminUserOrderExists(orderId);
  if (!files.length) return getAdminUserOrderDetails(orderId);

  const uploadedFiles = await uploadFilesForCase(orderId, files);

  try {
    await Promise.all(
      uploadedFiles.map((uploaded, i) =>
        createCaseFile(
          orderId,
          {
            ...toCaseFilePayload(files[i], uploaded),
            folderType, // override with admin-chosen visibility
          },
          userId,
        )
      )
    );

    // Notify user if files are public
    if (folderType === 'public' && order.targetId) {
      await notifyUser({
        userId: order.targetId,
        type: 'order',
        title: 'New Files Uploaded',
        body: `${files.length} new file${files.length === 1 ? '' : 's'} have been added to your order "${order.name}".`,
        data: { orderId: orderId }
      });
    }
  } catch (error) {
    // Roll back uploaded files on DB failure
    await Promise.allSettled(uploadedFiles.map(u => deleteSupabaseFile(u.supabasePath)));
    throw error;
  }

  return getAdminUserOrderDetails(orderId);
};

export const finalizeAdminFilesToOrder = async (orderId, uploadedFiles, userId, folderType = 'private') => {
  const order = await ensureAdminUserOrderExists(orderId);
  const directFiles = parseDirectUploadedFiles(uploadedFiles);
  if (!directFiles.length) return getAdminUserOrderDetails(orderId);

  assertDirectUploadsAreScoped(directFiles, orderId);
  const normalizedFolderType = folderType === 'public' ? 'public' : 'private';

  try {
    await Promise.all(
      directFiles.map((directFile) => {
        const uploadResult = {
          supabasePath: directFile.storagePath,
          fileUrl: directFile.storagePath,
          fileName: directFile.fileName,
          fileSize: directFile.fileSize,
        };

        return createCaseFile(
          orderId,
          toDirectCaseFilePayload(directFile, uploadResult, normalizedFolderType),
          userId,
        );
      }),
    );

    if (normalizedFolderType === 'public' && order.targetId) {
      await notifyUser({
        userId: order.targetId,
        type: 'order',
        title: 'New Files Uploaded',
        body: `${directFiles.length} new file${directFiles.length === 1 ? '' : 's'} have been added to your order "${order.name}".`,
        data: { orderId },
      });
    }
  } catch (error) {
    await Promise.allSettled(directFiles.map((file) => deleteSupabaseFile(file.storagePath)));
    throw error;
  }

  return getAdminUserOrderDetails(orderId);
};

/** Delete a file from an order (admin/assistant, no ownership restriction). */
export const deleteAdminOrderFile = async (orderId, fileId) => {
  await ensureAdminUserOrderExists(orderId);
  const file = await getCaseFileById(orderId, fileId);
  if (!file) throw new ApiError(404, 'File not found');

  await deleteCaseFile(orderId, fileId);

  if (file.storageProvider === 'supabase' && file.cloudinaryPublicId) {
    await deleteSupabaseFile(file.cloudinaryPublicId);
  }

  return getAdminUserOrderDetails(orderId);
};

export const getUserOrderFile = async (id, fileId, userId) => {
  await ensureUserOrderExists(id, userId);
  const file = await getCaseFileById(id, fileId);
  if (!file) throw new ApiError(404, "File not found");
  return file;
};

export const renameUserOrderFile = async (id, fileId, userId, fileName) => {
  await ensureUserOrderExists(id, userId);
  const file = await updateCaseFileName(id, fileId, fileName);
  if (!file) throw new ApiError(404, "File not found");
  return getUserOrderDetails(id, userId);
};

/**
 * Delete a file attached to a user order.
 * Verifies order ownership before deleting from DB and storage.
 */
export const deleteUserOrderFile = async (id, fileId, userId) => {
  await ensureUserOrderExists(id, userId);
  const file = await getCaseFileById(id, fileId);
  if (!file) throw new ApiError(404, "File not found");

  await deleteCaseFile(id, fileId);

  if (file.storageProvider === "supabase" && file.cloudinaryPublicId) {
    await deleteSupabaseFile(file.cloudinaryPublicId);
  }

  return getUserOrderDetails(id, userId);
};

/**
 * Load case details including its custom field values.
 */
export const getCaseDetails = async (id) => {
  const item = await ensureCaseExists(id);
  // Attach custom field values so the Edit form can pre-fill them
  item.customFieldValues = await getCustomFieldValues(id);
  item.teamMemberIds = await getCaseTeamMemberIds(id);
  item.links = await listResourceLinks("case", id, { caseId: id });
  return item;
};

/**
 * Create a new case, then persist any custom field values passed in payload.
 * payload.customFieldValues: { fieldKey: value }
 */
export const createCaseRecord = async (payload, userId) => {
  await ensureStatusExists(payload.statusId);

  let newId;
  await withTransaction(async (connection) => {
    newId = await createCase(payload, userId, connection);

    if (payload.customFieldValues && Object.keys(payload.customFieldValues).length) {
      await upsertCustomFieldValues(newId, payload.customFieldValues, connection);
    }

    if (payload.teamMemberIds?.length) {
      await replaceCaseTeamMembers(newId, payload.teamMemberIds, connection);
    }

    await replaceResourceLinks("case", newId, payload.referenceLinks || payload.links || [], userId, { caseId: newId }, connection);

    if (payload.templateId) {
      await applyTemplateToCase(newId, payload.templateId, connection);
      await refreshCaseProgress(newId, connection);
    }
  });

  return getCaseDetails(newId);
};

/**
 * Maps a Multer file + Supabase upload result into the shape expected by the case_files table.
 */
const parseFileCategories = (value) => {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const parseDirectUploadedFiles = (value) => {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const assertDirectUploadsAreScoped = (files, scope) => {
  files.forEach((file) => {
    const path = String(file.storagePath || "");
    const allowed = scope === "pending"
      ? /^cases\/pending-[a-z0-9_-]+\//i.test(path)
      : path.startsWith(`cases/${scope}/`);

    if (!allowed) {
      throw new ApiError(422, "Uploaded file does not belong to this save operation");
    }
  });
};

const toCaseFilePayload = (multerFile, uploadResult, uploadCategory = "photos_documents", folderType = "private") => ({
  folderType,
  uploadCategory,
  fileName:                uploadResult.fileName || multerFile.originalname,
  fileUrl:                 uploadResult.fileUrl,
  mimeType:                multerFile.mimetype,
  fileSize:                uploadResult.fileSize || multerFile.size,
  storageProvider:         "supabase",
  // Store the storage path in cloudinaryPublicId for deletion later
  cloudinaryPublicId:      uploadResult.supabasePath || null,
  cloudinaryResourceType:  null,
  cloudinarySecureUrl:     uploadResult.secure_url || null,
  cloudinaryVersion:       null,
});

const toDirectCaseFilePayload = (directFile, uploadResult, folderType = "private") => ({
  folderType,
  uploadCategory:          directFile.uploadCategory || "photos_documents",
  uploadCategoryOtherLabel: directFile.uploadCategoryOtherLabel || null,
  fileName:                uploadResult.fileName || directFile.fileName,
  fileUrl:                 uploadResult.fileUrl || uploadResult.supabasePath,
  mimeType:                directFile.mimeType || "application/octet-stream",
  fileSize:                uploadResult.fileSize || directFile.fileSize || 0,
  storageProvider:         "supabase",
  cloudinaryPublicId:      uploadResult.supabasePath || directFile.storagePath || null,
  cloudinaryResourceType:  null,
  cloudinarySecureUrl:     null,
  cloudinaryVersion:       null,
});

/**
 * Uploads files to Supabase Storage concurrently, with automatic cleanup on partial failure.
 */
const uploadFilesForCase = async (caseId, files = []) => {
  if (!files.length) return [];
  
  const results = await Promise.allSettled(files.map(file => uploadFileToSupabase(caseId, file)));
  await Promise.allSettled(files.map((file) => removeTempUploadFile(file)));

  const uploaded = results
    .filter(r => r.status === "fulfilled")
    .map(r => r.value);
    
  const failed = results.filter(r => r.status === "rejected");

  if (failed.length > 0) {
    // Roll back already-uploaded files to avoid orphans in Storage
    await Promise.allSettled(
      uploaded.map(u => deleteSupabaseFile(u.supabasePath))
    );
    throw new Error(`Upload failed for some files: ${failed[0].reason.message}`);
  }

  return uploaded;
};

export const createCaseRecordWithFiles = async (payload, userId, files = [], options = {}) => {
  await ensureStatusExists(payload.statusId);

  // 1. Upload files BEFORE the transaction so we don't hold a DB connection open
  const uploadedFiles = await uploadFilesForCase(`pending-${Date.now()}`, files);
  const directFiles = parseDirectUploadedFiles(payload.uploadedFiles);
  assertDirectUploadsAreScoped(directFiles, "pending");
  const fileCategories = parseFileCategories(payload.fileCategories);
  let cleanupPaths = [
    ...uploadedFiles.map((u) => u.supabasePath),
    ...directFiles.map((u) => u.storagePath),
  ];

  try {
    let newId;
    await withTransaction(async (connection) => {
      newId = await createCase(payload, userId, connection);

      if (payload.customFieldValues && Object.keys(payload.customFieldValues).length) {
        await upsertCustomFieldValues(newId, payload.customFieldValues, connection);
      }

      if (payload.teamMemberIds?.length) {
        await replaceCaseTeamMembers(newId, payload.teamMemberIds, connection);
      }

      await replaceResourceLinks("case", newId, payload.referenceLinks || payload.links || [], userId, { caseId: newId }, connection);

      if (payload.templateId) {
        await applyTemplateToCase(newId, payload.templateId, connection);
        await refreshCaseProgress(newId, connection);
      }

      for (let i = 0; i < uploadedFiles.length; i++) {
        const moved = await moveSupabaseFileToCase(
          uploadedFiles[i].supabasePath,
          newId,
          uploadedFiles[i].fileName,
        );
        uploadedFiles[i] = { ...uploadedFiles[i], ...moved };
        cleanupPaths[i] = uploadedFiles[i].supabasePath;
        await createCaseFile(
          newId,
          toCaseFilePayload(files[i], uploadedFiles[i], fileCategories[i], options.allowUserOrder ? "public" : "private"),
          userId,
          connection,
        );
      }

      for (let i = 0; i < directFiles.length; i++) {
        const moved = await moveSupabaseFileToCase(
          directFiles[i].storagePath,
          newId,
          directFiles[i].fileName,
        );
        const uploadResult = {
          supabasePath: moved.supabasePath || directFiles[i].storagePath,
          fileUrl: moved.fileUrl || moved.supabasePath || directFiles[i].storagePath,
          fileName: directFiles[i].fileName,
          fileSize: directFiles[i].fileSize,
        };
        cleanupPaths[uploadedFiles.length + i] = uploadResult.supabasePath;
        await createCaseFile(
          newId,
          toDirectCaseFilePayload(directFiles[i], uploadResult, options.allowUserOrder ? "public" : "private"),
          userId,
          connection,
        );
      }
    });

    return options.allowUserOrder ? getAdminUserOrderDetails(newId) : getCaseDetails(newId);
  } catch (error) {
    // DB transaction failed — clean up orphaned Cloudinary files
    await Promise.allSettled(
      cleanupPaths.map((storagePath) => deleteSupabaseFile(storagePath))
    );
    throw error;
  }
};

export const createUserOrderRecordWithFiles = async (payload, userId, files = []) => {
  const defaultStatus = await getOfficialStatusByName(DEFAULT_CASE_STATUS_NAME);
  if (!defaultStatus) throw new ApiError(422, "Default order status is not configured");

  const orderPayload = {
    name: payload.name,
    statusId: defaultStatus.id,
    description: null,
    clientDescription: payload.clientDescription || null,
    targetId: userId,
    secondaryClientId: null,
    projectLeaderId: null,
    startDate: new Date().toISOString().slice(0, 10),
    estimatedCompletionDate: null,
    targetTime: payload.targetTime || null,
    contactPhone: payload.contactPhone,
    contactEmail: payload.contactEmail,
    implantSystem: payload.implantSystem || null,
    implantSystemOther: payload.implantSystem === "Other" ? payload.implantSystemOther || null : null,
    servicesNeeded: payload.servicesNeeded || [],
    servicesNeededOther: (payload.servicesNeeded || []).includes("Other") ? payload.servicesNeededOther || null : null,
    customUid: null,
    progressTracking: true,
    price: null,
    color: null,
    templateId: null,
    teamMemberIds: [],
    customFieldValues: payload.customFieldValues || {},
    referenceLinks: payload.referenceLinks || payload.links || [],
    uploadedFiles: payload.uploadedFiles || [],
    fileCategories: payload.fileCategories || [],
  };

  return createCaseRecordWithFiles(orderPayload, userId, files, { allowUserOrder: true });
};

export const updateUserOrderRecordWithFiles = async (id, payload, userId, files = []) => {
  // Fetch existing case to preserve all non-editable fields and avoid undefined bind params
  const existing = await ensureUserOrderExists(id, userId);

  // Only the fields the user is allowed to edit are merged on top of the full existing record
  const orderPayload = {
    // Preserved fields (user cannot change these)
    statusId:                 existing.statusId,
    targetId:                 existing.targetId,
    secondaryClientId:        existing.secondaryClientId ?? null,
    projectLeaderId:          existing.projectLeaderId ?? null,
    startDate:                existing.startDate ?? null,
    estimatedCompletionDate:  existing.estimatedCompletionDate ?? null,
    customUid:                existing.customUid ?? null,
    progressTracking:         existing.progressTracking,
    price:                    existing.price ?? null,
    color:                    existing.color ?? null,
    templateId:               existing.templateId ?? null,
    description:              existing.description ?? null,
    // User-editable fields
    name:                     payload.name,
    clientDescription:        payload.clientDescription || null,
    targetTime:               payload.targetTime || null,
    contactPhone:             payload.contactPhone,
    contactEmail:             payload.contactEmail,
    implantSystem:            payload.implantSystem || null,
    implantSystemOther:       payload.implantSystem === "Other" ? payload.implantSystemOther || null : null,
    servicesNeeded:           payload.servicesNeeded || [],
    servicesNeededOther:      (payload.servicesNeeded || []).includes("Other") ? payload.servicesNeededOther || null : null,
    referenceLinks:           payload.referenceLinks || payload.links || [],
  };

  // 1. Upload new files to Supabase before touching the DB
  const uploadedFiles = await uploadFilesForCase(id, files);
  const directFiles = parseDirectUploadedFiles(payload.uploadedFiles);
  assertDirectUploadsAreScoped(directFiles, id);
  const fileCategories = parseFileCategories(payload.fileCategories);

  try {
    await withTransaction(async (connection) => {
      await updateCase(id, orderPayload, connection);

      if (payload.customFieldValues && Object.keys(payload.customFieldValues).length) {
        await upsertCustomFieldValues(id, payload.customFieldValues, connection);
      }

      await replaceResourceLinks("case", id, payload.referenceLinks || payload.links || [], userId, { caseId: id }, connection);

      for (let i = 0; i < uploadedFiles.length; i++) {
        await createCaseFile(id, toCaseFilePayload(files[i], uploadedFiles[i], fileCategories[i], "public"), userId, connection);
      }

      for (let i = 0; i < directFiles.length; i++) {
        const moved = await moveSupabaseFileToCase(directFiles[i].storagePath, id, directFiles[i].fileName);
        const uploadResult = {
          supabasePath: moved.supabasePath || directFiles[i].storagePath,
          fileUrl: moved.fileUrl || moved.supabasePath || directFiles[i].storagePath,
          fileName: directFiles[i].fileName,
          fileSize: directFiles[i].fileSize,
        };
        await createCaseFile(id, toDirectCaseFilePayload(directFiles[i], uploadResult, "public"), userId, connection);
      }
    });

    return getUserOrderDetails(id, userId);
  } catch (error) {
    // DB transaction failed — clean up orphaned Supabase files
    await Promise.allSettled(
      [...uploadedFiles.map((u) => u.supabasePath), ...directFiles.map((u) => u.storagePath)]
        .map((storagePath) => deleteSupabaseFile(storagePath))
    );
    throw error;
  }
};

/**
 * Update a case, then persist any updated custom field values.
 */
export const updateCaseRecord = async (id, payload) => {
  await ensureCaseExists(id);
  await ensureStatusExists(payload.statusId);

  await withTransaction(async (connection) => {
    await updateCase(id, payload, connection);

    if (payload.customFieldValues && Object.keys(payload.customFieldValues).length) {
      await upsertCustomFieldValues(id, payload.customFieldValues, connection);
    }

    if (payload.teamMemberIds) {
      await replaceCaseTeamMembers(id, payload.teamMemberIds, connection);
    }

    await replaceResourceLinks("case", id, payload.referenceLinks || payload.links || [], null, { caseId: id }, connection);
  });

  return getCaseDetails(id);
};

export const updateCaseRecordWithFiles = async (id, payload, userId, files = []) => {
  await ensureCaseExists(id);
  await ensureStatusExists(payload.statusId);

  // 1. Upload new files to Cloudinary before touching the DB
  const uploadedFiles = await uploadFilesForCase(id, files);
  const directFiles = parseDirectUploadedFiles(payload.uploadedFiles);
  assertDirectUploadsAreScoped(directFiles, id);
  const fileCategories = parseFileCategories(payload.fileCategories);

  try {
    await withTransaction(async (connection) => {
      await updateCase(id, payload, connection);

      if (payload.customFieldValues && Object.keys(payload.customFieldValues).length) {
        await upsertCustomFieldValues(id, payload.customFieldValues, connection);
      }

      if (payload.teamMemberIds) {
        await replaceCaseTeamMembers(id, payload.teamMemberIds, connection);
      }

      await replaceResourceLinks("case", id, payload.referenceLinks || payload.links || [], userId, { caseId: id }, connection);

      for (let i = 0; i < uploadedFiles.length; i++) {
        await createCaseFile(id, toCaseFilePayload(files[i], uploadedFiles[i], fileCategories[i]), userId, connection);
      }

      for (let i = 0; i < directFiles.length; i++) {
        const moved = await moveSupabaseFileToCase(directFiles[i].storagePath, id, directFiles[i].fileName);
        const uploadResult = {
          supabasePath: moved.supabasePath || directFiles[i].storagePath,
          fileUrl: moved.fileUrl || moved.supabasePath || directFiles[i].storagePath,
          fileName: directFiles[i].fileName,
          fileSize: directFiles[i].fileSize,
        };
        await createCaseFile(id, toDirectCaseFilePayload(directFiles[i], uploadResult), userId, connection);
      }
    });

    return getCaseDetails(id);
  } catch (error) {
    // DB transaction failed — clean up orphaned Cloudinary files
    await Promise.allSettled(
      [...uploadedFiles.map((u) => u.supabasePath), ...directFiles.map((u) => u.storagePath)]
        .map((storagePath) => deleteSupabaseFile(storagePath))
    );
    throw error;
  }
};

export const setCaseStatus = async (id, { statusId, statusName }) => {
  await ensureCaseExists(id);
  if (statusName) {
    const status = await getOfficialStatusByName(statusName);
    if (!status) throw new ApiError(422, "Selected case status is not allowed");
    statusId = status.id;
  }
  await ensureStatusExists(statusId);
  await updateCaseStatus(id, statusId);
  return getCaseDetails(id);
};

export const deleteCaseRecord = async (id) => {
  await ensureCaseExists(id);
  await archiveCase(id);
  
  // Also delete all files from Supabase Storage to save space
  await deleteCaseFolder(id);
};

export const cloneCaseRecord = async (id, userId) => {
  await ensureCaseExists(id);

  let newId;
  await withTransaction(async (connection) => {
    newId = await cloneCase(id, userId, connection);

    const customValues = await getCustomFieldValues(id);
    if (Object.keys(customValues).length) {
      await upsertCustomFieldValues(newId, customValues, connection);
    }

    const teamMemberIds = await getCaseTeamMemberIds(id);
    if (teamMemberIds.length) {
      await replaceCaseTeamMembers(newId, teamMemberIds, connection);
    }
  });

  return getCaseDetails(newId);
};

// ── Tasks ──────────────────────────────────────────────────────────────────────

export const getCaseTasks = async (caseId, query) => {
  await ensureCaseExists(caseId);
  return listTasksByCase(caseId, query);
};

export const getTasksGlobal = async (query, scope, userId) => listTasksGlobal(query, scope, userId);

export const createCaseTask = async (caseId, payload) => {
  await ensureCaseExists(caseId);

  await withTransaction(async (connection) => {
    const taskId = await createTask(caseId, payload, connection);
    if (payload.watcherIds?.length) {
      await replaceTaskWatchers(taskId, payload.watcherIds, connection);
    }
    await refreshCaseProgress(caseId, connection);
  });

  return listTasksByCase(caseId, { page: 1, perPage: 50 });
};

export const updateCaseTask = async (caseId, taskId, payload) => {
  await ensureCaseExists(caseId);

  await withTransaction(async (connection) => {
    await updateTask(caseId, taskId, payload, connection);
    if (payload.watcherIds) {
      await replaceTaskWatchers(taskId, payload.watcherIds, connection);
    }
    await refreshCaseProgress(caseId, connection);
  });

  return listTasksByCase(caseId, { page: 1, perPage: 50 });
};

export const deleteCaseTask = async (caseId, taskId) => {
  await ensureCaseExists(caseId);

  await withTransaction(async (connection) => {
    await deleteTask(caseId, taskId, connection);
    await refreshCaseProgress(caseId, connection);
  });
};

export const applyTemplateToCaseRecord = async (caseId, templateId) => {
  await ensureCaseExists(caseId);

  await withTransaction(async (connection) => {
    await applyTemplateToCase(caseId, templateId, connection);
    await refreshCaseProgress(caseId, connection);
  });

  return getCaseTasks(caseId, { page: 1, perPage: 50 });
};
