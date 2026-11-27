import { transaction } from '../db.js';
import { ApiError, notFound } from '../errors.js';
import {
  calculateUsageTotalCost,
  decrementSparePartStock,
  findActiveUsageByPartAndPreventivePlan,
  findActiveUsageByPartAndWorkOrder,
  findSparePartById,
  findStockUsageById,
  incrementSparePartStock,
  insertStockMovement,
  insertStockUsage,
  listStockUsages,
  markStockUsageReturned,
  updateStockUsageQuantity,
} from '../repositories/spare-parts.js';
import { getPreventivePlanOrThrow } from './preventive-plan-service.js';
import { getWorkOrderOrThrow } from './work-order-service.js';
import { createNotification } from './notification-service.js';
import {
  validateStockQuantityPayload,
  validateStockUsagePayload,
} from '../validators.js';

const FINAL_WORK_ORDER_STATUSES = new Set(['resolved', 'closed']);

async function notifyIfStockBecameCritical(database, before, timestamp) {
  const after = await findSparePartById(database, before.id);
  if (!after) return;
  const crossedCriticalLevel = before.currentStock > before.minimumStock
    && after.currentStock <= after.minimumStock;
  if (!crossedCriticalLevel) return;
  await createNotification(database, {
    type: 'critical_stock',
    title: `${after.code} kritik stok seviyesine düştü`,
    message: `${after.name} stokta ${after.currentStock} ${after.unit} kaldı; minimum seviye ${after.minimumStock} ${after.unit}.`,
    severity: 'warning',
    createdAt: timestamp,
  });
}

async function resolveWorkOrderContext(database, workOrderId, user) {
  const workOrder = await getWorkOrderOrThrow(database, workOrderId, user);
  if (FINAL_WORK_ORDER_STATUSES.has(workOrder.status)) {
    throw new ApiError(
      409,
      'Parts can only be changed on an open work order',
      'WORK_ORDER_NOT_OPEN',
    );
  }
  return {
    kind: 'work_order',
    record: workOrder,
    workOrderId: workOrder.id,
    preventivePlanId: null,
    code: workOrder.code,
    label: `${workOrder.code} iş emri`,
  };
}

async function resolvePreventiveContext(database, planId, user) {
  const plan = await getPreventivePlanOrThrow(database, planId, user);
  return {
    kind: 'preventive_plan',
    record: plan,
    workOrderId: null,
    preventivePlanId: plan.id,
    code: plan.code,
    label: `${plan.code} periyodik bakım planı`,
  };
}

async function resolveContext(database, kind, id, user) {
  if (kind === 'work_order') return resolveWorkOrderContext(database, id, user);
  if (kind === 'preventive_plan') return resolvePreventiveContext(database, id, user);
  throw new TypeError(`Unsupported stock-usage context: ${kind}`);
}

function assertUsageMatchesContext(usage, context) {
  if (!usage) throw notFound('Stock usage not found', 'STOCK_USAGE_NOT_FOUND');
  if (context.kind === 'work_order' && usage.workOrderId !== context.workOrderId) {
    throw notFound('Stock usage not found in this work order', 'STOCK_USAGE_NOT_FOUND');
  }
  if (context.kind === 'preventive_plan' && usage.preventivePlanId !== context.preventivePlanId) {
    throw notFound('Stock usage not found in this preventive plan', 'STOCK_USAGE_NOT_FOUND');
  }
  if (usage.returnedAt) {
    throw new ApiError(409, 'This stock usage has already been returned', 'STOCK_USAGE_RETURNED');
  }
}

export async function listContextParts(database, kind, id, user) {
  const context = await resolveContext(database, kind, id, user);
  const parts = await listStockUsages(database, {
    workOrderId: context.workOrderId,
    preventivePlanId: context.preventivePlanId,
  });
  const totalCost = await calculateUsageTotalCost(database, {
    workOrderId: context.workOrderId,
    preventivePlanId: context.preventivePlanId,
  });
  return { parts, totalCost };
}

