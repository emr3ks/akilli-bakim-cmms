import { all } from '../db.js';

const FAULT_HISTORY_SELECT = `
  SELECT
    f.id,
    f.code,
    f.title,
    f.category,
    f.urgency,
    f.description,
    f.status,
    f.created_at,
    f.reported_by,
    reporter.name AS reporter_name,
    w.assigned_to AS work_order_assigned_to
  FROM faults f
  JOIN users reporter ON reporter.id = f.reported_by
  LEFT JOIN work_orders w ON w.fault_id = f.id
  WHERE f.machine_id = ?
  ORDER BY f.created_at DESC, f.id DESC
  LIMIT 1001
`;

const WORK_ORDER_HISTORY_SELECT = `
  SELECT
    w.id,
    w.code,
    w.status,
    w.intervention_note,
    w.root_cause,
    w.duration_minutes,
    w.assigned_to,
    w.closed_at,
    w.started_at,
    w.created_at,
    w.updated_at,
    w.fault_id,
    f.code AS fault_code,
    f.title AS fault_title,
    technician.name AS technician_name,
    COALESCE((
      SELECT SUM(su.quantity * su.unit_cost)
      FROM stock_usages su
      WHERE su.work_order_id = w.id AND su.returned_at IS NULL
    ), 0) AS part_cost
  FROM work_orders w
  JOIN faults f ON f.id = w.fault_id
  LEFT JOIN users technician ON technician.id = w.assigned_to
  WHERE f.machine_id = ?
  ORDER BY COALESCE(w.closed_at, w.updated_at) DESC, w.id DESC
  LIMIT 1001
`;

const EXECUTION_HISTORY_SELECT = `
  SELECT
    e.id,
    e.code,
    e.plan_id,
    e.completed_at,
    e.notes,
    e.runtime_hours,
    e.next_due_date,
    p.code AS plan_code,
    p.name AS plan_name,
    p.assigned_to AS plan_assigned_to,
    technician.name AS technician_name
  FROM maintenance_executions e
  JOIN maintenance_plans p ON p.id = e.plan_id
  JOIN users technician ON technician.id = e.completed_by
  WHERE p.machine_id = ?
  ORDER BY e.completed_at DESC, e.id DESC
  LIMIT 1001
`;

const EXECUTION_RESULT_SELECT = `
  SELECT
    ei.execution_id,
    ei.title,
    ei.measurement_value,
    ei.note
  FROM maintenance_execution_items ei
  JOIN maintenance_executions e ON e.id = ei.execution_id
  JOIN maintenance_plans p ON p.id = e.plan_id
  WHERE p.machine_id = ?
  ORDER BY ei.id ASC
  LIMIT 5001
`;

const PART_CHANGE_SELECT = `
  SELECT
    su.id,
    su.part_id,
    su.work_order_id,
    su.preventive_plan_id,
    su.quantity,
    su.unit_cost,
    (su.quantity * su.unit_cost) AS total_cost,
    su.created_at,
    su.returned_at,
    p.code AS part_code,
    p.name AS part_name,
    p.unit,
    w.code AS work_order_code,
    w.assigned_to AS work_order_assigned_to,
    plan.code AS preventive_plan_code,
    plan.assigned_to AS plan_assigned_to
  FROM stock_usages su
  JOIN spare_parts p ON p.id = su.part_id
  LEFT JOIN work_orders w ON w.id = su.work_order_id
  LEFT JOIN faults f ON f.id = w.fault_id
  LEFT JOIN maintenance_plans plan ON plan.id = su.preventive_plan_id
  WHERE (f.machine_id = ? OR plan.machine_id = ?)
  ORDER BY su.created_at DESC, su.id DESC
  LIMIT 1001
`;

const LEGACY_RECORD_SELECT = `
  SELECT id, type, description, severity, created_at
  FROM maintenance_records
  WHERE machine_id = ?
  ORDER BY created_at DESC, id DESC
  LIMIT 1001
`;

