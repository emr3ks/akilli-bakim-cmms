import {
  countUnreadNotifications,
  insertNotification,
  listNotifications,
  markAllNotificationsRead,
} from '../repositories/notifications.js';

export async function createNotification(database, data) {
  return insertNotification(database, data);
}

export async function getNotificationCenter(database, userId) {
  const [notifications, unreadCount] = await Promise.all([
    listNotifications(database, userId),
    countUnreadNotifications(database, userId),
  ]);
  return { notifications, unreadCount };
}

export async function markEveryNotificationRead(database, userId) {
  const updated = await markAllNotificationsRead(
    database,
    userId,
    new Date().toISOString(),
  );
  const unreadCount = await countUnreadNotifications(database, userId);
  return { updated, unreadCount };
}