export async function addContextPart(database, kind, id, payload, user) {
  const data = validateStockUsagePayload(payload);
  const timestamp = new Date().toISOString();

  return transaction(database, async () => {
    const context = await resolveContext(database, kind, id, user);
    const part = await findSparePartById(database, data.partId);
    if (!part) throw notFound('Spare part not found', 'SPARE_PART_NOT_FOUND');

    const decremented = await decrementSparePartStock(
      database,
      part.id,
      data.quantity,
      timestamp,
    );
    if (!decremented) {
      throw new ApiError(
        409,
        `Insufficient stock for ${part.code}`,
        'INSUFFICIENT_STOCK',
        {
          partId: part.id,
          available: part.currentStock,
          requested: data.quantity,
        },
      );
    }
    await notifyIfStockBecameCritical(database, part, timestamp);

    const existingUsage = context.kind === 'work_order'
      ? await findActiveUsageByPartAndWorkOrder(database, part.id, context.workOrderId)
      : await findActiveUsageByPartAndPreventivePlan(
        database,
        part.id,
        context.preventivePlanId,
      );
    const usage = existingUsage
      ? await updateStockUsageQuantity(
        database,
        existingUsage.id,
        existingUsage.quantity + data.quantity,
        (
          (existingUsage.quantity * existingUsage.unitCost)
          + (data.quantity * part.unitCost)
        ) / (existingUsage.quantity + data.quantity),
      )
      : await insertStockUsage(database, {
        partId: part.id,
        workOrderId: context.workOrderId,
        preventivePlanId: context.preventivePlanId,
        quantity: data.quantity,
        unitCost: part.unitCost,
        createdBy: user.id,
        createdAt: timestamp,
      });

    await insertStockMovement(database, {
      partId: part.id,
      partCode: part.code,
      partName: part.name,
      movementType: 'out',
      quantity: data.quantity,
      unitCost: part.unitCost,
      userId: user.id,
      workOrderId: context.workOrderId,
      preventivePlanId: context.preventivePlanId,
      usageId: usage.id,
      note: `${context.label} parça kullanımı`,
      createdAt: timestamp,
    });

    const totalCost = await calculateUsageTotalCost(database, {
      workOrderId: context.workOrderId,
      preventivePlanId: context.preventivePlanId,
    });
    return { usage, totalCost };
  });
}

export async function updateContextPart(database, kind, id, usageId, payload, user) {
  const data = validateStockQuantityPayload(payload);
  const timestamp = new Date().toISOString();

  return transaction(database, async () => {
    const context = await resolveContext(database, kind, id, user);
    const usage = await findStockUsageById(database, usageId);
    assertUsageMatchesContext(usage, context);

    const part = await findSparePartById(database, usage.partId);
    if (!part) throw notFound('Spare part not found', 'SPARE_PART_NOT_FOUND');

    const delta = data.quantity - usage.quantity;
    if (delta > 0) {
      const decremented = await decrementSparePartStock(
        database,
        part.id,
        delta,
        timestamp,
      );
      if (!decremented) {
        throw new ApiError(
          409,
          `Insufficient stock for ${part.code}`,
          'INSUFFICIENT_STOCK',
          {
            partId: part.id,
            available: part.currentStock,
            requested: delta,
          },
        );
      }
      await notifyIfStockBecameCritical(database, part, timestamp);
    } else if (delta < 0) {
      await incrementSparePartStock(database, part.id, Math.abs(delta), timestamp);
    }

    const updatedUsage = await updateStockUsageQuantity(
      database,
      usage.id,
      data.quantity,
    );
    if (delta !== 0) {
      await insertStockMovement(database, {
        partId: part.id,
        partCode: part.code,
        partName: part.name,
        movementType: delta > 0 ? 'out' : 'return',
        quantity: Math.abs(delta),
        unitCost: usage.unitCost,
        userId: user.id,
        workOrderId: context.workOrderId,
        preventivePlanId: context.preventivePlanId,
        usageId: usage.id,
        note: `${context.label} parça miktarı düzeltmesi`,
        createdAt: timestamp,
      });
    }

    const totalCost = await calculateUsageTotalCost(database, {
      workOrderId: context.workOrderId,
      preventivePlanId: context.preventivePlanId,
    });
    return { usage: updatedUsage, totalCost };
  });
}

export async function removeContextPart(database, kind, id, usageId, user) {
  const timestamp = new Date().toISOString();

  return transaction(database, async () => {
    const context = await resolveContext(database, kind, id, user);
    const usage = await findStockUsageById(database, usageId);
    assertUsageMatchesContext(usage, context);

    const part = await findSparePartById(database, usage.partId);
    if (!part) throw notFound('Spare part not found', 'SPARE_PART_NOT_FOUND');

    await incrementSparePartStock(database, part.id, usage.quantity, timestamp);
    await markStockUsageReturned(database, usage.id, {
      returnedAt: timestamp,
      returnedBy: user.id,
      returnedQuantity: usage.quantity,
    });
    await insertStockMovement(database, {
      partId: part.id,
      partCode: part.code,
      partName: part.name,
      movementType: 'return',
      quantity: usage.quantity,
      unitCost: usage.unitCost,
      userId: user.id,
      workOrderId: context.workOrderId,
      preventivePlanId: context.preventivePlanId,
      usageId: usage.id,
      note: `${context.label} parça iadesi`,
      createdAt: timestamp,
    });

    const totalCost = await calculateUsageTotalCost(database, {
      workOrderId: context.workOrderId,
      preventivePlanId: context.preventivePlanId,
    });
    return { deleted: true, id: usage.id, totalCost };
  });
}
