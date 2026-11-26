import { validationError } from './errors.js';
import { isDateOnly } from './utils/date-only.js';

export const MACHINE_CODE_PATTERN = /^MCH-\d{4}-\d{3}$/;
export const CRITICALITIES = ['high', 'medium', 'low'];
export const MACHINE_STATUSES = ['running', 'maintenance', 'faulted', 'stopped'];
export const USER_ROLES = ['admin', 'technician', 'operator'];
export const RECORD_TYPES = ['maintenance', 'fault'];
export const FAULT_CATEGORIES = [
  'mechanical',
  'electrical',
  'pneumatic_hydraulic',
  'software_sensor',
  'other',
];
export const FAULT_URGENCIES = ['critical', 'high', 'medium', 'low'];
export const FAULT_STATUSES = ['open', 'resolved'];
export const WORK_ORDER_STATUSES = [
  'open',
  'assigned',
  'in_progress',
  'waiting_parts',
  'resolved',
  'closed',
];
export const FINAL_WORK_ORDER_STATUSES = ['resolved', 'closed'];
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
export const MAX_PHOTO_BASE64_LENGTH = 2_800_000;
export const PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const PREVENTIVE_FREQUENCIES = [
  'weekly',
  'monthly',
  'quarterly',
  'semiannual',
  'annual',
  'working_hours',
];

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

function positiveInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw validationError(`${label} must be a positive integer`);
  }
  return parsed;
}

function detectImageMime(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buffer.length >= 8
    && buffer[0] === 0x89
    && buffer[1] === 0x50
    && buffer[2] === 0x4e
    && buffer[3] === 0x47
    && buffer[4] === 0x0d
    && buffer[5] === 0x0a
    && buffer[6] === 0x1a
    && buffer[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (
    buffer.length >= 12
    && buffer.toString('ascii', 0, 4) === 'RIFF'
    && buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

function normalizePhotoPayload(payload, options) {
  const { base64Key, mimeKey, label } = options;
  const base64 = payload[base64Key];
  const mimeType = payload[mimeKey];

  if (base64 === undefined && mimeType === undefined) return null;
  if (typeof base64 !== 'string' || !base64.trim()) {
    throw validationError(`${base64Key} must be a non-empty base64 string`);
  }
  if (!PHOTO_MIME_TYPES.includes(mimeType)) {
    throw validationError(`${mimeKey} must be one of: ${PHOTO_MIME_TYPES.join(', ')}`);
  }

  const normalizedBase64 = base64.trim();
  if (normalizedBase64.length > MAX_PHOTO_BASE64_LENGTH) {
    throw validationError(`${base64Key} must be 2800000 characters or fewer`);
  }
  if (normalizedBase64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalizedBase64)) {
    throw validationError(`${base64Key} must contain valid base64 data`);
  }

  const bytes = Buffer.from(normalizedBase64, 'base64');
  if (bytes.length === 0 || bytes.length > MAX_PHOTO_BYTES) {
    throw validationError(`${label} must contain an image no larger than 2 MB`);
  }
  const detectedMime = detectImageMime(bytes);
  if (!detectedMime || detectedMime !== mimeType) {
    throw validationError(`${label} content does not match ${mimeType}`);
  }

  return `data:${mimeType};base64,${normalizedBase64}`;
}

export function validateFaultPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw validationError('Fault request body must be a JSON object');
  }

  const data = {
    machineId: positiveInteger(payload.machineId, 'Fault machineId'),
  };

  if (!isNonEmptyString(payload.title)) {
    throw validationError('Fault title is required and must be a non-empty string');
  }
  data.title = payload.title.trim();
  if (data.title.length > 160) {
    throw validationError('Fault title must be 160 characters or fewer');
  }

  if (!FAULT_CATEGORIES.includes(payload.category)) {
    throw validationError(`Fault category must be one of: ${FAULT_CATEGORIES.join(', ')}`);
  }
  data.category = payload.category;

  if (!FAULT_URGENCIES.includes(payload.urgency)) {
    throw validationError(`Fault urgency must be one of: ${FAULT_URGENCIES.join(', ')}`);
  }
  data.urgency = payload.urgency;

  if (!isNonEmptyString(payload.description)) {
    throw validationError('Fault description is required and must be a non-empty string');
  }
  data.description = payload.description.trim();
  if (data.description.length > 4000) {
    throw validationError('Fault description must be 4000 characters or fewer');
  }

  if (payload.photo !== undefined) {
    throw validationError('Use photoBase64 and photoMimeType for fault photos');
  }
  data.photo = normalizePhotoPayload(payload, {
    base64Key: 'photoBase64',
    mimeKey: 'photoMimeType',
    label: 'Fault photo',
  });
  return data;
}

