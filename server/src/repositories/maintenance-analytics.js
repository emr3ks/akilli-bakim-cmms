import { all } from '../db.js';

const MACHINE_ANALYTICS_SELECT = `
  SELECT id, code, name, line, brand, model, serial_number, criticality, status
  FROM machines
  ORDER BY code ASC
`;

const FAULT_ANALYTICS_SELECT = `
  SELECT id, code, machine_id, category, status, created_at
  FROM faults
  ORDER BY created_at ASC, id ASC
`;

const WORK_ORDER_ANALYTICS_SELECT = `
  SELECT
    w.id,
    w.code,
    w.fault_id,
    w.status,
    w.duration_minutes,
    w.closed_at,
    f.machine_id
  FROM work_orders w
  JOIN faults f ON f.id = w.fault_id
  ORDER BY COALESCE(w.closed_at, w.updated_at) ASC, w.id ASC
`;

const USAGE_COST_ANALYTICS_SELECT = `
  SELECT
    su.id,
    su.work_order_id,
    su.preventive_plan_id,
    su.quantity,
    su.unit_cost,
    (su.quantity * su.unit_cost) AS total_cost,
    COALESCE(f.machine_id, plan.machine_id) AS machine_id
  FROM stock_usages su
  LEFT JOIN work_orders w ON w.id = su.work_order_id
  LEFT JOIN faults f ON f.id = w.fault_id
  LEFT JOIN maintenance_plans plan ON plan.id = su.preventive_plan_id
  WHERE su.returned_at IS NULL
    AND (su.work_order_id IS NOT NULL OR su.preventive_plan_id IS NOT NULL)
  ORDER BY su.created_at ASC, su.id ASC
`;

export async function getMaintenanceAnalyticsData(database) {
  const machines = await all(database, MACHINE_ANALYTICS_SELECT);
  const faults = await all(database, FAULT_ANALYTICS_SELECT);
  const workOrders = await all(database, WORK_ORDER_ANALYTICS_SELECT);
  const usageCosts = await all(database, USAGE_COST_ANALYTICS_SELECT);

  return { machines, faults, workOrders, usageCosts };
}