export async function listMachineMaintenanceHistory(database, machineId, user) {
  const [allFaults, allWorkOrders, allExecutions, allExecutionResults, allPartChanges, legacyRecords] = await Promise.all([
    all(database, FAULT_HISTORY_SELECT, [machineId]),
    all(database, WORK_ORDER_HISTORY_SELECT, [machineId]),
    all(database, EXECUTION_HISTORY_SELECT, [machineId]),
    all(database, EXECUTION_RESULT_SELECT, [machineId]),
    all(database, PART_CHANGE_SELECT, [machineId, machineId]),
    all(database, LEGACY_RECORD_SELECT, [machineId]),
  ]);

  const isAdmin = user?.role === 'admin';
  const faults = isAdmin
    ? allFaults
    : allFaults.filter((fault) => (
      fault.reported_by === user?.id || fault.work_order_assigned_to === user?.id
    ));
  const workOrders = isAdmin
    ? allWorkOrders
    : allWorkOrders.filter((workOrder) => workOrder.assigned_to === user?.id);
  const executions = isAdmin
    ? allExecutions
    : allExecutions.filter((execution) => execution.plan_assigned_to === user?.id);
  const executionResults = isAdmin
    ? allExecutionResults
    : allExecutionResults.filter((result) => executions.some((execution) => execution.id === result.execution_id));
  const partChanges = isAdmin
    ? allPartChanges
    : allPartChanges.filter((partChange) => (
      partChange.work_order_assigned_to === user?.id
      || partChange.plan_assigned_to === user?.id
    ));

  const resultsByExecution = new Map();
  for (const result of executionResults) {
    const results = resultsByExecution.get(result.execution_id) || [];
    results.push({
      title: result.title,
      completed: true,
      measurementValue: result.measurement_value ?? null,
      note: result.note ?? null,
    });
    resultsByExecution.set(result.execution_id, results);
  }

  const entries = [];

  for (const fault of faults) {
    entries.push({
      id: `fault-${fault.id}`,
      recordId: fault.id,
      type: 'fault',
      source: 'fault',
      occurredAt: fault.created_at,
      code: fault.code,
      title: fault.title,
      description: fault.description,
      status: fault.status,
      category: fault.category,
      urgency: fault.urgency,
      reportedBy: fault.reporter_name,
    });
  }

  for (const workOrder of workOrders) {
    entries.push({
      id: `work-order-${workOrder.id}`,
      recordId: workOrder.id,
      type: 'work_order',
      source: 'work_order',
      occurredAt: workOrder.closed_at || workOrder.started_at || workOrder.created_at,
      code: workOrder.code,
      title: workOrder.fault_title,
      description: workOrder.intervention_note,
      status: workOrder.status,
      faultId: workOrder.fault_id,
      faultCode: workOrder.fault_code,
      closedAt: workOrder.closed_at,
      rootCause: workOrder.root_cause,
      durationMinutes: workOrder.duration_minutes,
      technician: workOrder.technician_name,
      partCost: Number(workOrder.part_cost || 0),
    });
  }

  for (const execution of executions) {
    entries.push({
      id: `preventive-${execution.id}`,
      recordId: execution.id,
      type: 'preventive',
      source: 'maintenance_execution',
      contextType: 'preventive_execution',
      contextId: execution.id,
      occurredAt: execution.completed_at,
      code: execution.code,
      title: execution.plan_name,
      description: execution.notes,
      status: 'completed',
      planCode: execution.plan_code,
      technician: execution.technician_name,
      runtimeHours: execution.runtime_hours,
      nextDueDate: execution.next_due_date,
      results: resultsByExecution.get(execution.id) || [],
    });
  }

  for (const partChange of partChanges) {
    entries.push({
      id: `part-${partChange.id}`,
      recordId: partChange.id,
      type: 'part_change',
      source: 'stock_usage',
      occurredAt: partChange.created_at,
      code: partChange.part_code,
      title: partChange.part_name,
      description: partChange.preventive_plan_id
        ? `${partChange.quantity} ${partChange.unit} plan seviyesinde kullanıldı.`
        : `${partChange.quantity} ${partChange.unit} iş emri kapsamında kullanıldı.`,
      status: partChange.returned_at ? 'returned' : 'active',
      quantity: Number(partChange.quantity),
      unit: partChange.unit,
      unitCost: Number(partChange.unit_cost),
      originalCost: Number(partChange.total_cost || 0),
      partCost: partChange.returned_at ? 0 : Number(partChange.total_cost || 0),
      contextType: partChange.preventive_plan_id ? 'preventive_plan' : 'work_order',
      contextId: partChange.preventive_plan_id || partChange.work_order_id || null,
      contextCode: partChange.work_order_code || partChange.preventive_plan_code || null,
    });
  }

  for (const record of legacyRecords) {
    entries.push({
      id: `record-${record.id}`,
      recordId: record.id,
      type: 'maintenance_record',
      source: 'maintenance_record',
      occurredAt: record.created_at,
      code: null,
      title: record.type === 'fault' ? 'Arıza kaydı' : 'Bakım kaydı',
      description: record.description,
      status: 'recorded',
      severity: record.severity,
    });
  }

  entries.sort((left, right) => (
    String(right.occurredAt).localeCompare(String(left.occurredAt))
    || String(right.id).localeCompare(String(left.id))
  ));

  return entries;
}
