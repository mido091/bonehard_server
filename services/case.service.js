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
  getCaseFileById,
  getCaseTeamMemberIds,
  getCustomFieldValues,
  listCaseGeneralNotes,
  listCaseFiles,
  replaceCaseTeamMembers,
  upsertCustomFieldValues,
} from "../repositories/caseExtra.repository.js";
import { getOfficialStatusByName, statusExists } from "../repositories/status.repository.js";
import { createTask, deleteTask, listTasksByCase, listTasksGlobal, replaceTaskWatchers, updateTask } from "../repositories/task.repository.js";
import { uploadFileToSupabase, deleteSupabaseFile, deleteCaseFolder, moveSupabaseFileToCase } from "./supabase.service.js";

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
  const filesResult = await listCaseFiles(id, { page: 1, perPage: 100 });
  item.files = filesResult.rows;
  return item;
};

export const getAdminUserOrderDetails = async (id) => {
  const item = await ensureAdminUserOrderExists(id);
  item.customFieldValues = await getCustomFieldValues(id);
  const filesResult = await listCaseFiles(id, { page: 1, perPage: 100 });
  item.files = filesResult.rows;
  return item;
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
  return listCaseGeneralNotes(id, query);
};

export const createAdminUserOrderNote = async (id, payload, userId) => {
  await ensureAdminUserOrderExists(id);
  await createCaseGeneralNote(id, payload, userId);
  return getAdminUserOrderNotes(id, { page: 1, perPage: 50 });
};

export const getUserOrderFile = async (id, fileId, userId) => {
  await ensureUserOrderExists(id, userId);
  const file = await getCaseFileById(id, fileId);
  if (!file) throw new ApiError(404, "File not found");
  return file;
};

/**
 * Load case details including its custom field values.
 */
export const getCaseDetails = async (id) => {
  const item = await ensureCaseExists(id);
  // Attach custom field values so the Edit form can pre-fill them
  item.customFieldValues = await getCustomFieldValues(id);
  item.teamMemberIds = await getCaseTeamMemberIds(id);
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
const toCaseFilePayload = (multerFile, uploadResult) => ({
  folderType:              "private",
  fileName:                uploadResult.fileName || multerFile.originalname,
  fileUrl:                 uploadResult.fileUrl,
  mimeType:                multerFile.mimetype,
  fileSize:                uploadResult.fileSize || multerFile.size,
  storageProvider:         "supabase",
  // Store the storage path in cloudinaryPublicId for deletion later
  cloudinaryPublicId:      uploadResult.supabasePath || null,
  cloudinaryResourceType:  null,
  cloudinarySecureUrl:     uploadResult.fileUrl || null,
  cloudinaryVersion:       null,
});

/**
 * Uploads files to Supabase Storage concurrently, with automatic cleanup on partial failure.
 */
const uploadFilesForCase = async (caseId, files = []) => {
  if (!files.length) return [];
  
  const results = await Promise.allSettled(
    files.map(file => uploadFileToSupabase(caseId, file))
  );

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
  let cleanupPaths = uploadedFiles.map((u) => u.supabasePath);

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
        await createCaseFile(newId, toCaseFilePayload(files[i], uploadedFiles[i]), userId, connection);
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
  const defaultStatus = await getOfficialStatusByName("New");
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
    customUid: null,
    progressTracking: true,
    price: null,
    color: null,
    templateId: null,
    teamMemberIds: [],
    customFieldValues: payload.customFieldValues || {},
  };

  return createCaseRecordWithFiles(orderPayload, userId, files, { allowUserOrder: true });
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
  });

  return getCaseDetails(id);
};

export const updateCaseRecordWithFiles = async (id, payload, userId, files = []) => {
  await ensureCaseExists(id);
  await ensureStatusExists(payload.statusId);

  // 1. Upload new files to Cloudinary before touching the DB
  const uploadedFiles = await uploadFilesForCase(id, files);

  try {
    await withTransaction(async (connection) => {
      await updateCase(id, payload, connection);

      if (payload.customFieldValues && Object.keys(payload.customFieldValues).length) {
        await upsertCustomFieldValues(id, payload.customFieldValues, connection);
      }

      if (payload.teamMemberIds) {
        await replaceCaseTeamMembers(id, payload.teamMemberIds, connection);
      }

      for (let i = 0; i < uploadedFiles.length; i++) {
        await createCaseFile(id, toCaseFilePayload(files[i], uploadedFiles[i]), userId, connection);
      }
    });

    return getCaseDetails(id);
  } catch (error) {
    // DB transaction failed — clean up orphaned Cloudinary files
    await Promise.allSettled(
      uploadedFiles.map((u) => deleteSupabaseFile(u.supabasePath))
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
