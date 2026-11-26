import { validationError } from './errors.js';

export const MACHINE_CODE_PATTERN = /^MCH-\d{4}-\d{3}$/;
export const CRITICALITIES = ['high', 'medium', 'low'];
export const MACHINE_STATUSES = ['running', 'maintenance', 'faulted', 'stopped'];
export const USER_ROLES = ['admin', 'technician', 'operator'];
export const RECORD_TYPES = ['maintenance', 'fault'];

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function requiredString(payload, field) {
  if (!isNonEmptyString(payload[field])) {
    throw validationError(`Machine ${field} is required and must be a non-empty string`);
  }
  return payload[field].trim();
}

export function validateMachinePayload(payload, { partial = false } = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw validationError('Machine request body must be a JSON object');
  }

  const data = {};
  const has = (field) => Object.prototype.hasOwnProperty.call(payload, field);
  const required = (field) => !partial || has(field);

  if (required('code')) {
    if (!isNonEmptyString(payload.code)) {
      throw validationError('Machine code must be a non-empty string');
    }
    const code = payload.code.trim();
    if (!MACHINE_CODE_PATTERN.test(code)) {
      throw validationError('Machine code must match MCH-YYYY-NNN (for example, MCH-2026-001)');
    }
    data.code = code;
  }

  for (const field of ['name', 'line', 'brand', 'model']) {
    if (required(field)) data[field] = requiredString(payload, field);
  }

  if (required('serialNumber') || has('serial_number')) {
    // Accept the database-style spelling as a small compatibility convenience.
    if (!has('serialNumber') && has('serial_number')) {
      data.serialNumber = requiredString({ serialNumber: payload.serial_number }, 'serialNumber');
    } else {
      data.serialNumber = requiredString(payload, 'serialNumber');
    }
  }

  if (required('criticality')) {
    if (!CRITICALITIES.includes(payload.criticality)) {
      throw validationError(`Machine criticality must be one of: ${CRITICALITIES.join(', ')}`);
    }
    data.criticality = payload.criticality;
  }

  if (required('status')) {
    if (!MACHINE_STATUSES.includes(payload.status)) {
      throw validationError(`Machine status must be one of: ${MACHINE_STATUSES.join(', ')}`);
    }
    data.status = payload.status;
  }

  // qrCode is generated from code and is intentionally not client-controlled.
  if (partial && !Object.keys(data).length) {
    throw validationError('At least one machine field must be supplied');
  }
  return data;
}

export function validateMachineFilters(query = {}) {
  const filters = {};
  if (query.q !== undefined) {
    if (typeof query.q !== 'string') throw validationError('q must be a string');
    filters.q = query.q.trim();
  }
  if (query.line !== undefined) {
    if (typeof query.line !== 'string') throw validationError('line must be a string');
    filters.line = query.line.trim();
  }
  if (query.status !== undefined && query.status !== '') {
    if (!MACHINE_STATUSES.includes(query.status)) {
      throw validationError(`status must be one of: ${MACHINE_STATUSES.join(', ')}`);
    }
    filters.status = query.status;
  }
  if (query.criticality !== undefined && query.criticality !== '') {
    if (!CRITICALITIES.includes(query.criticality)) {
      throw validationError(`criticality must be one of: ${CRITICALITIES.join(', ')}`);
    }
    filters.criticality = query.criticality;
  }
  return filters;
}

export function validateRecordPayload(payload, { requiredType = true } = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw validationError('Record request body must be a JSON object');
  }

  const data = {};
  if (requiredType) {
    if (!RECORD_TYPES.includes(payload.type)) {
      throw validationError(`Record type must be one of: ${RECORD_TYPES.join(', ')}`);
    }
    data.type = payload.type;
  } else {
    data.type = 'fault';
  }

  if (!isNonEmptyString(payload.description)) {
    throw validationError('Record description is required and must be a non-empty string');
  }
  data.description = payload.description.trim();
  if (data.description.length > 4000) {
    throw validationError('Record description must be 4000 characters or fewer');
  }

  if (payload.severity !== undefined && payload.severity !== null) {
    if (!isNonEmptyString(payload.severity)) {
      throw validationError('Record severity must be a non-empty string when supplied');
    }
    data.severity = payload.severity.trim();
    if (data.severity.length > 100) {
      throw validationError('Record severity must be 100 characters or fewer');
    }
  }

  return data;
}
