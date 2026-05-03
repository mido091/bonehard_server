import {
  deleteAllNotifications,
  deleteNotification,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../repositories/notification.repository.js";
import { sendSuccess } from "../utils/apiResponse.js";

export const notifications = async (req, res) => {
  const result = await listNotifications(req.user.id, req.validatedQuery || req.query);
  sendSuccess(res, { data: result.rows, meta: result.meta });
};

export const readNotification = async (req, res) => {
  await markNotificationRead(req.params.id, req.user.id);
  sendSuccess(res, { message: "Notification marked as read" });
};

export const readAllNotifications = async (req, res) => {
  const updated = await markAllNotificationsRead(req.user.id);
  sendSuccess(res, {
    data: { updated },
    message: "Notifications marked as read",
  });
};

export const removeNotification = async (req, res) => {
  await deleteNotification(req.params.id, req.user.id);
  sendSuccess(res, { message: "Notification deleted" });
};

export const removeAllNotifications = async (req, res) => {
  const deleted = await deleteAllNotifications(req.user.id);
  sendSuccess(res, {
    data: { deleted },
    message: "Notifications deleted",
  });
};
