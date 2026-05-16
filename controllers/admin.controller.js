import { pool } from "../config/db.js";
import { getAdminStats } from "../services/admin.service.js";
import {
  createAdminUserOrderNote,
  deleteAdminOrderFile,
  deleteAdminUserOrder,
  deleteAdminUserOrderNote,
  getAdminUserOrderFile,
  getAdminUserOrderDetails,
  getAdminUserOrderNotes,
  getAdminUserOrders,
  finalizeAdminFilesToOrder,
  renameAdminUserOrderFile,
  setAdminUserOrderStatus,
  updateAdminUserOrderNote,
  uploadAdminFilesToOrder,
} from "../services/case.service.js";
import { exportAdminUserOrderPackage } from "../services/exportPackage.service.js";
import { exportAdminUserOrderCsvPackage, exportDashboardCsvPackage } from "../services/csvExport.service.js";
import { getSupabaseDownloadUrl } from "../services/supabase.service.js";
import { listTeamsOptions, getUserReport } from "../repositories/caseExtra.repository.js";

import {
  createAdminUser,
  deleteAdminUser,
  getDashboardAnalytics,
  getAnalytics,
  listUsers,
  updateAdminUser,
  updateUserRole,
} from "../repositories/adminDashboard.repository.js";
import { listNotifications, markNotificationRead } from "../repositories/notification.repository.js";
import { getAssignableUsers } from "../repositories/user.repository.js";
import { createUser } from "../repositories/user.repository.js";
import { hashPassword } from "../utils/password.js";
import { ApiError, sendSuccess } from "../utils/apiResponse.js";

export const stats = async (req, res) => {
  const data = await getAdminStats();
  // Attach unread notification count for this admin user
  const [unreadRows] = await pool.query(
    `SELECT COUNT(*) AS count FROM notifications WHERE user_id = :userId AND read_at IS NULL`,
    { userId: req.user.id },
  );
  data.unreadNotifications = Number(unreadRows[0]?.count || 0);

  // Attach unread messages count
  const [unreadMessagesRows] = await pool.query(
    `SELECT COUNT(*) AS count FROM contact_submissions WHERE status = 'new'`
  );
  data.unreadMessages = Number(unreadMessagesRows[0]?.count || 0);

  sendSuccess(res, { data });
};

export const dashboard = async (req, res) => {
  const data = await getDashboardAnalytics(req.user.id);
  sendSuccess(res, { data });
};

export const exportDashboardCsv = async (req, res) => {
  await exportDashboardCsvPackage(req.user.id, res);
};

export const userOptions = async (_req, res) => {
  const users = await getAssignableUsers();
  sendSuccess(res, { data: users });
};

export const teamOptions = async (_req, res) => {
  const teams = await listTeamsOptions();
  sendSuccess(res, { data: teams });
};

export const users = async (req, res) => {
  const result = await listUsers(req.validatedQuery || req.query);
  sendSuccess(res, { data: result.rows, meta: result.meta });
};

export const userOrders = async (req, res) => {
  const result = await getAdminUserOrders(req.validatedQuery || req.query);
  sendSuccess(res, { data: result.rows, meta: result.meta });
};

export const userOrderDetail = async (req, res) => {
  const item = await getAdminUserOrderDetails(req.params.id);
  sendSuccess(res, { data: item });
};

export const exportUserOrderPackage = async (req, res) => {
  await exportAdminUserOrderPackage(req.params.id, res);
};

export const exportUserOrderCsv = async (req, res) => {
  await exportAdminUserOrderCsvPackage(req.params.id, res);
};

export const downloadUserOrderFile = async (req, res) => {
  const file = await getAdminUserOrderFile(req.params.id, req.params.fileId);
  const url = file.storageProvider === "supabase"
    ? await getSupabaseDownloadUrl(file)
    : file.fileUrl || file.cloudinarySecureUrl;
  if (!url) throw new ApiError(404, "File not found");

  return res.redirect(url);
};

export const renameUserOrderFile = async (req, res) => {
  const item = await renameAdminUserOrderFile(req.params.id, req.params.fileId, (req.validatedBody || req.body).fileName);
  sendSuccess(res, { data: item, message: "File renamed" });
};

export const updateUserOrderStatus = async (req, res) => {
  const item = await setAdminUserOrderStatus(req.params.id, req.validatedBody || req.body);
  sendSuccess(res, { data: item, message: "Order status updated" });
};

export const removeUserOrder = async (req, res) => {
  await deleteAdminUserOrder(req.params.id);
  sendSuccess(res, { message: "Order deleted" });
};

export const userOrderNotes = async (req, res) => {
  const result = await getAdminUserOrderNotes(req.params.id, req.validatedQuery || req.query);
  sendSuccess(res, { data: result.rows, meta: result.meta });
};

export const createUserOrderNote = async (req, res) => {
  const result = await createAdminUserOrderNote(req.params.id, req.validatedBody || req.body, req.user.id);
  sendSuccess(res, { data: result.rows, meta: result.meta, message: 'Team note saved', status: 201 });
};

