import { all, get, run } from '../db.js';

const THRESHOLD_SELECT = `
  SELECT id, machine_id, sensor_type, unit, critical_threshold, comparison, enabled,
    created_at, updated_at
  FROM sensor_thresholds
`;

const READING_SELECT = `
  SELECT id, machine_id, sensor_type, value, unit, source, recorded_by, recorded_at
  FROM sensor_readings
`;

const ALERT_SELECT = `
  SELECT sa.id, sa.machine_id, sa.sensor_type, sa.value, sa.threshold_value,
    sa.unit, sa.comparison, sa.status, sa.fault_id, sa.work_order_id,
    sa.prior_machine_status, sa.created_by, sa.created_at,
    sa.resolved_by, sa.resolved_at, wo.code AS work_order_code
  FROM sensor_alerts sa
  LEFT JOIN work_orders wo ON wo.id = sa.work_order_id
`;

export function mapSensorThreshold(row) {
  if (!row) return null;
  return {
    id: row.id,
    machineId: row.machine_id,
    sensorType: row.sensor_type,
    unit: row.unit,
    criticalThreshold: Number(row.critical_threshold),
    comparison: row.comparison,
    enabled: Boolean(row.enabled),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapSensorReading(row) {
  if (!row) return null;
  return {
    id: row.id,
    machineId: row.machine_id,
    sensorType: row.sensor_type,
    value: Number(row.value),
    unit: row.unit,
    source: row.source ?? null,
    recordedBy: row.recorded_by,
    recordedAt: row.recorded_at,
  };
}

export function mapSensorAlert(row) {
  if (!row) return null;
  return {
    id: row.id,
    machineId: row.machine_id,
    sensorType: row.sensor_type,
    value: Number(row.value),
    thresholdValue: Number(row.threshold_value),
    unit: row.unit,
    comparison: row.comparison,
    status: row.status,
    faultId: row.fault_id,
    workOrderId: row.work_order_id,
    workOrderCode: row.work_order_code ?? null,
    priorMachineStatus: row.prior_machine_status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    resolvedBy: row.resolved_by ?? null,
    resolvedAt: row.resolved_at ?? null,
  };
}

export async function listSensorThresholds(database, machineId) {
  const rows = await all(
    database,
    `${THRESHOLD_SELECT} WHERE machine_id = ? ORDER BY sensor_type ASC`,
    [machineId],
  );
  return rows.map(mapSensorThreshold);
}

export async function findSensorThreshold(database, machineId, sensorType) {
  const row = await get(
    database,
    `${THRESHOLD_SELECT} WHERE machine_id = ? AND sensor_type = ?`,
    [machineId, sensorType],
  );
  return mapSensorThreshold(row);
}

export async function deleteSensorThresholds(database, machineId) {
  const result = await run(database, 'DELETE FROM sensor_thresholds WHERE machine_id = ?', [machineId]);
  return result.changes;
}

export async function insertSensorThreshold(database, data) {
  const timestamp = data.updatedAt || new Date().toISOString();
  const result = await run(
    database,
    `INSERT INTO sensor_thresholds
      (machine_id, sensor_type, unit, critical_threshold, comparison, enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.machineId,
      data.sensorType,
      data.unit,
      data.criticalThreshold,
      data.comparison,
      data.enabled ? 1 : 0,
      data.createdAt || timestamp,
      timestamp,
    ],
  );
  return mapSensorThreshold(await get(database, `${THRESHOLD_SELECT} WHERE id = ?`, [result.lastID]));
}

export async function insertSensorReading(database, data) {
  const result = await run(
    database,
    `INSERT INTO sensor_readings
      (machine_id, sensor_type, value, unit, source, recorded_by, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      data.machineId,
      data.sensorType,
      data.value,
      data.unit,
      data.source ?? null,
      data.recordedBy,
      data.recordedAt,
    ],
  );
  return mapSensorReading(await get(database, `${READING_SELECT} WHERE id = ?`, [result.lastID]));
}

/** Return only the most recent reading for each configured sensor type. */
export async function listLatestSensorReadings(database, machineId) {
  const rows = await all(
    database,
    `${READING_SELECT}
     WHERE machine_id = ?
     ORDER BY recorded_at DESC, id DESC`,
    [machineId],
  );
  const seen = new Set();
  const latest = [];
  for (const row of rows) {
    if (seen.has(row.sensor_type)) continue;
    seen.add(row.sensor_type);
    latest.push(mapSensorReading(row));
  }
  return latest;
}

export async function listActiveSensorAlerts(database, machineId) {
  const rows = await all(
    database,
    `${ALERT_SELECT}
     WHERE sa.machine_id = ? AND sa.status = 'active'
     ORDER BY sa.created_at DESC, sa.id DESC`,
    [machineId],
  );
  return rows.map(mapSensorAlert);
}

export async function findActiveSensorAlert(database, machineId, sensorType) {
  const row = await get(
    database,
    `${ALERT_SELECT}
     WHERE sa.machine_id = ? AND sa.sensor_type = ? AND sa.status = 'active'`,
    [machineId, sensorType],
  );
  return mapSensorAlert(row);
}

export async function findSensorAlertById(database, alertId) {
  const parsedId = Number(alertId);
  if (!Number.isInteger(parsedId) || parsedId < 1) return null;
  const row = await get(database, `${ALERT_SELECT} WHERE sa.id = ?`, [parsedId]);
  return mapSensorAlert(row);
}

export async function findSensorAlertByWorkOrderId(database, workOrderId) {
  const parsedId = Number(workOrderId);
  if (!Number.isInteger(parsedId) || parsedId < 1) return null;
  const row = await get(database, `${ALERT_SELECT} WHERE sa.work_order_id = ?`, [parsedId]);
  return mapSensorAlert(row);
}

export async function insertSensorAlert(database, data) {
  const result = await run(
    database,
    `INSERT INTO sensor_alerts
      (machine_id, sensor_type, value, threshold_value, unit, comparison, status,
       fault_id, work_order_id, prior_machine_status, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)`,
    [
      data.machineId,
      data.sensorType,
      data.value,
      data.thresholdValue,
      data.unit,
      data.comparison,
      data.faultId,
      data.workOrderId,
      data.priorMachineStatus,
      data.createdBy,
      data.createdAt,
    ],
  );
  return mapSensorAlert(await get(database, `${ALERT_SELECT} WHERE sa.id = ?`, [result.lastID]));
}

export async function resolveSensorAlert(database, alertId, data) {
  const result = await run(
    database,
    `UPDATE sensor_alerts
     SET status = 'resolved', resolved_by = ?, resolved_at = ?
     WHERE id = ? AND status = 'active'`,
    [data.resolvedBy, data.resolvedAt, alertId],
  );
  return result.changes > 0;
}

export async function countActiveSensorAlerts(database, machineId, excludedAlertId = null) {
  const row = excludedAlertId
    ? await get(
      database,
      "SELECT COUNT(*) AS count FROM sensor_alerts WHERE machine_id = ? AND status = 'active' AND id != ?",
      [machineId, excludedAlertId],
    )
    : await get(
      database,
      "SELECT COUNT(*) AS count FROM sensor_alerts WHERE machine_id = ? AND status = 'active'",
      [machineId],
    );
  return Number(row?.count || 0);
}
