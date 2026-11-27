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

async function idByCode(path, collection, code) {
  const response = await request(app).get(path).set(ADMIN);
  expect(response.status).toBe(200);
  const record = response.body[collection].find((candidate) => candidate.code === code);
  if (!record) throw new Error(`Seeded record not found: ${code}`);
  return record.id;
}

describe('Phase 5 maintenance analytics API', () => {
  it('calculates facility and machine MTBF, MTTR, cost, Top 5 failures, and categories', async () => {
    const response = await request(app).get('/api/analytics/maintenance').set(ADMIN);

    expect(response.status).toBe(200);
    expect(response.body.analytics.summary).toMatchObject({
      machineCount: 7,
      failureCount: 8,
      closedWorkOrderCount: 4,
      totalInterventionMinutes: 270,
      mttrMinutes: 67.5,
      mttrHours: 1.13,
      workOrderSparePartCost: 3111.5,
      preventiveSparePartCost: 1912.1,
      totalSparePartCost: 5023.6,
    });
    expect(response.body.analytics.summary.mtbfHours).toBe(567.83);
    expect(response.body.analytics.summary.mtbfMinutes).toBe(34070);
    expect(response.body.analytics.topFailureMachines[0]).toMatchObject({
      machineCode: 'MCH-2026-003',
      failureCount: 4,
      closedWorkOrderCount: 4,
      mttrMinutes: 67.5,
    });
    expect(response.body.analytics.topFailureMachines[0].mtbfHours).toBeGreaterThan(0);
    expect(response.body.analytics.topFailureMachines.length).toBeLessThanOrEqual(5);
    expect(response.body.analytics.faultCategories.reduce(
      (total, category) => total + category.count,
      0,
    )).toBe(8);
    expect(Object.fromEntries(
      response.body.analytics.faultCategories.map((category) => [category.category, category.count]),
    )).toEqual({
      mechanical: 3,
      electrical: 2,
      software_sensor: 2,
      pneumatic_hydraulic: 1,
      other: 0,
    });
    expect(response.body.analytics.machineMetrics).toHaveLength(7);
  });

  it('excludes closed work orders without a recorded intervention duration', async () => {
    await run(
      database,
      "UPDATE work_orders SET duration_minutes = NULL WHERE code = 'IE-2026-008'",
    );

    const response = await request(app).get('/api/analytics/maintenance').set(ADMIN);

    expect(response.status).toBe(200);
    expect(response.body.analytics.summary).toMatchObject({
      failureCount: 8,
      closedWorkOrderCount: 3,
      totalInterventionMinutes: 210,
      mttrMinutes: 70,
    });
  });

  it('keeps management analytics restricted to maintenance managers', async () => {
    expect((await request(app).get('/api/analytics/maintenance').set(TECHNICIAN)).status).toBe(403);
    expect((await request(app).get('/api/analytics/maintenance').set(OPERATOR)).status).toBe(403);
  });
});

describe('Phase 5 machine maintenance history API', () => {
  it('returns faults, work orders, preventive executions, parts, and legacy records chronologically', async () => {
    await request(app)
      .post('/api/machines/1/maintenance-records')
      .set(ADMIN)
      .send({ type: 'maintenance', description: 'Geçmiş planlı bakım notu', severity: 'low' });

    const response = await request(app).get('/api/machines/1/maintenance-history').set(ADMIN);

    expect(response.status).toBe(200);
    expect(response.body.machine.code).toBe('MCH-2026-001');
    expect(response.body.entries.some((entry) => (
      entry.type === 'preventive' && entry.code === 'PB-2026-001-H001'
    ))).toBe(true);
    expect(response.body.entries.some((entry) => (
      entry.type === 'part_change' && entry.code === 'YDK-2026-005'
    ))).toBe(true);
    expect(response.body.entries.some((entry) => entry.type === 'maintenance_record')).toBe(true);

    const timestamps = response.body.entries.map((entry) => entry.occurredAt);
    expect(timestamps).toEqual([...timestamps].sort().reverse());
  });

  it('includes machine failure and repair chronology for a faulty machine', async () => {
    const response = await request(app).get('/api/machines/3/maintenance-history').set(TECHNICIAN);

    expect(response.status).toBe(200);
    expect(response.body.entries.filter((entry) => entry.type === 'fault')).toHaveLength(4);
    expect(response.body.entries.filter((entry) => entry.type === 'work_order')).toHaveLength(4);
    expect(response.body.entries.some((entry) => (
      entry.type === 'part_change' && entry.code === 'YDK-2026-007'
    ))).toBe(true);
  });

  it('does not expose another technician’s assigned work-order history', async () => {
    await run(
      database,
      "INSERT INTO users (id, name, email, role, initials) VALUES (4, 'Başka Teknisyen', 'other.tech@example.com', 'technician', 'BT')",
    );
    const faultResult = await run(
      database,
      `INSERT INTO faults
        (code, machine_id, title, category, urgency, description, status, reported_by, created_at, updated_at)
       VALUES ('ARZ-2026-099', 3, 'Atama kapsamı dışı arıza', 'mechanical', 'low', 'Test kaydı', 'resolved', 4, ?, ?)`,
      ['2026-11-21T08:00:00.000Z', '2026-11-21T08:00:00.000Z'],
    );
    await run(
      database,
      `INSERT INTO work_orders
        (code, fault_id, assigned_to, status, created_by, created_at, updated_at)
       VALUES ('IE-2026-099', ?, 4, 'closed', 1, ?, ?)`,
      [faultResult.lastID, '2026-11-21T08:10:00.000Z', '2026-11-21T08:10:00.000Z'],
    );

    const response = await request(app).get('/api/machines/3/maintenance-history').set(TECHNICIAN);

    expect(response.status).toBe(200);
    expect(response.body.entries.some((entry) => entry.code === 'ARZ-2026-099')).toBe(false);
    expect(response.body.entries.some((entry) => entry.code === 'IE-2026-099')).toBe(false);
  });

  it('does not expose work-order history to operators', async () => {
    expect((await request(app).get('/api/machines/1/maintenance-history').set(OPERATOR)).status).toBe(403);
  });
});

