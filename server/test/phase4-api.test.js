import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { closeDatabase, createDatabase, run } from '../src/db.js';
import { seedDemoData } from '../src/seed.js';

const ADMIN = { 'x-user-id': '1' };
const TECHNICIAN = { 'x-user-id': '2' };
const OPERATOR = { 'x-user-id': '3' };

let database;
let app;

beforeEach(async () => {
  database = await createDatabase(':memory:');
  await seedDemoData(database);
  app = createApp({ db: database });
  await app.ready;
});

afterEach(async () => {
  await closeDatabase(database);
});

async function partByCode(code) {
  const response = await request(app).get('/api/spare-parts').set(ADMIN);
  expect(response.status).toBe(200);
  const part = response.body.parts.find((candidate) => candidate.code === code);
  if (!part) throw new Error(`Seeded spare part not found: ${code}`);
  return part;
}

async function recordIdByCode(path, code) {
  const response = await request(app).get(path).set(ADMIN);
  expect(response.status).toBe(200);
  const record = response.body[path.includes('work-orders') ? 'workOrders' : 'plans']
    .find((candidate) => candidate.code === code);
  if (!record) throw new Error(`Seeded record not found: ${code}`);
  return record.id;
}

const NEW_PART = {
  code: 'YDK-2026-009',
  name: 'Test rulman seti',
  category: 'bearing',
  compatibleMachine: 'Test makinesi',
  unit: 'set',
  currentStock: 5,
  minimumStock: 2,
  location: 'Z-09-01',
  unitCost: 1200.5,
};