export function validateFaultFilters(query = {}) {
  const filters = {};
  if (query.status !== undefined && query.status !== '') {
    if (!FAULT_STATUSES.includes(query.status)) {
      throw validationError(`status must be one of: ${FAULT_STATUSES.join(', ')}`);
    }
    filters.status = query.status;
  }
  if (query.urgency !== undefined && query.urgency !== '') {
    if (!FAULT_URGENCIES.includes(query.urgency)) {
      throw validationError(`urgency must be one of: ${FAULT_URGENCIES.join(', ')}`);
    }
    filters.urgency = query.urgency;
  }
  const assignedTo = query.assignedTo ?? query.technicianId;
  if (assignedTo !== undefined && assignedTo !== '') {
    filters.assignedTo = positiveInteger(assignedTo, 'assignedTo');
  }
  if (query.machineId !== undefined && query.machineId !== '') {
    filters.machineId = positiveInteger(query.machineId, 'machineId');
  }
  if (query.q !== undefined) {
    if (typeof query.q !== 'string') throw validationError('q must be a string');
    filters.q = query.q.trim();
  }
  return filters;
}

export function validateWorkOrderPayload(payload, { requireFaultId = true } = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw validationError('Work order request body must be a JSON object');
  }

  const data = {};
  if (requireFaultId || payload.faultId !== undefined) {
    data.faultId = positiveInteger(payload.faultId, 'Work order faultId');
  }
  const assignedTo = payload.assignedTo ?? payload.technicianId;
  if (assignedTo !== undefined && assignedTo !== null && assignedTo !== '') {
    data.assignedTo = positiveInteger(assignedTo, 'assignedTo');
  }
  return data;
}

export function validateAssignmentPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw validationError('Assignment request body must be a JSON object');
  }
  const assignedTo = payload.assignedTo ?? payload.technicianId;
  return { assignedTo: positiveInteger(assignedTo, 'assignedTo') };
}

export function validateWorkOrderStatusPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw validationError('Work order status request body must be a JSON object');
  }
  if (!WORK_ORDER_STATUSES.includes(payload.status)) {
    throw validationError(`Work order status must be one of: ${WORK_ORDER_STATUSES.join(', ')}`);
  }

  const data = { status: payload.status };
  if (payload.interventionNote !== undefined && payload.interventionNote !== null) {
    if (!isNonEmptyString(payload.interventionNote)) {
      throw validationError('interventionNote must be a non-empty string');
    }
    data.interventionNote = payload.interventionNote.trim();
    if (data.interventionNote.length > 4000) {
      throw validationError('interventionNote must be 4000 characters or fewer');
    }
  }
  if (payload.rootCause !== undefined && payload.rootCause !== null) {
    if (!isNonEmptyString(payload.rootCause)) {
      throw validationError('rootCause must be a non-empty string');
    }
    data.rootCause = payload.rootCause.trim();
    if (data.rootCause.length > 4000) {
      throw validationError('rootCause must be 4000 characters or fewer');
    }
  }
  if (payload.durationMinutes !== undefined && payload.durationMinutes !== null) {
    const duration = Number(payload.durationMinutes);
    if (!Number.isInteger(duration) || duration < 1 || duration > 100000) {
      throw validationError('durationMinutes must be an integer between 1 and 100000');
    }
    data.durationMinutes = duration;
  }
  if (payload.solutionPhoto !== undefined) {
    throw validationError('Use solutionPhotoBase64 and solutionPhotoMimeType for solution photos');
  }
  if (payload.solutionPhotoBase64 !== undefined
    || payload.solutionPhotoMimeType !== undefined) {
    data.solutionPhoto = normalizePhotoPayload(payload, {
      base64Key: 'solutionPhotoBase64',
      mimeKey: 'solutionPhotoMimeType',
      label: 'Solution photo',
    });
  }
  return data;
}

