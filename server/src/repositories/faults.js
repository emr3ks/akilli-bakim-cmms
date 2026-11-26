import { all, get, run } from '../db.js';

const FAULT_SELECT = `
  SELECT
    f.id,
    f.code,
    f.machine_id,
    f.title,
    f.category,
    f.urgency,
    f.description,
    f.photo_data,
    f.status,
    f.reported_by,
    f.created_at,
    f.updated_at,
    m.code AS machine_code,
    m.name AS machine_name,
    m.line AS machine_line,
    m.status AS machine_status,
    reporter.name AS reporter_name,
    reporter.initials AS reporter_initials,
    w.id AS work_order_id,
    w.code AS work_order_code,
    w.status AS work_order_status,
    w.assigned_to AS work_order_assigned_to
  FROM faults f
  JOIN machines m ON m.id = f.machine_id
  JOIN users reporter ON reporter.id = f.reported_by
  LEFT JOIN work_orders w ON w.fault_id = f.id
`;

function mapPhoto(value) {
  if (!value) return { photo: null, photoBase64: null, photoMimeType: null };
  const match = /^data:([^;]+);base64,(.+)$/.exec(value);
  if (!match) return { photo: null, photoBase64: null, photoMimeType: null };
  return {
    photo: null,
    photoBase64: match[2],
    photoMimeType: match[1],
  };
}

export function mapFault(row) {
  if (!row) return null;
  const photo = mapPhoto(row.photo_data);
  return {
    id: row.id,
    code: row.code,
    machineId: row.machine_id,
    machine: {
      id: row.machine_id,
      code: row.machine_code,
      name: row.machine_name,
      line: row.machine_line,
      status: row.machine_status,
    },
    title: row.title,
    category: row.category,
    urgency: row.urgency,
    description: row.description,
    ...photo,
    hasPhoto: Boolean(row.has_photo ?? row.photo_data),
    status: row.status,
    reportedBy: {
      id: row.reported_by,
      name: row.reporter_name,
      initials: row.reporter_initials,
    },
    reportedById: row.reported_by,
    createdBy: row.reported_by,
    workOrder: row.work_order_id
      ? {
          id: row.work_order_id,
          code: row.work_order_code,
          status: row.work_order_status,
          assignedTo: row.work_order_assigned_to ?? null,
        }
      : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listFaults(database, filters = {}) {
  const clauses = [];
  const params = [];

  if (filters.status) {
    clauses.push('f.status = ?');
    params.push(filters.status);
  }
  if (filters.urgency) {
    clauses.push('f.urgency = ?');
    params.push(filters.urgency);
  }
  if (filters.assignedTo) {
    clauses.push('w.assigned_to = ?');
    params.push(filters.assignedTo);
  }
  if (filters.machineId) {
    clauses.push('f.machine_id = ?');
    params.push(filters.machineId);
  }
  if (filters.reportedBy) {
    clauses.push('f.reported_by = ?');
    params.push(filters.reportedBy);
  }
  if (filters.viewerId) {
    clauses.push('(f.reported_by = ? OR w.assigned_to = ?)');
    params.push(filters.viewerId, filters.viewerId);
  }
  if (filters.q) {
    const search = `%${filters.q}%`;
    clauses.push(`(
      LOWER(f.code) LIKE LOWER(?) OR
      LOWER(f.title) LIKE LOWER(?) OR
      LOWER(m.code) LIKE LOWER(?) OR
      LOWER(m.name) LIKE LOWER(?)
    )`);
    params.push(search, search, search, search);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const listSelect = FAULT_SELECT.replace(
    '    f.photo_data,',
    "    NULL AS photo_data,\n    f.photo_data IS NOT NULL AS has_photo,",
  );
  const rows = await all(
    database,
    `${listSelect}
     ${where}
     ORDER BY
       CASE f.urgency
         WHEN 'critical' THEN 1
         WHEN 'high' THEN 2
         WHEN 'medium' THEN 3
         ELSE 4
       END ASC,
       f.created_at DESC,
       f.id DESC
     LIMIT 100`,
    params,
  );
  return rows.map(mapFault);
}

export async function findFaultById(database, faultId) {
  const parsedId = Number(faultId);
  if (!Number.isInteger(parsedId) || parsedId < 1) return null;
  const row = await get(database, `${FAULT_SELECT} WHERE f.id = ?`, [parsedId]);
  return mapFault(row);
}

export async function findFaultByCode(database, code) {
  if (typeof code !== 'string' || !code.trim()) return null;
  const row = await get(database, `${FAULT_SELECT} WHERE f.code = ?`, [code.trim().toUpperCase()]);
  return mapFault(row);
}

export async function insertFault(database, data) {
  const timestamp = data.createdAt || new Date().toISOString();
  const result = await run(
    database,
    `INSERT INTO faults
      (code, machine_id, title, category, urgency, description, photo_data, status, reported_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.code,
      data.machineId,
      data.title,
      data.category,
      data.urgency,
      data.description,
      data.photo ?? null,
      data.status ?? 'open',
      data.reportedBy,
      timestamp,
      data.updatedAt || timestamp,
    ],
  );
  return findFaultById(database, result.lastID);
}

export async function updateFaultStatus(database, faultId, status) {
  const result = await run(
    database,
    'UPDATE faults SET status = ?, updated_at = ? WHERE id = ?',
    [status, new Date().toISOString(), faultId],
  );
  return result.changes > 0;
}

export async function hasOtherOpenCriticalFault(database, machineId, excludedFaultId) {
  const row = await get(
    database,
    `SELECT COUNT(*) AS count
     FROM faults
     WHERE machine_id = ? AND id != ? AND status = 'open' AND urgency = 'critical'`,
    [machineId, excludedFaultId],
  );
  return Number(row?.count || 0) > 0;
}