describe('Phase 4 spare-part catalog API', () => {
  it('seeds eight realistic parts with critical, depleted, and sufficient stock states', async () => {
    const response = await request(app).get('/api/spare-parts').set(ADMIN);
    expect(response.status).toBe(200);
    expect(response.body.parts.length).toBeGreaterThanOrEqual(8);
    expect(new Set(response.body.parts.map((part) => part.code)).size)
      .toBe(response.body.parts.length);
    expect(response.body.parts.filter((part) => part.status === 'critical')).toHaveLength(1);
    expect(response.body.parts.filter((part) => part.status === 'depleted')).toHaveLength(1);
    expect(response.body.parts.filter((part) => part.status === 'sufficient').length)
      .toBeGreaterThanOrEqual(6);

    const alerts = await request(app).get('/api/stock-alerts').set(ADMIN);
    expect(alerts.status).toBe(200);
    expect(alerts.body.count).toBe(2);
    expect(alerts.body.alerts.map((part) => part.code)).toEqual(
      expect.arrayContaining(['YDK-2026-003', 'YDK-2026-004']),
    );

    const summary = await request(app).get('/api/dashboard/summary').set(ADMIN);
    expect(summary.body.criticalStockParts).toBe(2);
  });

  it('filters the catalog by code, name, category, and stock status', async () => {
    const byCode = await request(app)
      .get('/api/spare-parts')
      .query({ q: 'YDK-2026-002' })
      .set(ADMIN);
    expect(byCode.body.parts.map((part) => part.code)).toEqual(['YDK-2026-002']);

    const byExactCode = await request(app)
      .get('/api/spare-parts')
      .query({ code: 'YDK-2026-002' })
      .set(ADMIN);
    expect(byExactCode.body.parts.map((part) => part.code)).toEqual(['YDK-2026-002']);

    const byExactName = await request(app)
      .get('/api/spare-parts')
      .query({ name: 'Trapez' })
      .set(ADMIN);
    expect(byExactName.body.parts.map((part) => part.code)).toEqual(['YDK-2026-002']);

    const byName = await request(app)
      .get('/api/spare-parts')
      .query({ q: 'Rulman' })
      .set(ADMIN);
    expect(byName.body.parts.map((part) => part.code)).toContain('YDK-2026-001');

    const bySearchCategory = await request(app)
      .get('/api/spare-parts')
      .query({ q: 'hidraulic_pneumatic' })
      .set(ADMIN);
    expect(bySearchCategory.body.parts.every(
      (part) => part.category === 'hydraulic_pneumatic',
    )).toBe(true);

    const byCategory = await request(app)
      .get('/api/spare-parts')
      .query({ category: 'hydraulic_pneumatic' })
      .set(ADMIN);
    expect(byCategory.body.parts.every((part) => part.category === 'hydraulic_pneumatic'))
      .toBe(true);

    const critical = await request(app)
      .get('/api/spare-parts')
      .query({ status: 'critical' })
      .set(ADMIN);
    expect(critical.body.parts.map((part) => part.code)).toEqual(['YDK-2026-003']);

    const depleted = await request(app)
      .get('/api/spare-parts')
      .query({ status: 'depleted' })
      .set(ADMIN);
    expect(depleted.body.parts.map((part) => part.code)).toEqual(['YDK-2026-004']);

    const invalid = await request(app)
      .get('/api/spare-parts')
      .query({ status: 'unknown' })
      .set(ADMIN);
    expect(invalid.status).toBe(400);
  });

  it('supports admin CRUD, records stock entries, and denies non-admin mutations', async () => {
    const created = await request(app)
      .post('/api/spare-parts')
      .set(ADMIN)
      .send(NEW_PART);
    expect(created.status).toBe(201);
    expect(created.body.part).toMatchObject({
      ...NEW_PART,
      status: 'sufficient',
    });

    const detail = await request(app)
      .get(`/api/spare-parts/${created.body.part.id}`)
      .set(TECHNICIAN);
    expect(detail.status).toBe(200);
    expect(detail.body.part).toMatchObject({
      id: created.body.part.id,
      code: NEW_PART.code,
      name: NEW_PART.name,
    });

    const initialMovements = await request(app)
      .get('/api/stock-movements')
      .query({ partId: created.body.part.id })
      .set(ADMIN);
    expect(initialMovements.body.movements).toHaveLength(1);
    expect(initialMovements.body.movements[0]).toMatchObject({
      movementType: 'in',
      quantity: 5,
      user: { id: 1, name: 'Adın Yönetici' },
    });

    const updated = await request(app)
      .put(`/api/spare-parts/${created.body.part.id}`)
      .set(ADMIN)
      .send({ name: 'Güncellenmiş rulman seti', currentStock: 7 });
    expect(updated.status).toBe(200);
    expect(updated.body.part).toMatchObject({
      name: 'Güncellenmiş rulman seti',
      currentStock: 7,
    });

    const nameOnlyUpdate = await request(app)
      .put(`/api/spare-parts/${created.body.part.id}`)
      .set(ADMIN)
      .send({ name: 'Yalnızca adı güncellenen rulman seti' });
    expect(nameOnlyUpdate.status).toBe(200);
    expect(nameOnlyUpdate.body.part.currentStock).toBe(7);

    const adjustmentMovements = await request(app)
      .get('/api/stock-movements')
      .query({ partId: created.body.part.id })
      .set(ADMIN);
    expect(adjustmentMovements.body.movements).toHaveLength(2);
    expect(adjustmentMovements.body.movements[0]).toMatchObject({
      movementType: 'in',
      quantity: 2,
    });

    const denied = await request(app)
      .post('/api/spare-parts')
      .set(TECHNICIAN)
      .send(NEW_PART);
    expect(denied.status).toBe(403);

    const duplicate = await request(app)
      .post('/api/spare-parts')
      .set(ADMIN)
      .send(NEW_PART);
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('SPARE_PART_CODE_DUPLICATE');

    const invalid = await request(app)
      .post('/api/spare-parts')
      .set(ADMIN)
      .send({ ...NEW_PART, code: 'YDK-2026-010', category: 'unknown' });
    expect(invalid.status).toBe(400);

    const deleted = await request(app)
      .delete(`/api/spare-parts/${created.body.part.id}`)
      .set(ADMIN);
    expect(deleted.status).toBe(200);
    expect(deleted.body).toEqual({ deleted: true, id: created.body.part.id });
  });

  it('adds purchased stock and records it in the movement ledger', async () => {
    const part = await partByCode('YDK-2026-006');
    const response = await request(app)
      .post(`/api/spare-parts/${part.id}/stock-movements`)
      .set(ADMIN)
      .send({ quantity: 3, note: '2026-11 tedarikçi sevkiyatı' });
    expect(response.status).toBe(201);
    expect(response.body.part.currentStock).toBe(part.currentStock + 3);
    expect(response.body.movement).toMatchObject({
      movementType: 'in',
      quantity: 3,
      note: '2026-11 tedarikçi sevkiyatı',
      user: { id: 1 },
    });

    const denied = await request(app)
      .post(`/api/spare-parts/${part.id}/stock-movements`)
      .set(TECHNICIAN)
      .send({ quantity: 1 });
    expect(denied.status).toBe(403);
  });
});