export function validateWorkOrderFilters(query = {}) {
  const filters = {};
  if (query.status !== undefined && query.status !== '') {
    if (!WORK_ORDER_STATUSES.includes(query.status)) {
      throw validationError(`status must be one of: ${WORK_ORDER_STATUSES.join(', ')}`);
    }
    filters.status = query.status;
  }
  if (query.urgency !== undefined && query.urgency !== '') {
    if (!FAULT_URGENCIES.includes(query.urgency)) {
      throw validationError(`urgency must be one of: ${FAULT_URGENCIES.join(', ')}`);
    }
    filters.urgency = query.urgency;
  }
  const assignedTo = query.assignedTo ?? query.technicianId;
  if (assignedTo !== undefined && assignedTo !== '') {
    filters.assignedTo = positiveInteger(assignedTo, 'assignedTo');
  }
  if (query.faultId !== undefined && query.faultId !== '') {
    filters.faultId = positiveInteger(query.faultId, 'faultId');
  }
  if (query.machineId !== undefined && query.machineId !== '') {
    filters.machineId = positiveInteger(query.machineId, 'machineId');
  }
  return filters;
}

function preventiveText(value, field, { required = false, maxLength = 500 } = {}) {
  if (value === undefined || value === null) {
    if (required) throw validationError(`${field} is required and must be a non-empty string`);
    return null;
  }
  if (typeof value !== 'string' || (required && !value.trim())) {
    throw validationError(`${field} must be a non-empty string`);
  }
  const trimmed = value.trim();
  if (!trimmed && !required) return null;
  if (trimmed.length > maxLength) {
    throw validationError(`${field} must be ${maxLength} characters or fewer`);
  }
  return trimmed;
}

function preventiveHours(value, field, { allowZero = false } = {}) {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || (allowZero ? parsed < 0 : parsed <= 0)) {
    throw validationError(`${field} must be a number ${allowZero ? 'greater than or equal to 0' : 'greater than 0'}`);
  }
  return parsed;
}

export function validatePreventivePlanPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw validationError('Preventive plan request body must be a JSON object');
  }

  const data = {
    machineId: positiveInteger(payload.machineId, 'Preventive plan machineId'),
    name: preventiveText(payload.name, 'Preventive plan name', { required: true, maxLength: 160 }),
    assignedTo: positiveInteger(payload.assignedTo, 'Preventive plan assignedTo'),
  };

  if (!PREVENTIVE_FREQUENCIES.includes(payload.frequency)) {
    throw validationError(`Preventive plan frequency must be one of: ${PREVENTIVE_FREQUENCIES.join(', ')}`);
  }
  data.frequency = payload.frequency;

  if (!isDateOnly(payload.nextDueDate)) {
    throw validationError('Preventive plan nextDueDate must be a valid date in YYYY-MM-DD format');
  }
  data.nextDueDate = payload.nextDueDate;

  if (!Array.isArray(payload.checklist) || payload.checklist.length === 0) {
    throw validationError('Preventive plan checklist must contain at least one item');
  }
  data.checklist = payload.checklist.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw validationError(`Preventive plan checklist item ${index + 1} must be a JSON object`);
    }
    return {
      position: index + 1,
      title: preventiveText(item.title, `Preventive plan checklist item ${index + 1} title`, {
        required: true,
        maxLength: 200,
      }),
      measurementLabel: preventiveText(
        item.measurementLabel,
        `Preventive plan checklist item ${index + 1} measurementLabel`,
        { maxLength: 100 },
      ),
    };
  });

  if (data.frequency === 'working_hours') {
    if (payload.intervalHours === undefined || payload.intervalHours === null) {
      throw validationError('Working-hours preventive plans require intervalHours');
    }
    if (payload.runtimeHours === undefined || payload.runtimeHours === null) {
      throw validationError('Working-hours preventive plans require runtimeHours');
    }
    data.intervalHours = preventiveHours(payload.intervalHours, 'Preventive plan intervalHours');
    data.runtimeHours = preventiveHours(payload.runtimeHours, 'Preventive plan runtimeHours', { allowZero: true });
  }

  return data;
}

