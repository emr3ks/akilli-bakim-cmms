import { all, get, run } from '../db.js';

const MACHINE_FIELDS = [
  'id',
  'code',
  'name',
  'line',
  'brand',
  'model',
  'serial_number',
  'criticality',
  'status',
  'qr_code',
  'created_at',
  'updated_at',
].join(', ');

export function mapMachine(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    line: row.line,
    brand: row.brand,
    model: row.model,
    serialNumber: row.serial_number,
    criticality: row.criticality,
    status: row.status,
    qrCode: row.qr_code,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listMachines(database, filters = {}) {
  const clauses = [];
  const params = [];

  if (filters.q) {
    const search = `%${filters.q}%`;
    clauses.push(`(
      LOWER(code) LIKE LOWER(?) OR
      LOWER(name) LIKE LOWER(?) OR
      LOWER(line) LIKE LOWER(?) OR
      LOWER(brand) LIKE LOWER(?) OR
      LOWER(model) LIKE LOWER(?) OR
      LOWER(serial_number) LIKE LOWER(?)
    )`);
    params.push(search, search, search, search, search, search);
  }
  if (filters.line) {
    clauses.push('LOWER(line) = LOWER(?)');
    params.push(filters.line);
  }
  if (filters.status) {
    clauses.push('status = ?');
    params.push(filters.status);
  }
  if (filters.criticality) {
    clauses.push('criticality = ?');
    params.push(filters.criticality);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = await all(
    database,
    `SELECT ${MACHINE_FIELDS} FROM machines ${where} ORDER BY id ASC`,
    params,
  );
  return rows.map(mapMachine);
}

export async function findMachineById(database, machineId) {
  const parsedId = Number(machineId);
  if (!Number.isInteger(parsedId) || parsedId < 1) return null;
  const row = await get(database, `SELECT ${MACHINE_FIELDS} FROM machines WHERE id = ?`, [parsedId]);
  return mapMachine(row);
}

export async function findMachineByCode(database, code) {
  if (typeof code !== 'string' || !code.trim()) return null;
  const row = await get(database, `SELECT ${MACHINE_FIELDS} FROM machines WHERE code = ?`, [code.trim().toUpperCase()]);
  return mapMachine(row);
}

export async function insertMachine(database, data) {
  const timestamp = data.createdAt || new Date().toISOString();
  const result = await run(
    database,
    `INSERT INTO machines
      (code, name, line, brand, model, serial_number, criticality, status, qr_code, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.code,
      data.name,
      data.line,
      data.brand,
      data.model,
      data.serialNumber,
      data.criticality,
      data.status,
      data.qrCode || data.code,
      timestamp,
      data.updatedAt || timestamp,
    ],
  );
  return findMachineById(database, result.lastID);
}

export async function updateMachine(database, machineId, data) {
  const columnMap = {
    code: 'code',
    name: 'name',
    line: 'line',
    brand: 'brand',
    model: 'model',
    serialNumber: 'serial_number',
    criticality: 'criticality',
    status: 'status',
  };
  const updates = [];
  const params = [];

  for (const [field, column] of Object.entries(columnMap)) {
    if (Object.prototype.hasOwnProperty.call(data, field)) {
      updates.push(`${column} = ?`);
      params.push(data[field]);
    }
  }
  if (Object.prototype.hasOwnProperty.call(data, 'code')) {
    updates.push('qr_code = ?');
    params.push(data.code);
  }
  if (!updates.length) return findMachineById(database, machineId);

  updates.push('updated_at = ?');
  params.push(new Date().toISOString());
  params.push(machineId);
  await run(database, `UPDATE machines SET ${updates.join(', ')} WHERE id = ?`, params);
  return findMachineById(database, machineId);
}

export async function deleteMachine(database, machineId) {
  const result = await run(database, 'DELETE FROM machines WHERE id = ?', [machineId]);
  return result.changes > 0;
}

export async function setMachineStatus(database, machineId, status) {
  const result = await run(
    database,
    'UPDATE machines SET status = ?, updated_at = ? WHERE id = ?',
    [status, new Date().toISOString(), machineId],
  );
  return result.changes > 0;
}

export async function getStatusCounts(database) {
  const rows = await all(database, 'SELECT status, COUNT(*) AS count FROM machines GROUP BY status');
  const counts = { running: 0, maintenance: 0, faulted: 0, stopped: 0 };
  for (const row of rows) {
    if (Object.prototype.hasOwnProperty.call(counts, row.status)) {
      counts[row.status] = row.count;
    }
  }
  counts.total = Object.values(counts).reduce((total, count) => total + count, 0);
  return counts;
}
