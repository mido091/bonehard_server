import { createNotification } from "../repositories/notification.repository.js";
import { triggerRealtimeEvent } from "./pusher.service.js";

/**
 * Creates a notification in the database and triggers a real-time event via Pusher.
 * @param {Object} params
 * @param {number} params.userId - Recipient user ID
 * @param {string} params.type - Notification type (e.g., 'order', 'note', 'file')
 * @param {string} params.title - Short title
 * @param {string} params.body - Detailed message
 * @param {Object} [params.data] - Additional metadata for the frontend
 */
export const notifyUser = async ({ userId, type, title, body, data = null }) => {
  try {
    const notification = await createNotification({
      userId,
      type,
      title,
      body,
      data,
    });

    // Notify the user in real-time
    await triggerRealtimeEvent(`private-user-${userId}`, "notification.created", notification);
    
    return notification;
  } catch (error) {
    // We don't want to break the main flow if notification fails, but we should log it
    console.error("Failed to send notification:", error);
    return null;
  }
};