export function validatePreventivePlanFilters(query = {}) {
  const filters = {};
  if (query.machineId !== undefined && query.machineId !== '') {
    filters.machineId = positiveInteger(query.machineId, 'machineId');
  }
  if (query.assignedTo !== undefined && query.assignedTo !== '') {
    filters.assignedTo = positiveInteger(query.assignedTo, 'assignedTo');
  }
  return filters;
}

export function validatePreventiveRuntimePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw validationError('Preventive runtime request body must be a JSON object');
  }
  return {
    runtimeHours: preventiveHours(
      payload.runtimeHours,
      'Preventive runtimeHours',
      { allowZero: true },
    ),
  };
}

export function validatePreventiveCompletionPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw validationError('Preventive completion request body must be a JSON object');
  }
  if (!isNonEmptyString(payload.occurrenceKey)) {
    throw validationError('Preventive completion occurrenceKey is required and must be a non-empty string');
  }
  const occurrenceKey = payload.occurrenceKey.trim();
  if (occurrenceKey.length < 8 || occurrenceKey.length > 100) {
    throw validationError('Preventive completion occurrenceKey must be 8 to 100 characters');
  }
  if (!Array.isArray(payload.checklistResults) || payload.checklistResults.length === 0) {
    throw validationError('Preventive completion checklistResults must contain at least one item');
  }

  const checklistResults = payload.checklistResults.map((result, index) => {
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
      throw validationError(`Preventive completion result ${index + 1} must be a JSON object`);
    }
    if (result.completed !== true) {
      throw validationError(`Preventive completion result ${index + 1} must have completed=true`);
    }

    let measurementValue = null;
    if (result.measurementValue !== undefined && result.measurementValue !== null) {
      if (typeof result.measurementValue === 'string' && !result.measurementValue.trim()) {
        measurementValue = null;
      } else {
        const parsed = typeof result.measurementValue === 'number'
          ? result.measurementValue
          : Number(result.measurementValue);
        if (!Number.isFinite(parsed)) {
          throw validationError(`Preventive completion result ${index + 1} measurementValue must be a number`);
        }
        measurementValue = parsed;
      }
    }

    return {
      itemId: positiveInteger(result.itemId, `Preventive completion result ${index + 1} itemId`),
      completed: true,
      measurementValue,
      note: preventiveText(
        result.note,
        `Preventive completion result ${index + 1} note`,
        { maxLength: 2000 },
      ),
    };
  });

  const data = {
    occurrenceKey,
    checklistResults,
    notes: preventiveText(payload.notes, 'Preventive completion notes', { maxLength: 4000 }),
  };

  if (payload.runtimeHours !== undefined && payload.runtimeHours !== null) {
    data.runtimeHours = preventiveHours(
      payload.runtimeHours,
      'Preventive completion runtimeHours',
    );
  }

  return data;
}
