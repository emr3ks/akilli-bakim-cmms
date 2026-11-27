import { get } from '../db.js';
import { validationError } from '../errors.js';

const DOCUMENT_SOURCES = {
  fault: { prefix: 'ARZ', table: 'faults' },
  workOrder: { prefix: 'IE', table: 'work_orders' },
  preventivePlan: { prefix: 'PB', table: 'maintenance_plans' },
  shiftHandover: { prefix: 'DT', table: 'shift_handovers' },
};

export async function generateDocumentCode(database, kind) {
  const source = DOCUMENT_SOURCES[kind];
  if (!source) throw new TypeError(`Unsupported document kind: ${kind}`);

  const year = new Date().getUTCFullYear();
  const codePrefix = `${source.prefix}-${year}-`;
  const row = await get(
    database,
    `SELECT MAX(CAST(SUBSTR(code, ?) AS INTEGER)) AS last_number
     FROM ${source.table}
     WHERE code LIKE ?`,
    [codePrefix.length + 1, `${codePrefix}%`],
  );
  const nextNumber = Number(row?.last_number || 0) + 1;
  if (nextNumber > 999) {
    throw validationError(`${source.prefix} document number capacity for ${year} has been reached`);
  }
  return `${codePrefix}${String(nextNumber).padStart(3, '0')}`;
}
