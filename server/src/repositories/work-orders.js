import { all, get, run } from '../db.js';

const WORK_ORDER_SELECT = `
  SELECT
    w.id,
    w.code,
    w.fault_id,
    w.assigned_to,
    w.status,
    w.intervention_note,
    w.root_cause,
    w.duration_minutes,
    w.solution_photo_data,
    w.created_by,
    w.assigned_at,
    w.started_at,
    w.closed_at,
    w.created_at,
    w.updated_at,
    f.code AS fault_code,
    f.title AS fault_title,
    f.category AS fault_category,
    f.urgency AS fault_urgency,
    f.description AS fault_description,
    f.photo_data AS fault_photo,
    f.status AS fault_status,
    m.id AS machine_id,
    m.code AS machine_code,
    m.name AS machine_name,
    m.line AS machine_line,
    m.status AS machine_status,
    technician.name AS technician_name,
    technician.initials AS technician_initials,
    creator.name AS creator_name,
    creator.initials AS creator_initials
  FROM work_orders w
  JOIN faults f ON f.id = w.fault_id
  JOIN machines m ON m.id = f.machine_id
  LEFT JOIN users technician ON technician.id = w.assigned_to
  JOIN users creator ON creator.id = w.created_by
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

export function mapWorkOrder(row) {
  if (!row) return null;
  const faultPhoto = mapPhoto(row.fault_photo);
  const solutionPhoto = mapPhoto(row.solution_photo_data);
  return {
    id: row.id,
    code: row.code,
    faultId: row.fault_id,
    fault: {
      id: row.fault_id,
      code: row.fault_code,
      title: row.fault_title,
      category: row.fault_category,
      urgency: row.fault_urgency,
      description: row.fault_description,
      ...faultPhoto,
      hasPhoto: Boolean(row.has_fault_photo ?? row.fault_photo),
      status: row.fault_status,
    },
    machine: {
      id: row.machine_id,
      code: row.machine_code,
      name: row.machine_name,
      line: row.machine_line,
      status: row.machine_status,
    },
    assignedTo: row.assigned_to
      ? {
          id: row.assigned_to,
          name: row.technician_name,
          initials: row.technician_initials,
        }
      : null,
    assignedToId: row.assigned_to ?? null,
    technicianId: row.assigned_to ?? null,
    status: row.status,
    interventionNote: row.intervention_note ?? null,
    rootCause: row.root_cause ?? null,
    durationMinutes: row.duration_minutes ?? null,
    solutionPhoto: solutionPhoto.photo,
    solutionPhotoBase64: solutionPhoto.photoBase64,
    solutionPhotoMimeType: solutionPhoto.photoMimeType,
    hasSolutionPhoto: Boolean(row.has_solution_photo ?? row.solution_photo_data),
    createdBy: row.created_by,
    createdByUser: {
      id: row.created_by,
      name: row.creator_name,
      initials: row.creator_initials,
    },
    assignedAt: row.assigned_at ?? null,
    startedAt: row.started_at ?? null,
    closedAt: row.closed_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listWorkOrders(database, filters = {}) {
  const clauses = [];
  const params = [];

  if (filters.status) {
    clauses.push('w.status = ?');
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
  if (filters.faultId) {
    clauses.push('w.fault_id = ?');
    params.push(filters.faultId);
  }
  if (filters.machineId) {
    clauses.push('f.machine_id = ?');
    params.push(filters.machineId);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const listSelect = WORK_ORDER_SELECT
    .replace(
      '    w.solution_photo_data,',
      "    NULL AS solution_photo_data,\n    w.solution_photo_data IS NOT NULL AS has_solution_photo,",
    )
    .replace(
      '    f.photo_data AS fault_photo,',
      "    NULL AS fault_photo,\n    f.photo_data IS NOT NULL AS has_fault_photo,",
    );
  const rows = await all(
    database,
    `${listSelect}
     ${where}
     ORDER BY
       CASE w.status
         WHEN 'open' THEN 1
         WHEN 'assigned' THEN 2
         WHEN 'in_progress' THEN 3
         WHEN 'waiting_parts' THEN 4
         WHEN 'resolved' THEN 5
         ELSE 6
       END ASC,
       w.created_at DESC,
       w.id DESC
     LIMIT 100`,
    params,
  );
  return rows.map(mapWorkOrder);
}

export async function findWorkOrderById(database, workOrderId) {
  const parsedId = Number(workOrderId);
  if (!Number.isInteger(parsedId) || parsedId < 1) return null;
  const row = await get(database, `${WORK_ORDER_SELECT} WHERE w.id = ?`, [parsedId]);
  return mapWorkOrder(row);
}

export async function findWorkOrderByFaultId(database, faultId) {
  const parsedId = Number(faultId);
  if (!Number.isInteger(parsedId) || parsedId < 1) return null;
  const row = await get(database, `${WORK_ORDER_SELECT} WHERE w.fault_id = ?`, [parsedId]);
  return mapWorkOrder(row);
}

export async function insertWorkOrder(database, data) {
  const timestamp = data.createdAt || new Date().toISOString();
  const result = await run(
    database,
    `INSERT INTO work_orders
      (code, fault_id, assigned_to, status, created_by, assigned_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.code,
      data.faultId,
      data.assignedTo ?? null,
      data.status ?? 'open',
      data.createdBy,
      data.assignedAt ?? null,
      timestamp,
      data.updatedAt || timestamp,
    ],
  );
  return findWorkOrderById(database, result.lastID);
}

export async function updateWorkOrder(database, workOrderId, data) {
  const columnMap = {
    assignedTo: 'assigned_to',
    status: 'status',
    interventionNote: 'intervention_note',
    rootCause: 'root_cause',
    durationMinutes: 'duration_minutes',
    solutionPhoto: 'solution_photo_data',
    assignedAt: 'assigned_at',
    startedAt: 'started_at',
    closedAt: 'closed_at',
  };
  const updates = [];
  const params = [];

  for (const [field, column] of Object.entries(columnMap)) {
    if (Object.prototype.hasOwnProperty.call(data, field)) {
      updates.push(`${column} = ?`);
      params.push(data[field] ?? null);
    }
  }
  if (!updates.length) return findWorkOrderById(database, workOrderId);

  updates.push('updated_at = ?');
  params.push(new Date().toISOString());
  params.push(workOrderId);
  await run(database, `UPDATE work_orders SET ${updates.join(', ')} WHERE id = ?`, params);
  return findWorkOrderById(database, workOrderId);
}
