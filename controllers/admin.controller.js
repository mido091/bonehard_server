import { pool } from "../config/db.js";
import { getAdminStats } from "../services/admin.service.js";
import {
  createAdminUserOrderNote,
  deleteAdminUserOrder,
  getAdminUserOrderDetails,
  getAdminUserOrderNotes,
  getAdminUserOrders,
  setAdminUserOrderStatus,
} from "../services/case.service.js";
import { exportAdminUserOrderPackage } from "../services/exportPackage.service.js";
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
  const [unreadRows] = await pool.execute(
    `SELECT COUNT(*) AS count FROM notifications WHERE user_id = :userId AND read_at IS NULL`,
    { userId: req.user.id },
  );
  data.unreadNotifications = Number(unreadRows[0]?.count || 0);

  // Attach unread messages count
  const [unreadMessagesRows] = await pool.execute(
    `SELECT COUNT(*) AS count FROM contact_submissions WHERE status = 'new'`
  );
  data.unreadMessages = Number(unreadMessagesRows[0]?.count || 0);

  sendSuccess(res, { data });
};

export const dashboard = async (req, res) => {
  const data = await getDashboardAnalytics(req.user.id);
  sendSuccess(res, { data });
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
  sendSuccess(res, { data: result.rows, meta: result.meta, message: "Team note saved", status: 201 });
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
