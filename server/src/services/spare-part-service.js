import { transaction } from '../db.js';
import { ApiError, notFound } from '../errors.js';
import {
  countActiveStockUsagesForPart,
  countCriticalSpareParts,
  deleteSparePartById as deleteSparePartRecord,
  findSparePartByCode,
  findSparePartById,
  insertSparePart,
  insertStockMovement,
  listSpareParts,
  listStockAlerts,
  listStockMovements,
  updateSparePart,
  incrementSparePartStock,
} from '../repositories/spare-parts.js';
import { createNotification } from './notification-service.js';
import {
  validateSparePartPayload,
  validateStockMovementPayload,
} from '../validators.js';

export async function getSparePartOrThrow(database, partId) {
  const part = await findSparePartById(database, partId);
  if (!part) throw notFound('Spare part not found', 'SPARE_PART_NOT_FOUND');
  return part;
}

export async function listSparePartCatalog(database, filters = {}) {
  return listSpareParts(database, filters);
}

export async function listCriticalStockAlerts(database) {
  const alerts = await listStockAlerts(database);
  return { alerts, count: alerts.length };
}

export async function getCriticalStockCount(database) {
  return countCriticalSpareParts(database);
}

export async function listStockMovementHistory(database, filters = {}) {
  return listStockMovements(database, filters);
}

export async function createSparePart(database, payload, user) {
  const data = validateSparePartPayload(payload);
  const timestamp = new Date().toISOString();

  return transaction(database, async () => {
    const existing = await findSparePartByCode(database, data.code);
    if (existing) {
      throw new ApiError(409, 'A spare part with this code already exists', 'SPARE_PART_CODE_DUPLICATE');
    }

    const part = await insertSparePart(database, {
      ...data,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    if (part.currentStock <= part.minimumStock) {
      await createNotification(database, {
        type: 'critical_stock',
        title: `${part.code} kritik stok seviyesinde`,
        message: `${part.name} stokta ${part.currentStock} ${part.unit} ile minimum ${part.minimumStock} ${part.unit} eşiğinde veya altında.`,
        severity: 'warning',
        createdAt: timestamp,
      });
    }

    if (part.currentStock > 0) {
      await insertStockMovement(database, {
        partId: part.id,
        partCode: part.code,
        partName: part.name,
        movementType: 'in',
        quantity: part.currentStock,
        unitCost: part.unitCost,
        userId: user.id,
        note: 'Katalog açılış stoğu',
        createdAt: timestamp,
      });
    }

    return part;
  });
}

export async function updateSparePartById(database, partId, payload, user) {
  const data = validateSparePartPayload(payload, { partial: true });
  const timestamp = new Date().toISOString();

  return transaction(database, async () => {
    const part = await getSparePartOrThrow(database, partId);
    if (data.code && data.code !== part.code) {
      const existing = await findSparePartByCode(database, data.code);
      if (existing) {
        throw new ApiError(409, 'A spare part with this code already exists', 'SPARE_PART_CODE_DUPLICATE');
      }
    }

    let stockDelta = 0;
    if (data.currentStock !== undefined && data.currentStock !== part.currentStock) {
      stockDelta = data.currentStock - part.currentStock;
    }

    const updated = await updateSparePart(database, part.id, data);
    const wasCritical = part.currentStock <= part.minimumStock;
    const isCritical = updated.currentStock <= updated.minimumStock;
    if (isCritical && !wasCritical) {
      await createNotification(database, {
        type: 'critical_stock',
        title: `${updated.code} kritik stok seviyesine düştü`,
        message: `${updated.name} stokta ${updated.currentStock} ${updated.unit} kaldı; minimum seviye ${updated.minimumStock} ${updated.unit}.`,
        severity: 'warning',
        createdAt: timestamp,
      });
    }
    if (stockDelta !== 0) {
      await insertStockMovement(database, {
        partId: updated.id,
        partCode: updated.code,
        partName: updated.name,
        movementType: stockDelta > 0 ? 'in' : 'out',
        quantity: Math.abs(stockDelta),
        unitCost: updated.unitCost,
        userId: user.id,
        note: 'Katalog stok düzeltmesi',
        createdAt: timestamp,
      });
    }
    return updated;
  });
}

export async function deleteSparePartById(database, partId) {
  return transaction(database, async () => {
    const part = await getSparePartOrThrow(database, partId);
    const activeUsageCount = await countActiveStockUsagesForPart(database, part.id);
    if (activeUsageCount > 0) {
      throw new ApiError(
        409,
        'This spare part is still used by an open work order or preventive plan',
        'SPARE_PART_IN_USE',
        { activeUsageCount },
      );
    }
    await deleteSparePartRecord(database, part.id);
    return { deleted: true, id: part.id };
  });
}

export async function addStockToSparePart(database, partId, payload, user) {
  const data = validateStockMovementPayload(payload);
  const timestamp = new Date().toISOString();

  return transaction(database, async () => {
    const part = await getSparePartOrThrow(database, partId);
    await incrementSparePartStock(database, part.id, data.quantity, timestamp);
    const updatedPart = await findSparePartById(database, part.id);
    const movement = await insertStockMovement(database, {
      partId: part.id,
      partCode: part.code,
      partName: part.name,
      movementType: 'in',
      quantity: data.quantity,
      unitCost: part.unitCost,
      userId: user.id,
      note: data.note || 'Stok girişi / satın alma',
      createdAt: timestamp,
    });
    return { part: updatedPart, movement };
  });
}
