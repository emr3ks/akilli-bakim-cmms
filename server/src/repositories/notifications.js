import { all, get, run } from '../db.js';

const NOTIFICATION_SELECT = `
  SELECT n.id, n.type, n.title, n.message, n.severity, n.dedupe_key, n.created_at,
    CASE WHEN nr.notification_id IS NULL THEN 0 ELSE 1 END AS is_read
  FROM notifications n
  LEFT JOIN notification_reads nr
    ON nr.notification_id = n.id AND nr.user_id = ?
`;

export function mapNotification(row) {
  if (!row) return null;
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    severity: row.severity,
    dedupeKey: row.dedupe_key ?? null,
    createdAt: row.created_at,
    isRead: Boolean(row.is_read),
  };
}

export async function insertNotification(database, data) {
  const createdAt = data.createdAt || new Date().toISOString();
  if (data.dedupeKey) {
    await run(
      database,
      `INSERT INTO notifications (type, title, message, severity, dedupe_key, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(dedupe_key) DO UPDATE SET
         type = excluded.type,
         title = excluded.title,
         message = excluded.message,
         severity = excluded.severity`,
      [
        data.type,
        data.title,
        data.message,
        data.severity ?? 'info',
        data.dedupeKey,
        createdAt,
      ],
    );
    const row = await get(
      database,
      `SELECT id, type, title, message, severity, dedupe_key, created_at, 0 AS is_read
       FROM notifications WHERE dedupe_key = ?`,
      [data.dedupeKey],
    );
    return mapNotification(row);
  }

  const result = await run(
    database,
    `INSERT INTO notifications (type, title, message, severity, dedupe_key, created_at)
     VALUES (?, ?, ?, ?, NULL, ?)`,
    [
      data.type,
      data.title,
      data.message,
      data.severity ?? 'info',
      createdAt,
    ],
  );
  return mapNotification(await get(database, `SELECT id, type, title, message, severity, dedupe_key, created_at, 0 AS is_read FROM notifications WHERE id = ?`, [result.lastID]));
}

export async function listNotifications(database, userId) {
  const rows = await all(
    database,
    `${NOTIFICATION_SELECT} ORDER BY n.created_at DESC, n.id DESC`,
    [userId],
  );
  return rows.map(mapNotification);
}

export async function countUnreadNotifications(database, userId) {
  const row = await get(
    database,
    `SELECT COUNT(*) AS count
     FROM notifications n
     LEFT JOIN notification_reads nr
       ON nr.notification_id = n.id AND nr.user_id = ?
     WHERE nr.notification_id IS NULL`,
    [userId],
  );
  return Number(row?.count || 0);
}

export async function markAllNotificationsRead(database, userId, readAt) {
  const result = await run(
    database,
    `INSERT OR IGNORE INTO notification_reads (notification_id, user_id, read_at)
     SELECT id, ?, ? FROM notifications`,
    [userId, readAt],
  );
  return result.changes;
}
