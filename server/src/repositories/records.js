import { all, get, run } from '../db.js';

const RECORD_FIELDS = [
  'id',
  'machine_id',
  'type',
  'description',
  'severity',
  'created_by',
  'created_at',
].join(', ');

export function mapRecord(row) {
  if (!row) return null;
  return {
    id: row.id,
    machineId: row.machine_id,
    type: row.type,
    description: row.description,
    severity: row.severity ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at,
  };
}

export async function listRecords(database, machineId, type = undefined) {
  const params = [machineId];
  let typeClause = '';
  if (type) {
    typeClause = ' AND type = ?';
    params.push(type);
  }
  const rows = await all(
    database,
    `SELECT ${RECORD_FIELDS} FROM maintenance_records
     WHERE machine_id = ?${typeClause}
     ORDER BY created_at DESC, id DESC`,
    params,
  );
  return rows.map(mapRecord);
}

export async function findRecordById(database, recordId) {
  const row = await get(database, `SELECT ${RECORD_FIELDS} FROM maintenance_records WHERE id = ?`, [recordId]);
  return mapRecord(row);
}

export async function insertRecord(database, data) {
  const result = await run(
    database,
    `INSERT INTO maintenance_records
      (machine_id, type, description, severity, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      data.machineId,
      data.type,
      data.description,
      data.severity ?? null,
      data.createdBy ?? null,
      data.createdAt || new Date().toISOString(),
    ],
  );
  return findRecordById(database, result.lastID);
}
