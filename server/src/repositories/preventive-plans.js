import { all, get, run } from '../db.js';
import { addUtcDays, dueStateForDate, todayPlantDate } from '../utils/date-only.js';

const PLAN_SELECT = `
  SELECT
    p.id,
    p.code,
    p.machine_id,
    p.name,
    p.frequency,
    p.assigned_to,
    p.next_due_date,
    p.next_due_runtime_hours,
    p.interval_hours,
    p.last_completed_at,
    p.created_by,
    p.created_at,
    p.updated_at,
    runtime.runtime_hours AS current_runtime_hours,
    m.code AS machine_code,
    m.name AS machine_name,
    m.line AS machine_line,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM sensor_alerts alert
        WHERE alert.machine_id = m.id AND alert.status = 'active'
      ) THEN 'warning'
      ELSE m.status
    END AS machine_status,
    technician.name AS technician_name,
    technician.initials AS technician_initials,
    (
      SELECT COUNT(*)
      FROM stock_usages su
      WHERE su.preventive_plan_id = p.id AND su.returned_at IS NULL
    ) AS spare_part_count,
    (
      SELECT COALESCE(SUM(su.quantity * su.unit_cost), 0)
      FROM stock_usages su
      WHERE su.preventive_plan_id = p.id AND su.returned_at IS NULL
    ) AS spare_part_cost
  FROM maintenance_plans p
  JOIN machines m ON m.id = p.machine_id
  LEFT JOIN users technician ON technician.id = p.assigned_to
  LEFT JOIN maintenance_runtime_readings runtime ON runtime.machine_id = p.machine_id
`;

const EXECUTION_SELECT = `
  SELECT
    e.id,
    e.code,
    e.plan_id,
    e.completed_by,
    e.completed_at,
    e.notes,
    e.runtime_hours,
    e.next_due_date,
    e.next_due_runtime_hours,
    technician.name AS technician_name,
    technician.initials AS technician_initials
  FROM maintenance_executions e
  JOIN users technician ON technician.id = e.completed_by
`;

const EXECUTION_ITEM_SELECT = `
  SELECT
    ei.id,
    ei.execution_id,
    ei.checklist_item_id,
    ei.title,
    ei.completed,
    ei.measurement_value,
    ei.note,
    c.position
  FROM maintenance_execution_items ei
  JOIN maintenance_checklist_items c ON c.id = ei.checklist_item_id
`;

function mapChecklistItem(row) {
  if (!row) return null;
  return {
    id: row.id,
    position: row.position,
    title: row.title,
    measurementLabel: row.measurement_label ?? null,
  };
}

