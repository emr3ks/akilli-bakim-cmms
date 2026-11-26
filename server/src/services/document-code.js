import { get } from '../db.js';
import { validationError } from '../errors.js';

const PREFIXES = {
  fault: 'ARZ',
  workOrder: 'IE',
};

export async function generateDocumentCode(database, kind) {
  const prefix = PREFIXES[kind];
  if (!prefix) throw new TypeError(`Unsupported document kind: ${kind}`);

  const year = new Date().getUTCFullYear();
  const codePrefix = `${prefix}-${year}-`;
  const row = await get(
    database,
    `SELECT MAX(CAST(SUBSTR(code, ?) AS INTEGER)) AS last_number
     FROM (
       SELECT code FROM faults WHERE code LIKE ?
       UNION ALL
       SELECT code FROM work_orders WHERE code LIKE ?
     )`,
    [codePrefix.length + 1, `${codePrefix}%`, `${codePrefix}%`],
  );
  const nextNumber = Number(row?.last_number || 0) + 1;
  if (nextNumber > 999) {
    throw validationError(`${prefix} document number capacity for ${year} has been reached`);
  }
  return `${codePrefix}${String(nextNumber).padStart(3, '0')}`;
}
