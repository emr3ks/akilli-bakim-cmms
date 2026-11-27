import { all, get, run } from '../db.js';

const HANDOVER_SELECT = `
  SELECT h.id, h.code, h.shift, h.shift_date, h.summary, h.notes,
    h.critical_faults_json, h.attention_machines_json, h.created_by, h.created_at,
    creator.name AS creator_name, creator.initials AS creator_initials,
    a.id AS approval_id, a.approved_by, a.approved_at,
    approver.name AS approver_name, approver.initials AS approver_initials
  FROM shift_handovers h
  JOIN users creator ON creator.id = h.created_by
  LEFT JOIN shift_handover_approvals a ON a.handover_id = h.id
  LEFT JOIN users approver ON approver.id = a.approved_by
`;

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function mapShiftHandover(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    shift: row.shift,
    shiftDate: row.shift_date,
    summary: row.summary,
    criticalFaults: parseJsonArray(row.critical_faults_json),
    attentionMachines: parseJsonArray(row.attention_machines_json),
    notes: row.notes ?? null,
    createdBy: row.created_by,
    createdByUser: {
      id: row.created_by,
      name: row.creator_name,
      initials: row.creator_initials,
    },
    createdAt: row.created_at,
    approved: Boolean(row.approval_id),
    approvedBy: row.approved_by ?? null,
    approvedByUser: row.approver_id || row.approver_name
      ? {
        id: row.approved_by,
        name: row.approver_name,
        initials: row.approver_initials,
      }
      : null,
    approvedAt: row.approved_at ?? null,
  };
}

export async function insertShiftHandover(database, data) {
  const result = await run(
    database,
    `INSERT INTO shift_handovers
      (code, shift, shift_date, summary, notes, critical_faults_json,
       attention_machines_json, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.code,
      data.shift,
      data.shiftDate,
      data.summary,
      data.notes ?? null,
      JSON.stringify(data.criticalFaults || []),
      JSON.stringify(data.attentionMachines || []),
      data.createdBy,
      data.createdAt,
    ],
  );
  return findShiftHandoverById(database, result.lastID);
}

export async function findShiftHandoverById(database, handoverId) {
  const parsedId = Number(handoverId);
  if (!Number.isInteger(parsedId) || parsedId < 1) return null;
  const row = await get(database, `${HANDOVER_SELECT} WHERE h.id = ?`, [parsedId]);
  return mapShiftHandover(row);
}

export async function listShiftHandovers(database) {
  const rows = await all(
    database,
    `${HANDOVER_SELECT} ORDER BY h.created_at DESC, h.id DESC`,
  );
  return rows.map(mapShiftHandover);
}

export async function insertShiftHandoverApproval(database, data) {
  const result = await run(
    database,
    `INSERT INTO shift_handover_approvals (handover_id, approved_by, approved_at)
     VALUES (?, ?, ?)`,
    [data.handoverId, data.approvedBy, data.approvedAt],
  );
  return result.changes > 0;
}