export function mapPreventivePlan(row, checklistItems = []) {
  if (!row) return null;
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
    name: row.name,
    frequency: row.frequency,
    assignedToId: row.assigned_to ?? null,
    assignedTo: row.assigned_to
      ? {
          id: row.assigned_to,
          name: row.technician_name,
          initials: row.technician_initials,
        }
      : null,
    nextDueDate: row.next_due_date,
    nextDueRuntimeHours: row.next_due_runtime_hours ?? null,
    currentRuntimeHours: row.current_runtime_hours ?? null,
    intervalHours: row.interval_hours ?? null,
    checklistItems,
    dueState: dueStateForDate(row.next_due_date, {
      frequency: row.frequency,
      nextDueRuntimeHours: row.next_due_runtime_hours ?? null,
      currentRuntimeHours: row.current_runtime_hours ?? null,
    }),
    lastCompletedAt: row.last_completed_at ?? null,
    sparePartCount: Number(row.spare_part_count || 0),
    sparePartCost: Number(row.spare_part_cost || 0),
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapExecution(row, results = []) {
  if (!row) return null;
  const technician = {
    id: row.completed_by,
    name: row.technician_name,
    initials: row.technician_initials,
  };
  return {
    id: row.id,
    planId: row.plan_id,
    code: row.code,
    completedBy: row.completed_by,
    completedById: row.completed_by,
    completedByUser: technician,
    technician,
    completedAt: row.completed_at,
    notes: row.notes ?? null,
    runtimeHours: row.runtime_hours ?? null,
    nextDueDate: row.next_due_date,
    nextDueRuntimeHours: row.next_due_runtime_hours ?? null,
    results: results.map((result) => ({
      itemId: result.checklist_item_id,
      title: result.title,
      completed: Boolean(result.completed),
      measurementValue: result.measurement_value ?? null,
      note: result.note ?? null,
    })),
  };
}

export async function listChecklistItems(database, planId) {
  const rows = await all(
    database,
    `SELECT id, plan_id, position, title, measurement_label
     FROM maintenance_checklist_items
     WHERE plan_id = ?
     ORDER BY position ASC, id ASC`,
    [planId],
  );
  return rows.map(mapChecklistItem);
}

export async function listPreventivePlans(database, filters = {}) {
  const clauses = [];
  const params = [];

  if (filters.machineId) {
    clauses.push('p.machine_id = ?');
    params.push(filters.machineId);
  }
  if (filters.assignedTo) {
    clauses.push('p.assigned_to = ?');
    params.push(filters.assignedTo);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = await all(
    database,
    `${PLAN_SELECT}
     ${where}
     ORDER BY p.next_due_date ASC, p.id ASC`,
    params,
  );

  const plans = [];
  for (const row of rows) {
    const checklistItems = await listChecklistItems(database, row.id);
    plans.push(mapPreventivePlan(row, checklistItems));
  }
  return plans;
}

export async function findPreventivePlanById(database, planId) {
  const parsedId = Number(planId);
  if (!Number.isInteger(parsedId) || parsedId < 1) return null;
  const row = await get(database, `${PLAN_SELECT} WHERE p.id = ?`, [parsedId]);
  if (!row) return null;
  const checklistItems = await listChecklistItems(database, row.id);
  return mapPreventivePlan(row, checklistItems);
}

export async function insertPreventivePlan(database, data) {
  const timestamp = data.createdAt || new Date().toISOString();
  const result = await run(
    database,
    `INSERT INTO maintenance_plans
      (code, machine_id, name, frequency, assigned_to, next_due_date,
       next_due_runtime_hours, interval_hours, last_completed_at, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.code,
      data.machineId,
      data.name,
      data.frequency,
      data.assignedTo ?? null,
      data.nextDueDate,
      data.nextDueRuntimeHours ?? null,
      data.intervalHours ?? null,
      data.lastCompletedAt ?? null,
      data.createdBy,
      timestamp,
      data.updatedAt || timestamp,
    ],
  );
  return result.lastID;
}

export async function findMachineRuntime(database, machineId) {
  const row = await get(
    database,
    `SELECT machine_id, runtime_hours, reported_at, reported_by
     FROM maintenance_runtime_readings
     WHERE machine_id = ?`,
    [machineId],
  );
  return row
    ? {
        machineId: row.machine_id,
        runtimeHours: row.runtime_hours,
        reportedAt: row.reported_at,
        reportedById: row.reported_by ?? null,
      }
    : null;
}

export async function upsertMachineRuntime(database, data) {
  await run(
    database,
    `INSERT INTO maintenance_runtime_readings
      (machine_id, runtime_hours, reported_at, reported_by)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(machine_id) DO UPDATE SET
       runtime_hours = MAX(maintenance_runtime_readings.runtime_hours, excluded.runtime_hours),
       reported_at = CASE
         WHEN excluded.runtime_hours >= maintenance_runtime_readings.runtime_hours THEN excluded.reported_at
         ELSE maintenance_runtime_readings.reported_at
       END,
       reported_by = CASE
         WHEN excluded.runtime_hours >= maintenance_runtime_readings.runtime_hours THEN excluded.reported_by
         ELSE maintenance_runtime_readings.reported_by
       END`,
    [
      data.machineId,
      data.runtimeHours,
      data.reportedAt || new Date().toISOString(),
      data.reportedBy ?? null,
    ],
  );
}

export async function insertChecklistItem(database, data) {
  const result = await run(
    database,
    `INSERT INTO maintenance_checklist_items (plan_id, position, title, measurement_label)
     VALUES (?, ?, ?, ?)`,
    [data.planId, data.position, data.title, data.measurementLabel ?? null],
  );
  return result.lastID;
}

export async function updatePreventivePlanAfterCompletion(
  database,
  planId,
  data,
) {
  await run(
    database,
    `UPDATE maintenance_plans
     SET next_due_date = ?, next_due_runtime_hours = ?, interval_hours = ?,
         last_completed_at = ?, updated_at = ?
     WHERE id = ?`,
    [
      data.nextDueDate,
      data.nextDueRuntimeHours ?? null,
      data.intervalHours ?? null,
      data.completedAt,
      data.updatedAt || data.completedAt,
      planId,
    ],
  );
}

export async function nextExecutionCode(database, planCode) {
  const prefix = `${planCode}-H`;
  const row = await get(
    database,
    `SELECT MAX(CAST(SUBSTR(code, ?) AS INTEGER)) AS last_number
     FROM maintenance_executions
     WHERE code LIKE ?`,
    [prefix.length + 1, `${prefix}%`],
  );
  const nextNumber = Number(row?.last_number || 0) + 1;
  if (nextNumber > 999) {
    throw new Error(`Maintenance execution number capacity for plan ${planCode} has been reached`);
  }
  return `${prefix}${String(nextNumber).padStart(3, '0')}`;
}

export async function insertExecution(database, data) {
  const result = await run(
    database,
    `INSERT INTO maintenance_executions
      (code, plan_id, completed_by, completed_at, notes, runtime_hours,
       next_due_date, next_due_runtime_hours)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.code,
      data.planId,
      data.completedBy,
      data.completedAt,
      data.notes ?? null,
      data.runtimeHours ?? null,
      data.nextDueDate,
      data.nextDueRuntimeHours ?? null,
    ],
  );
  return result.lastID;
}

export async function insertExecutionItem(database, data) {
  const result = await run(
    database,
    `INSERT INTO maintenance_execution_items
      (execution_id, checklist_item_id, title, completed, measurement_value, note)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      data.executionId,
      data.itemId,
      data.title,
      data.completed ? 1 : 0,
      data.measurementValue ?? null,
      data.note ?? null,
    ],
  );
  return result.lastID;
}

export async function listExecutionItems(database, executionId) {
  return all(
    database,
    `${EXECUTION_ITEM_SELECT}
     WHERE ei.execution_id = ?
     ORDER BY c.position ASC, ei.id ASC`,
    [executionId],
  );
}

export async function findOccurrenceExecutionId(database, planId, occurrenceKey) {
  const row = await get(
    database,
    `SELECT execution_id
     FROM maintenance_occurrence_keys
     WHERE plan_id = ? AND occurrence_key = ?`,
    [planId, occurrenceKey],
  );
  return row?.execution_id ?? null;
}

export async function insertOccurrenceKey(database, data) {
  await run(
    database,
    `INSERT INTO maintenance_occurrence_keys
      (plan_id, occurrence_key, execution_id, created_at)
     VALUES (?, ?, ?, ?)`,
    [
      data.planId,
      data.occurrenceKey,
      data.executionId,
      data.createdAt || new Date().toISOString(),
    ],
  );
}

export async function findExecutionById(database, executionId) {
  const parsedId = Number(executionId);
  if (!Number.isInteger(parsedId) || parsedId < 1) return null;
  const row = await get(database, `${EXECUTION_SELECT} WHERE e.id = ?`, [parsedId]);
  if (!row) return null;
  const results = await listExecutionItems(database, row.id);
  return mapExecution(row, results);
}

export async function listExecutionsByPlanId(database, planId) {
  const rows = await all(
    database,
    `${EXECUTION_SELECT}
     WHERE e.plan_id = ?
     ORDER BY e.completed_at DESC, e.id DESC`,
    [planId],
  );
  const executions = [];
  for (const row of rows) {
    const results = await listExecutionItems(database, row.id);
    executions.push(mapExecution(row, results));
  }
  return executions;
}

export async function getPreventiveDueCounts(
  database,
  { assignedTo = null } = {},
  today = todayPlantDate(),
) {
  const upcomingLimit = addUtcDays(today, 7);
  const clauses = [];
  const params = [today, today, today, upcomingLimit];

  if (assignedTo !== null && assignedTo !== undefined) {
    clauses.push('p.assigned_to = ?');
    params.push(assignedTo);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const row = await get(
    database,
    `SELECT
       SUM(CASE
         WHEN p.frequency = 'working_hours'
           THEN CASE WHEN r.runtime_hours > p.next_due_runtime_hours THEN 1 ELSE 0 END
         WHEN p.next_due_date < ? THEN 1
         ELSE 0
       END) AS overdue,
       SUM(CASE
         WHEN p.frequency = 'working_hours'
           THEN CASE WHEN r.runtime_hours = p.next_due_runtime_hours THEN 1 ELSE 0 END
         WHEN p.next_due_date = ? THEN 1
         ELSE 0
       END) AS due,
       SUM(CASE
         WHEN p.frequency = 'working_hours'
           THEN CASE WHEN r.runtime_hours < p.next_due_runtime_hours THEN 1 ELSE 0 END
         WHEN p.next_due_date > ? AND p.next_due_date <= ? THEN 1
         ELSE 0
       END) AS upcoming
     FROM maintenance_plans p
     LEFT JOIN maintenance_runtime_readings r ON r.machine_id = p.machine_id
     ${where}`,
    params,
  );
  return {
    overduePreventive: Number(row?.overdue || 0),
    duePreventive: Number(row?.due || 0),
    upcomingPreventive: Number(row?.upcoming || 0),
  };
}