export const updateUserOrderNote = async (req, res) => {
  const result = await updateAdminUserOrderNote(
    req.params.id,
    req.params.noteId,
    req.validatedBody || req.body,
    req.user.id,
  );
  sendSuccess(res, { data: result.rows, meta: result.meta, message: 'Note updated' });
};

export const deleteUserOrderNote = async (req, res) => {
  await deleteAdminUserOrderNote(req.params.id, req.params.noteId);
  // Return the updated notes list for easy frontend refresh
  const result = await getAdminUserOrderNotes(req.params.id, { page: 1, perPage: 50 });
  sendSuccess(res, { data: result.rows, meta: result.meta, message: 'Note deleted' });
};

/**
 * POST /api/admin/user-orders/:id/files
 * Upload one or more files to an order on behalf of admin/assistant.
 * Reads `folderType` from the multipart form field (default: 'private').
 */
export const uploadAdminOrderFile = async (req, res) => {
  const { folderType = 'private' } = req.validatedBody || req.body || {};
  const item = await uploadAdminFilesToOrder(
    req.params.id,
    req.files || [],
    req.user.id,
    folderType,
  );
  sendSuccess(res, { data: item, message: 'Files uploaded', status: 201 });
};

export const finalizeAdminOrderFile = async (req, res) => {
  const { folderType = 'private', files, uploadedFiles } = req.body || {};
  const item = await finalizeAdminFilesToOrder(
    req.params.id,
    files || uploadedFiles || [],
    req.user.id,
    folderType,
  );
  sendSuccess(res, { data: item, message: 'Files uploaded', status: 201 });
};

/**
 * DELETE /api/admin/user-orders/:id/files/:fileId
 * Delete a file from an order (admin/assistant, no ownership check).
 */
export const deleteAdminOrderFileHandler = async (req, res) => {
  const item = await deleteAdminOrderFile(req.params.id, req.params.fileId);
  sendSuccess(res, { data: item, message: 'File deleted' });
};

export const createUserRecord = async (req, res) => {
  const passwordHash = await hashPassword(req.body.password);
  let user;
  try {
    user = await createAdminUser({
      ...req.body,
      passwordHash,
      phone: req.body.phone || null,
      address: req.body.address || null,
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      throw new ApiError(409, "A user with this email already exists");
    }
    throw error;
  }

  sendSuccess(res, { data: user, message: "User created", status: 201 });
};

export const updateUserRecord = async (req, res) => {
  const payload = { ...req.body };

  if (Number(req.params.id) === Number(req.user.id) && payload.isActive === false) {
    throw new ApiError(422, "You cannot disable your own account");
  }

  if (payload.password) {
    payload.passwordHash = await hashPassword(payload.password);
  }
  delete payload.password;

  let user;
  try {
    user = await updateAdminUser(req.params.id, payload);
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      throw new ApiError(409, "A user with this email already exists");
    }
    throw error;
  }

  if (!user) throw new ApiError(404, "User not found");

  sendSuccess(res, { data: user, message: "User updated" });
};

export const deleteUserRecord = async (req, res) => {
  if (Number(req.params.id) === Number(req.user.id)) {
    throw new ApiError(422, "You cannot delete your own account");
  }

  await deleteAdminUser(req.params.id);
  sendSuccess(res, { message: "User deleted" });
};

export const assistants = async (req, res) => {
  const result = await listUsers({ ...(req.validatedQuery || req.query), role: "assistant" });
  sendSuccess(res, { data: result.rows, meta: result.meta });
};

export const createAssistant = async (req, res) => {
  const passwordHash = await hashPassword(req.body.password);
  const user = await createUser({
    name: req.body.name,
    email: req.body.email,
    passwordHash,
    phone: req.body.phone || null,
    address: req.body.address || null,
  });

  await updateUserRole(user.id, "assistant");
  sendSuccess(res, { data: { ...user, role: "assistant" }, message: "Assistant created", status: 201 });
};

export const changeRole = async (req, res) => {
  await updateUserRole(req.params.id, req.body.role);
  sendSuccess(res, { message: "User role updated" });
};

export const analytics = async (_req, res) => {
  const data = await getAnalytics();
  sendSuccess(res, { data });
};

export const notifications = async (req, res) => {
  const result = await listNotifications(req.user.id, req.validatedQuery || req.query);
  sendSuccess(res, { data: result.rows, meta: result.meta });
};

export const readNotification = async (req, res) => {
  await markNotificationRead(req.params.id, req.user.id);
  sendSuccess(res, { message: "Notification marked as read" });
};

/** GET /api/admin/users/:id/report */
export const userReport = async (req, res) => {
  const data = await getUserReport(req.params.id);
  if (!data.user) {
    return res.status(404).json({ success: false, message: "User not found" });
  }
  sendSuccess(res, { data });
};
