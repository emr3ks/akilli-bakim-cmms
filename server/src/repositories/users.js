import { get, all } from '../db.js';

const USER_FIELDS = 'id, name, email, role, initials';

export function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    initials: row.initials,
  };
}

export async function listUsers(database) {
  const rows = await all(database, `SELECT ${USER_FIELDS} FROM users ORDER BY id ASC`);
  return rows.map(mapUser);
}

export async function findUserById(database, userId) {
  const parsedId = Number(userId);
  if (!Number.isInteger(parsedId) || parsedId < 1) return null;
  const row = await get(database, `SELECT ${USER_FIELDS} FROM users WHERE id = ?`, [parsedId]);
  return mapUser(row);
}