describe('Phase 5 service report endpoints', () => {
  it('builds a completed work-order report with machine, repair, cost, and duration data', async () => {
    const workOrderId = await idByCode('/api/work-orders', 'workOrders', 'IE-2026-005');
    const response = await request(app)
      .get(`/api/work-orders/${workOrderId}/service-report`)
      .set(ADMIN);

    expect(response.status).toBe(200);
    expect(response.body.report).toMatchObject({
      kind: 'work_order',
      documentCode: 'IE-2026-005',
      machine: {
        code: 'MCH-2026-003',
        brand: 'Atlas Copco',
        model: 'GA-90 VSD',
      },
      workOrder: {
        durationMinutes: 75,
        rootCause: 'Hareketli bağlantı noktasında kablo kopması',
      },
    });
    expect(response.body.report.parts).toEqual([]);
    expect(response.body.report.totals.partsCost).toBe(0);
  });

  it('keeps returned parts visible in history but excludes them from service-report cost', async () => {
    const workOrderId = await idByCode('/api/work-orders', 'workOrders', 'IE-2026-005');
    const parts = await request(app).get('/api/spare-parts').set(ADMIN);
    const part = parts.body.parts.find((candidate) => candidate.code === 'YDK-2026-001');
    await run(
      database,
      `INSERT INTO stock_usages
        (part_id, work_order_id, quantity, unit_cost, created_by, created_at,
         returned_at, returned_by, returned_quantity)
       VALUES (?, ?, 1, ?, 1, ?, ?, 1, 1)`,
      [
        part.id,
        workOrderId,
        part.unitCost,
        '2026-11-20T08:45:00.000Z',
        '2026-11-20T09:00:00.000Z',
      ],
    );

    const report = await request(app)
      .get(`/api/work-orders/${workOrderId}/service-report`)
      .set(ADMIN);
    expect(report.status).toBe(200);
    expect(report.body.report.parts).toEqual([]);
    expect(report.body.report.totals.partsCost).toBe(0);

    const history = await request(app).get('/api/machines/3/maintenance-history').set(ADMIN);
    const returnedPart = history.body.entries.find((entry) => (
      entry.type === 'part_change'
      && entry.code === 'YDK-2026-001'
      && entry.contextId === workOrderId
    ));
    expect(returnedPart).toMatchObject({
      status: 'returned',
      partCost: 0,
      originalCost: part.unitCost,
    });
  });

  it('blocks service reports for work orders that are not completed', async () => {
    const workOrderId = await idByCode('/api/work-orders', 'workOrders', 'IE-2026-002');
    const response = await request(app)
      .get(`/api/work-orders/${workOrderId}/service-report`)
      .set(ADMIN);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('WORK_ORDER_NOT_COMPLETED');
  });

  it('builds a preventive-maintenance report with checklist results and part cost', async () => {
    const planId = await idByCode('/api/preventive-plans', 'plans', 'PB-2026-001');
    const history = await request(app)
      .get(`/api/preventive-plans/${planId}/completions`)
      .set(TECHNICIAN);
    expect(history.status).toBe(200);
    expect(history.body.completions).toHaveLength(1);

    const response = await request(app)
      .get(`/api/preventive-plans/${planId}/completions/${history.body.completions[0].id}/service-report`)
      .set(TECHNICIAN);

    expect(response.status).toBe(200);
    expect(response.body.report).toMatchObject({
      kind: 'preventive',
      documentCode: 'PB-2026-001-H001',
      machine: {
        code: 'MCH-2026-001',
        brand: 'Haas',
      },
      preventive: {
        planCode: 'PB-2026-001',
        completionCode: 'PB-2026-001-H001',
      },
    });
    expect(response.body.report.preventive.results).toHaveLength(3);
    expect(response.body.report.parts[0]).toMatchObject({
      code: 'YDK-2026-005',
      quantity: 2,
      totalCost: 1280.5,
    });
    expect(response.body.report.totals.partsCost).toBe(1280.5);
  });
});