describe('Phase 4 work-order and preventive-plan stock usage', () => {
  it('deducts stock, calculates cost, and blocks insufficient inventory', async () => {
    const workOrderId = await recordIdByCode('/api/work-orders', 'IE-2026-003');
    const initialWorkOrder = await request(app)
      .get(`/api/work-orders/${workOrderId}`)
      .set(TECHNICIAN);
    const initialCost = initialWorkOrder.body.workOrder.sparePartCost;
    const initialCount = initialWorkOrder.body.workOrder.sparePartCount;
    const part = await partByCode('YDK-2026-002');
    const expectedCost = part.unitCost * 2;
    const expectedTotalCost = initialCost + expectedCost;

    const added = await request(app)
      .post(`/api/work-orders/${workOrderId}/parts`)
      .set(TECHNICIAN)
      .send({ partId: part.id, quantity: 2 });
    expect(added.status).toBe(201);
    expect(added.body.usage).toMatchObject({
      partId: part.id,
      quantity: 2,
      unitCost: part.unitCost,
      totalCost: expectedCost,
    });
    expect(added.body.usage.part.code).toBe(part.code);
    expect(added.body.totalCost).toBe(expectedTotalCost);

    const catalog = await partByCode(part.code);
    expect(catalog.currentStock).toBe(part.currentStock - 2);

    const workOrder = await request(app)
      .get(`/api/work-orders/${workOrderId}`)
      .set(TECHNICIAN);
    expect(workOrder.body.workOrder).toMatchObject({
      sparePartCount: initialCount + 1,
      sparePartCost: expectedTotalCost,
    });

    const depleted = await partByCode('YDK-2026-004');
    const blocked = await request(app)
      .post(`/api/work-orders/${workOrderId}/parts`)
      .set(TECHNICIAN)
      .send({ partId: depleted.id, quantity: 1 });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect(blocked.body.error.details).toMatchObject({
      available: 0,
      requested: 1,
    });
    expect((await partByCode(depleted.code)).currentStock).toBe(0);

    const movements = await request(app)
      .get('/api/stock-movements')
      .query({ partId: part.id, movementType: 'out' })
      .set(ADMIN);
    expect(movements.body.movements.some((movement) => (
      movement.workOrderId === workOrderId && movement.quantity === 2
    ))).toBe(true);
  });

  it('uses a weighted cost when the same part is consumed again after a price change', async () => {
    const createdPart = await request(app)
      .post('/api/spare-parts')
      .set(ADMIN)
      .send({
        ...NEW_PART,
        code: 'YDK-2026-011',
        name: 'Maliyet değişim testi parçası',
        currentStock: 10,
        unitCost: 100,
      });
    expect(createdPart.status).toBe(201);

    const workOrderId = await recordIdByCode('/api/work-orders', 'IE-2026-002');
    const firstUsage = await request(app)
      .post(`/api/work-orders/${workOrderId}/parts`)
      .set(TECHNICIAN)
      .send({ partId: createdPart.body.part.id, quantity: 1 });
    expect(firstUsage.status).toBe(201);

    const priceUpdate = await request(app)
      .put(`/api/spare-parts/${createdPart.body.part.id}`)
      .set(ADMIN)
      .send({ unitCost: 200 });
    expect(priceUpdate.status).toBe(200);

    const mergedUsage = await request(app)
      .post(`/api/work-orders/${workOrderId}/parts`)
      .set(TECHNICIAN)
      .send({ partId: createdPart.body.part.id, quantity: 1 });
    expect(mergedUsage.status).toBe(201);
    expect(mergedUsage.body.usage).toMatchObject({
      quantity: 2,
      unitCost: 150,
      totalCost: 300,
    });

    const movements = await request(app)
      .get('/api/stock-movements')
      .query({ partId: createdPart.body.part.id, movementType: 'out' })
      .set(ADMIN);
    expect(movements.body.movements).toHaveLength(2);
    expect(movements.body.movements.reduce(
      (total, movement) => total + movement.totalCost,
      0,
    )).toBe(300);
  });

  it('updates a usage quantity with matching stock and movement changes', async () => {
    const workOrderId = await recordIdByCode('/api/work-orders', 'IE-2026-003');
    const part = await partByCode('YDK-2026-002');

    const added = await request(app)
      .post(`/api/work-orders/${workOrderId}/parts`)
      .set(TECHNICIAN)
      .send({ partId: part.id, quantity: 2 });
    const usageId = added.body.usage.id;

    const increased = await request(app)
      .put(`/api/work-orders/${workOrderId}/parts/${usageId}`)
      .set(TECHNICIAN)
      .send({ quantity: 3 });
    expect(increased.status).toBe(200);
    expect(increased.body.usage.quantity).toBe(3);
    expect((await partByCode(part.code)).currentStock).toBe(part.currentStock - 3);

    const decreased = await request(app)
      .put(`/api/work-orders/${workOrderId}/parts/${usageId}`)
      .set(TECHNICIAN)
      .send({ quantity: 1 });
    expect(decreased.status).toBe(200);
    expect(decreased.body.usage.quantity).toBe(1);
    expect((await partByCode(part.code)).currentStock).toBe(part.currentStock - 1);
  });

  it('returns stock and records a return movement when a usage is removed', async () => {
    const workOrderId = await recordIdByCode('/api/work-orders', 'IE-2026-003');
    const initialUsage = await request(app)
      .get(`/api/work-orders/${workOrderId}/parts`)
      .set(TECHNICIAN);
    const initialPartCount = initialUsage.body.parts.length;
    const initialTotalCost = initialUsage.body.totalCost;
    const part = await partByCode('YDK-2026-002');
    const added = await request(app)
      .post(`/api/work-orders/${workOrderId}/parts`)
      .set(TECHNICIAN)
      .send({ partId: part.id, quantity: 2 });

    const removed = await request(app)
      .delete(`/api/work-orders/${workOrderId}/parts/${added.body.usage.id}`)
      .set(TECHNICIAN);
    expect(removed.status).toBe(200);
    expect(removed.body).toMatchObject({ deleted: true, id: added.body.usage.id });
    expect((await partByCode(part.code)).currentStock).toBe(part.currentStock);

    const usageList = await request(app)
      .get(`/api/work-orders/${workOrderId}/parts`)
      .set(TECHNICIAN);
    expect(usageList.body.parts).toHaveLength(initialPartCount);
    expect(usageList.body.parts.some((usage) => usage.id === added.body.usage.id)).toBe(false);
    expect(usageList.body.totalCost).toBe(initialTotalCost);

    const returns = await request(app)
      .get('/api/stock-movements')
      .query({ partId: part.id, movementType: 'return' })
      .set(ADMIN);
    expect(returns.body.movements.some((movement) => (
      movement.usageId === added.body.usage.id && movement.quantity === 2
    ))).toBe(true);
  });

  it('uses parts inside preventive maintenance plans with assignment permissions', async () => {
    const planId = await recordIdByCode('/api/preventive-plans', 'PB-2026-002');
    const part = await partByCode('YDK-2026-006');

    const added = await request(app)
      .post(`/api/preventive-plans/${planId}/parts`)
      .set(TECHNICIAN)
      .send({ partId: part.id, quantity: 1 });
    expect(added.status).toBe(201);
    expect(added.body.usage.part.code).toBe(part.code);
    expect(added.body.totalCost).toBe(part.unitCost);
    expect((await partByCode(part.code)).currentStock).toBe(part.currentStock - 1);

    const plan = await request(app)
      .get(`/api/preventive-plans/${planId}`)
      .set(TECHNICIAN);
    expect(plan.body.plan).toMatchObject({
      sparePartCount: 1,
      sparePartCost: part.unitCost,
    });

    const increased = await request(app)
      .put(`/api/preventive-plans/${planId}/parts/${added.body.usage.id}`)
      .set(TECHNICIAN)
      .send({ quantity: 2 });
    expect(increased.status).toBe(200);
    expect(increased.body.usage.quantity).toBe(2);
    expect((await partByCode(part.code)).currentStock).toBe(part.currentStock - 2);

    const removed = await request(app)
      .delete(`/api/preventive-plans/${planId}/parts/${added.body.usage.id}`)
      .set(TECHNICIAN);
    expect(removed.status).toBe(200);
    expect(removed.body.totalCost).toBe(0);
    expect((await partByCode(part.code)).currentStock).toBe(part.currentStock);

    const operator = await request(app)
      .post(`/api/preventive-plans/${planId}/parts`)
      .set(OPERATOR)
      .send({ partId: part.id, quantity: 1 });
    expect(operator.status).toBe(403);

    await run(
      database,
      "INSERT INTO users (id, name, email, role, initials) VALUES (4, 'Başka Teknisyen', 'other.tech@example.com', 'technician', 'BT')",
    );
    const otherTechnician = { 'x-user-id': '4' };
    const forbidden = await request(app)
      .post(`/api/preventive-plans/${planId}/parts`)
      .set(otherTechnician)
      .send({ partId: part.id, quantity: 1 });
    expect(forbidden.status).toBe(403);
  });

  it('blocks machine deletion while descendant records still consume stock', async () => {
    const part = await partByCode('YDK-2026-007');
    const planId = await recordIdByCode('/api/preventive-plans', 'PB-2026-003');
    const beforeUsage = await request(app)
      .get(`/api/preventive-plans/${planId}/parts`)
      .set(TECHNICIAN);
    expect(beforeUsage.body.parts.some((usage) => usage.partId === part.id)).toBe(true);

    const blocked = await request(app)
      .delete('/api/machines/3')
      .set(ADMIN);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('MACHINE_HAS_STOCK_USAGES');
    expect((await partByCode(part.code)).currentStock).toBe(part.currentStock);

    const afterUsage = await request(app)
      .get(`/api/preventive-plans/${planId}/parts`)
      .set(TECHNICIAN);
    expect(afterUsage.body.parts.some((usage) => usage.partId === part.id)).toBe(true);
  });

  it('prevents changes on final work orders and deletion of actively used parts', async () => {
    const closedWorkOrderId = await recordIdByCode('/api/work-orders', 'IE-2026-005');
    const part = await partByCode('YDK-2026-002');
    const blocked = await request(app)
      .post(`/api/work-orders/${closedWorkOrderId}/parts`)
      .set(TECHNICIAN)
      .send({ partId: part.id, quantity: 1 });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('WORK_ORDER_NOT_OPEN');

    const activePart = await partByCode('YDK-2026-001');
    const deleteBlocked = await request(app)
      .delete(`/api/spare-parts/${activePart.id}`)
      .set(ADMIN);
    expect(deleteBlocked.status).toBe(409);
    expect(deleteBlocked.body.error.code).toBe('SPARE_PART_IN_USE');
  });

  it('returns the complete movement ledger beyond 500 records', async () => {
    const part = await partByCode('YDK-2026-002');
    for (let index = 0; index < 501; index += 1) {
      await run(
        database,
        `INSERT INTO stock_movements
          (part_id, part_code, part_name, movement_type, quantity, unit_cost,
           user_id, work_order_id, preventive_plan_id, usage_id, note, created_at)
         VALUES (?, ?, ?, 'in', 1, ?, 1, NULL, NULL, NULL, ?, ?)`,
        [
          part.id,
          part.code,
          part.name,
          part.unitCost,
          `Arşiv hareketi ${index + 1}`,
          `2026-10-${String((index % 28) + 1).padStart(2, '0')}T08:00:00.000Z`,
        ],
      );
    }

    const response = await request(app)
      .get('/api/stock-movements')
      .query({ partId: part.id })
      .set(ADMIN);
    expect(response.status).toBe(200);
    expect(response.body.movements.length).toBeGreaterThanOrEqual(501);
  });

  it('exposes dated movement history with user, type, quantity, and context', async () => {
    const response = await request(app).get('/api/stock-movements').set(ADMIN);
    expect(response.status).toBe(200);
    expect(response.body.movements.length).toBeGreaterThanOrEqual(10);
    expect(new Set(response.body.movements.map((movement) => movement.movementType)))
      .toEqual(new Set(['in', 'out', 'return']));
    expect(response.body.movements.every((movement) => (
      movement.user?.name && movement.createdAt && movement.quantity > 0
    ))).toBe(true);
    expect(response.body.movements.some((movement) => (
      movement.movementType === 'return' && movement.workOrderId
    ))).toBe(true);
  });
});
