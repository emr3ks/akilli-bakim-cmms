import { all, get, run } from '../db.js';

const SPARE_PART_SELECT = `
  SELECT
    p.id,
    p.code,
    p.name,
    p.category,
    p.compatible_machine,
    p.unit,
    p.current_stock,
    p.minimum_stock,
    p.location,
    p.unit_cost,
    p.created_at,
    p.updated_at,
    CASE
      WHEN p.current_stock <= 0 THEN 'depleted'
      WHEN p.current_stock <= p.minimum_stock THEN 'critical'
      ELSE 'sufficient'
    END AS stock_status
  FROM spare_parts p
`;

const STOCK_MOVEMENT_SELECT = `
  SELECT
    m.id,
    m.part_id,
    m.part_code,
    m.part_name,
    m.movement_type,
    m.quantity,
    m.unit_cost,
    m.user_id,
    m.work_order_id,
    m.preventive_plan_id,
    m.usage_id,
    m.note,
    m.created_at,
    u.name AS user_name,
    u.initials AS user_initials
  FROM stock_movements m
  JOIN users u ON u.id = m.user_id
`;

const STOCK_USAGE_SELECT = `
  SELECT
    su.id,
    su.part_id,
    su.work_order_id,
    su.preventive_plan_id,
    su.quantity,
    su.unit_cost,
    su.created_by,
    su.created_at,
    su.returned_at,
    su.returned_by,
    su.returned_quantity,
    p.code AS part_code,
    p.name AS part_name,
    p.category AS part_category,
    p.compatible_machine,
    p.unit,
    p.current_stock,
    p.minimum_stock,
    p.location,
    p.unit_cost AS part_current_unit_cost,
    creator.name AS creator_name,
    creator.initials AS creator_initials,
    returner.name AS returner_name,
    returner.initials AS returner_initials
  FROM stock_usages su
  JOIN spare_parts p ON p.id = su.part_id
  JOIN users creator ON creator.id = su.created_by
  LEFT JOIN users returner ON returner.id = su.returned_by
`;

export function stockStatusFor(stock, minimumStock) {
  if (stock <= 0) return 'depleted';
  if (stock <= minimumStock) return 'critical';
  return 'sufficient';
}

export function mapSparePart(row) {
  if (!row) return null;
  const stockStatus = row.stock_status ?? stockStatusFor(row.current_stock, row.minimum_stock);
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    category: row.category,
    compatibility: row.compatible_machine,
    compatibleMachine: row.compatible_machine,
    unit: row.unit,
    currentStock: Number(row.current_stock),
    minimumStock: Number(row.minimum_stock),
    location: row.location,
    unitCost: Number(row.unit_cost),
    stockStatus,
    status: stockStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapStockMovement(row) {
  if (!row) return null;
  return {
    id: row.id,
    partId: row.part_id ?? null,
    partCode: row.part_code,
    partName: row.part_name,
    movementType: row.movement_type,
    type: row.movement_type,
    quantity: row.quantity,
    unitCost: row.unit_cost,
    totalCost: row.quantity * row.unit_cost,
    userId: row.user_id,
    user: {
      id: row.user_id,
      name: row.user_name,
      initials: row.user_initials,
    },
    createdById: row.user_id,
    createdAt: row.created_at,
    date: row.created_at.slice(0, 10),
    workOrderId: row.work_order_id ?? null,
    preventivePlanId: row.preventive_plan_id ?? null,
    usageId: row.usage_id ?? null,
    note: row.note ?? null,
  };
}

export function mapStockUsage(row) {
  if (!row) return null;
  const part = {
    id: row.part_id,
    code: row.part_code,
    name: row.part_name,
    category: row.part_category,
    compatibility: row.compatible_machine,
    compatibleMachine: row.compatible_machine,
    unit: row.unit,
    currentStock: Number(row.current_stock),
    minimumStock: Number(row.minimum_stock),
    location: row.location,
    unitCost: Number(row.part_current_unit_cost),
    status: stockStatusFor(row.current_stock, row.minimum_stock),
  };
  return {
    id: row.id,
    partId: row.part_id,
    part,
    partCode: row.part_code,
    partName: row.part_name,
    category: row.part_category,
    compatibility: row.compatible_machine,
    compatibleMachine: row.compatible_machine,
    unit: row.unit,
    quantity: Number(row.quantity),
    unitCost: Number(row.unit_cost),
    totalCost: Number(row.quantity) * Number(row.unit_cost),
    status: row.returned_at ? 'returned' : 'active',
    workOrderId: row.work_order_id ?? null,
    preventivePlanId: row.preventive_plan_id ?? null,
    createdBy: row.created_by,
    createdById: row.created_by,
    createdByUser: {
      id: row.created_by,
      name: row.creator_name,
      initials: row.creator_initials,
    },
    createdAt: row.created_at,
    returnedAt: row.returned_at ?? null,
    returnedBy: row.returned_by ?? null,
    returnedById: row.returned_by ?? null,
    returnedByUser: row.returned_by
      ? {
          id: row.returned_by,
          name: row.returner_name,
          initials: row.returner_initials,
        }
      : null,
    returnedQuantity: row.returned_quantity ?? null,
  };
}

export async function listSpareParts(database, filters = {}) {
  const clauses = [];
  const params = [];

  if (filters.q) {
    const search = `%${filters.q}%`;
    clauses.push(`(
      p.code LIKE ?
      OR p.name LIKE ?
      OR p.category LIKE ?
      OR p.compatible_machine LIKE ?
    )`);
    params.push(search, search, search, search);
  }
  if (filters.code) {
    clauses.push('p.code LIKE ?');
    params.push(`%${filters.code}%`);
  }
  if (filters.name) {
    clauses.push('p.name LIKE ?');
    params.push(`%${filters.name}%`);
  }
  if (filters.category) {
    clauses.push('p.category = ?');
    params.push(filters.category);
  }
  const statusFilter = filters.status || filters.stockStatus;
  if (statusFilter) {
    if (statusFilter === 'depleted') {
      clauses.push('p.current_stock <= 0');
    } else if (statusFilter === 'critical') {
      clauses.push('p.current_stock > 0 AND p.current_stock <= p.minimum_stock');
    } else {
      clauses.push('p.current_stock > p.minimum_stock');
    }
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = await all(
    database,
    `${SPARE_PART_SELECT} ${where} ORDER BY p.code ASC, p.id ASC`,
    params,
  );
  return rows.map(mapSparePart);
}

export async function findSparePartById(database, partId) {
  const parsedId = Number(partId);
  if (!Number.isInteger(parsedId) || parsedId < 1) return null;
  const row = await get(database, `${SPARE_PART_SELECT} WHERE p.id = ?`, [parsedId]);
  return mapSparePart(row);
}

export async function findSparePartByCode(database, code) {
  const row = await get(database, `${SPARE_PART_SELECT} WHERE p.code = ?`, [code]);
  return mapSparePart(row);
}

export async function insertSparePart(database, data) {
  const timestamp = data.createdAt || new Date().toISOString();
  const result = await run(
    database,
    `INSERT INTO spare_parts
      (code, name, category, compatible_machine, unit, current_stock, minimum_stock,
       location, unit_cost, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.code,
      data.name,
      data.category,
      data.compatibleMachine ?? data.compatibility,
      data.unit,
      data.currentStock ?? 0,
      data.minimumStock ?? 0,
      data.location,
      data.unitCost ?? 0,
      timestamp,
      data.updatedAt || timestamp,
    ],
  );
  return findSparePartById(database, result.lastID);
}

export async function updateSparePart(database, partId, data) {
  const columnMap = {
    code: 'code',
    name: 'name',
    category: 'category',
    compatibleMachine: 'compatible_machine',
    compatibility: 'compatible_machine',
    unit: 'unit',
    currentStock: 'current_stock',
    minimumStock: 'minimum_stock',
    location: 'location',
    unitCost: 'unit_cost',
  };
  const updates = [];
  const params = [];

  for (const [field, column] of Object.entries(columnMap)) {
    if (Object.prototype.hasOwnProperty.call(data, field)) {
      updates.push(`${column} = ?`);
      params.push(data[field]);
    }
  }
  if (!updates.length) return findSparePartById(database, partId);

  updates.push('updated_at = ?');
  params.push(data.updatedAt || new Date().toISOString());
  params.push(partId);
  await run(database, `UPDATE spare_parts SET ${updates.join(', ')} WHERE id = ?`, params);
  return findSparePartById(database, partId);
}

export async function deleteSparePart(database, partId) {
  const result = await run(database, 'DELETE FROM spare_parts WHERE id = ?', [partId]);
  return result.changes > 0;
}

export async function incrementSparePartStock(database, partId, quantity, timestamp) {
  const result = await run(
    database,
    `UPDATE spare_parts
     SET current_stock = current_stock + ?, updated_at = ?
     WHERE id = ?`,
    [quantity, timestamp, partId],
  );
  return result.changes > 0;
}

export async function decrementSparePartStock(database, partId, quantity, timestamp) {
  const result = await run(
    database,
    `UPDATE spare_parts
     SET current_stock = current_stock - ?, updated_at = ?
     WHERE id = ? AND current_stock >= ?`,
    [quantity, timestamp, partId, quantity],
  );
  return result.changes > 0;
}

export async function setSparePartStock(database, partId, quantity, timestamp) {
  const result = await run(
    database,
    `UPDATE spare_parts SET current_stock = ?, updated_at = ? WHERE id = ?`,
    [quantity, timestamp, partId],
  );
  return result.changes > 0;
}

export async function listStockAlerts(database) {
  const rows = await all(
    database,
    `${SPARE_PART_SELECT}
     WHERE p.current_stock <= p.minimum_stock
     ORDER BY CASE
       WHEN p.current_stock <= 0 THEN 0
       ELSE 1
     END ASC, p.code ASC`,
  );
  return rows.map((row) => {
    const part = mapSparePart(row);
    return {
      ...part,
      shortage: Math.max(part.minimumStock - part.currentStock, 0),
    };
  });
}

export async function countStockAlerts(database) {
  const row = await get(
    database,
    'SELECT COUNT(*) AS count FROM spare_parts WHERE current_stock <= minimum_stock',
  );
  return Number(row?.count || 0);
}

export async function countActiveStockUsagesForPart(database, partId) {
  const row = await get(
    database,
    'SELECT COUNT(*) AS count FROM stock_usages WHERE part_id = ? AND returned_at IS NULL',
    [partId],
  );
  return Number(row?.count || 0);
}

export async function countActiveStockUsagesForMachine(database, machineId) {
  const row = await get(
    database,
    `SELECT COUNT(*) AS count
     FROM stock_usages su
     WHERE su.returned_at IS NULL
       AND (
         su.work_order_id IN (
           SELECT w.id
           FROM work_orders w
           JOIN faults f ON f.id = w.fault_id
           WHERE f.machine_id = ?
         )
         OR su.preventive_plan_id IN (
           SELECT p.id
           FROM maintenance_plans p
           WHERE p.machine_id = ?
         )
       )`,
    [machineId, machineId],
  );
  return Number(row?.count || 0);
}

export const countCriticalSpareParts = countStockAlerts;
export const deleteSparePartById = deleteSparePart;

export async function insertStockMovement(database, data) {
  const timestamp = data.createdAt || new Date().toISOString();
  const result = await run(
    database,
    `INSERT INTO stock_movements
      (part_id, part_code, part_name, movement_type, quantity, unit_cost, user_id,
       work_order_id, preventive_plan_id, usage_id, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.partId ?? null,
      data.partCode,
      data.partName,
      data.movementType,
      data.quantity,
      data.unitCost ?? 0,
      data.userId,
      data.workOrderId ?? null,
      data.preventivePlanId ?? null,
      data.usageId ?? null,
      data.note ?? null,
      timestamp,
    ],
  );
  return findStockMovementById(database, result.lastID);
}

export async function findStockMovementById(database, movementId) {
  const parsedId = Number(movementId);
  if (!Number.isInteger(parsedId) || parsedId < 1) return null;
  const row = await get(database, `${STOCK_MOVEMENT_SELECT} WHERE m.id = ?`, [parsedId]);
  return mapStockMovement(row);
}

export async function listStockMovements(database, filters = {}) {
  const clauses = [];
  const params = [];

  if (filters.partId) {
    clauses.push('m.part_id = ?');
    params.push(filters.partId);
  }
  if (filters.movementType) {
    clauses.push('m.movement_type = ?');
    params.push(filters.movementType);
  }
  if (filters.workOrderId) {
    clauses.push('m.work_order_id = ?');
    params.push(filters.workOrderId);
  }
  if (filters.preventivePlanId) {
    clauses.push('m.preventive_plan_id = ?');
    params.push(filters.preventivePlanId);
  }
  if (filters.userId) {
    clauses.push('m.user_id = ?');
    params.push(filters.userId);
  }
  if (filters.from) {
    clauses.push('m.created_at >= ?');
    params.push(filters.from);
  }
  if (filters.to) {
    clauses.push('m.created_at <= ?');
    params.push(filters.to);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = await all(
    database,
    `${STOCK_MOVEMENT_SELECT}
     ${where}
     ORDER BY m.created_at DESC, m.id DESC`,
    params,
  );
  return rows.map(mapStockMovement);
}

export async function listStockMovementsByPart(database, partId) {
  return listStockMovements(database, { partId });
}

export async function insertStockUsage(database, data) {
  const timestamp = data.createdAt || new Date().toISOString();
  const result = await run(
    database,
    `INSERT INTO stock_usages
      (part_id, work_order_id, preventive_plan_id, quantity, unit_cost, created_by,
       created_at, returned_at, returned_by, returned_quantity)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.partId,
      data.workOrderId ?? null,
      data.preventivePlanId ?? null,
      data.quantity,
      data.unitCost,
      data.createdBy,
      timestamp,
      data.returnedAt ?? null,
      data.returnedBy ?? null,
      data.returnedQuantity ?? null,
    ],
  );
  return findStockUsageById(database, result.lastID);
}

export async function findStockUsageById(database, usageId) {
  const parsedId = Number(usageId);
  if (!Number.isInteger(parsedId) || parsedId < 1) return null;
  const row = await get(database, `${STOCK_USAGE_SELECT} WHERE su.id = ?`, [parsedId]);
  return mapStockUsage(row);
}

export async function findActiveUsageByPartAndWorkOrder(database, partId, workOrderId) {
  const row = await get(
    database,
    `${STOCK_USAGE_SELECT}
     WHERE su.part_id = ? AND su.work_order_id = ? AND su.returned_at IS NULL`,
    [partId, workOrderId],
  );
  return mapStockUsage(row);
}

export async function findActiveUsageByPartAndPreventivePlan(database, partId, planId) {
  const row = await get(
    database,
    `${STOCK_USAGE_SELECT}
     WHERE su.part_id = ? AND su.preventive_plan_id = ? AND su.returned_at IS NULL`,
    [partId, planId],
  );
  return mapStockUsage(row);
}

export async function listWorkOrderStockUsages(database, workOrderId) {
  const rows = await all(
    database,
    `${STOCK_USAGE_SELECT}
     WHERE su.work_order_id = ? AND su.returned_at IS NULL
     ORDER BY su.created_at ASC, su.id ASC`,
    [workOrderId],
  );
  return rows.map(mapStockUsage);
}

export async function listPreventivePlanStockUsages(database, planId) {
  const rows = await all(
    database,
    `${STOCK_USAGE_SELECT}
     WHERE su.preventive_plan_id = ? AND su.returned_at IS NULL
     ORDER BY su.created_at ASC, su.id ASC`,
    [planId],
  );
  return rows.map(mapStockUsage);
}

export async function markStockUsageReturned(database, usageId, data) {
  const result = await run(
    database,
    `UPDATE stock_usages
     SET returned_at = ?, returned_by = ?, returned_quantity = ?
     WHERE id = ? AND returned_at IS NULL`,
    [data.returnedAt, data.returnedBy, data.returnedQuantity, usageId],
  );
  return result.changes > 0;
}

export async function listStockUsages(database, { workOrderId = null, preventivePlanId = null } = {}) {
  const clauses = ['su.returned_at IS NULL'];
  const params = [];
  if (workOrderId !== null) {
    clauses.push('su.work_order_id = ?');
    params.push(workOrderId);
  }
  if (preventivePlanId !== null) {
    clauses.push('su.preventive_plan_id = ?');
    params.push(preventivePlanId);
  }
  const rows = await all(
    database,
    `${STOCK_USAGE_SELECT}
     WHERE ${clauses.join(' AND ')}
     ORDER BY su.created_at DESC, su.id DESC`,
    params,
  );
  return rows.map(mapStockUsage);
}

export async function updateStockUsageQuantity(database, usageId, quantity, unitCost) {
  const updates = ['quantity = ?'];
  const params = [quantity];
  if (unitCost !== undefined) {
    updates.push('unit_cost = ?');
    params.push(unitCost);
  }
  params.push(usageId);
  await run(
    database,
    `UPDATE stock_usages
     SET ${updates.join(', ')}
     WHERE id = ? AND returned_at IS NULL`,
    params,
  );
  return findStockUsageById(database, usageId);
}

export async function calculateUsageTotalCost(database, { workOrderId = null, preventivePlanId = null } = {}) {
  const clauses = ['returned_at IS NULL'];
  const params = [];
  if (workOrderId !== null) {
    clauses.push('work_order_id = ?');
    params.push(workOrderId);
  }
  if (preventivePlanId !== null) {
    clauses.push('preventive_plan_id = ?');
    params.push(preventivePlanId);
  }
  const row = await get(
    database,
    `SELECT COALESCE(SUM(quantity * unit_cost), 0) AS total
     FROM stock_usages
     WHERE ${clauses.join(' AND ')}`,
    params,
  );
  return Number(row?.total || 0);
}

export function totalUsageCost(usages) {
  return usages
    .filter((usage) => usage.status === 'active')
    .reduce((total, usage) => total + usage.totalCost, 0);
}
