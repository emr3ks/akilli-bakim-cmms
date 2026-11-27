import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { closeDatabase, createDatabase, get } from '../src/db.js';
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

async function notificationCount(type) {
  const row = await get(
    database,
    'SELECT COUNT(*) AS count FROM notifications WHERE type = ?',
    [type],
  );
  return Number(row?.count || 0);
}

describe('Phase 6 predictive-maintenance API', () => {
  it('returns thresholds, latest telemetry, and active alerts for a machine', async () => {
    const response = await request(app).get('/api/machines/1/sensors').set(ADMIN);

    expect(response.status).toBe(200);
    expect(response.body.machine.code).toBe('MCH-2026-001');
    expect(response.body.thresholds).toHaveLength(4);
    expect(response.body.thresholds.map((threshold) => threshold.sensorType)).toEqual([
      'pressure',
      'runtime_hours',
      'temperature',
      'vibration',
    ]);
    expect(response.body.readings).toHaveLength(4);
    expect(response.body.alerts).toEqual([]);
    expect(response.body.thresholds.find(
      (threshold) => threshold.sensorType === 'temperature',
    )).toMatchObject({
      criticalThreshold: 85,
      comparison: 'gt',
      unit: '°C',
      enabled: true,
    });
  });

  it('reports predictive warning counts and filters machines by the derived warning state', async () => {
    const summary = await request(app).get('/api/dashboard/summary').set(ADMIN);
    expect(summary.status).toBe(200);
    expect(summary.body).toMatchObject({ maintenance: 1, warning: 1, total: 7 });

    const warningMachines = await request(app)
      .get('/api/machines')
      .query({ status: 'warning' })
      .set(ADMIN);
    expect(warningMachines.status).toBe(200);
    expect(warningMachines.body.machines.map((machine) => machine.code)).toEqual(['MCH-2026-006']);

    const maintenanceMachines = await request(app)
      .get('/api/machines')
      .query({ status: 'maintenance' })
      .set(ADMIN);
    expect(maintenanceMachines.body.machines.map((machine) => machine.code)).toEqual(['MCH-2026-002']);
  });

  it('keeps a warning machine editable by separating its derived and persisted status', async () => {
    const before = await request(app).get('/api/machines/6').set(ADMIN);
    expect(before.body.machine).toMatchObject({
      status: 'warning',
      persistedStatus: 'maintenance',
    });

    const updated = await request(app)
      .put('/api/machines/6')
      .set(ADMIN)
      .send({ name: 'Paletleme Konveyörü - Güncel', status: 'maintenance' });
    expect(updated.status).toBe(200);
    expect(updated.body.machine).toMatchObject({
      status: 'warning',
      persistedStatus: 'maintenance',
    });
  });

  it('creates one predictive fault, work order, alert, and notification on a threshold breach', async () => {
    const beforeWorkOrders = await get(database, 'SELECT COUNT(*) AS count FROM work_orders');
    const beforeNotifications = await notificationCount('sensor_threshold');

    const response = await request(app)
      .post('/api/machines/1/sensor-readings')
      .set(TECHNICIAN)
      .send({
        source: 'simulation',
        readings: [{ sensorType: 'temperature', value: 91 }],
      });

    expect(response.status).toBe(201);
    expect(response.body.readings).toHaveLength(1);
    expect(response.body.alerts).toHaveLength(1);
    expect(response.body.alerts[0]).toMatchObject({
      sensorType: 'temperature',
      value: 91,
      thresholdValue: 85,
      status: 'active',
    });
    expect(response.body.workOrder).toMatchObject({
      status: 'open',
      fault: {
        category: 'software_sensor',
        urgency: 'high',
      },
    });
    expect(response.body.machine.status).toBe('warning');
    expect(await notificationCount('sensor_threshold')).toBe(beforeNotifications + 1);

    const afterWorkOrders = await get(database, 'SELECT COUNT(*) AS count FROM work_orders');
    expect(Number(afterWorkOrders.count)).toBe(Number(beforeWorkOrders.count) + 1);
  });

  it('does not create a duplicate work order for a repeated breach of the same sensor', async () => {
    const first = await request(app)
      .post('/api/machines/1/sensor-readings')
      .set(ADMIN)
      .send({ readings: [{ sensorType: 'vibration', value: 5.2 }] });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post('/api/machines/1/sensor-readings')
      .set(ADMIN)
      .send({ readings: [{ sensorType: 'vibration', value: 5.4 }] });
    expect(second.status).toBe(201);

    const alert = await get(
      database,
      "SELECT COUNT(*) AS count FROM sensor_alerts WHERE machine_id = 1 AND sensor_type = 'vibration' AND status = 'active'",
    );
    const workOrder = await get(
      database,
      "SELECT COUNT(*) AS count FROM work_orders w JOIN faults f ON f.id = w.fault_id WHERE f.machine_id = 1 AND f.category = 'software_sensor'",
    );
    expect(Number(alert.count)).toBe(1);
    expect(Number(workOrder.count)).toBe(1);
    expect(second.body.workOrder).toBeNull();
  });

  it('keeps the warning until the predictive work order is resolved, then clears it automatically', async () => {
    const created = await request(app)
      .post('/api/machines/1/sensor-readings')
      .set(ADMIN)
      .send({ readings: [{ sensorType: 'pressure', value: 12 }] });
    expect(created.status).toBe(201);
    expect(created.body.machine.status).toBe('warning');
    const workOrderId = created.body.workOrder.id;

    const assigned = await request(app)
      .post(`/api/work-orders/${workOrderId}/assign`)
      .set(ADMIN)
      .send({ assignedTo: 2 });
    expect(assigned.status).toBe(200);

    const started = await request(app)
      .patch(`/api/work-orders/${workOrderId}/status`)
      .set(TECHNICIAN)
      .send({ status: 'in_progress' });
    expect(started.status).toBe(200);

    const completionPayload = {
      status: 'resolved',
      interventionNote: 'Sensör hattı yenilendi ve eşik ölçümü doğrulandı.',
      rootCause: 'Sensör bağlantısında temassızlık',
      durationMinutes: 30,
      solutionPhotoBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      solutionPhotoMimeType: 'image/png',
    };

    const stillBreaching = await request(app)
      .patch(`/api/work-orders/${workOrderId}/status`)
      .set(TECHNICIAN)
      .send(completionPayload);
    expect(stillBreaching.status).toBe(409);
    expect(stillBreaching.body.error.code).toBe('SENSOR_THRESHOLD_STILL_EXCEEDED');

    const correctedReading = await request(app)
      .post('/api/machines/1/sensor-readings')
      .set(TECHNICIAN)
      .send({ readings: [{ sensorType: 'pressure', value: 9 }] });
    expect(correctedReading.status).toBe(201);

    const resolved = await request(app)
      .patch(`/api/work-orders/${workOrderId}/status`)
      .set(TECHNICIAN)
      .send(completionPayload);
    expect(resolved.status).toBe(200);
    expect(resolved.body.workOrder.status).toBe('resolved');

    const sensors = await request(app).get('/api/machines/1/sensors').set(ADMIN);
    expect(sensors.body.alerts).toEqual([]);
    expect(sensors.body.machine.status).toBe('running');
  });

  it('does not create an alert for a disabled threshold', async () => {
    await request(app)
      .put('/api/machines/1/sensor-thresholds')
      .set(ADMIN)
      .send({
        thresholds: [{
          sensorType: 'temperature',
          unit: '°C',
          criticalThreshold: 85,
          comparison: 'gt',
          enabled: false,
        }],
      });

    const response = await request(app)
      .post('/api/machines/1/sensor-readings')
      .set(ADMIN)
      .send({ readings: [{ sensorType: 'temperature', value: 91 }] });
    expect(response.status).toBe(201);
    expect(response.body.alerts).toEqual([]);
    expect(response.body.machine.status).toBe('running');
  });

  it('allows only administrators to replace thresholds and validates reading payloads', async () => {
    const forbidden = await request(app)
      .put('/api/machines/1/sensor-thresholds')
      .set(TECHNICIAN)
      .send({ thresholds: [] });
    expect(forbidden.status).toBe(403);

    const invalid = await request(app)
      .post('/api/machines/1/sensor-readings')
      .set(ADMIN)
      .send({ readings: [{ sensorType: 'temperature', value: -1 }] });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR');

    const updated = await request(app)
      .put('/api/machines/1/sensor-thresholds')
      .set(ADMIN)
      .send({
        thresholds: [{
          sensorType: 'temperature',
          unit: '°C',
          criticalThreshold: 90,
          comparison: 'gte',
          enabled: true,
        }],
      });
    expect(updated.status).toBe(200);
    expect(updated.body.thresholds).toHaveLength(1);
    expect(updated.body.thresholds[0].criticalThreshold).toBe(90);
  });
});

describe('Phase 6 shift handover API', () => {
  it('seeds the last two handovers and auto-populates the operational snapshot', async () => {
    const response = await request(app).get('/api/shift-handovers').set(OPERATOR);

    expect(response.status).toBe(200);
    expect(response.body.handovers).toHaveLength(2);
    expect(response.body.handovers[0]).toMatchObject({
      code: 'DT-2026-002',
      shift: 'evening',
      approved: false,
      canApprove: false,
    });
    expect(response.body.handovers[1]).toMatchObject({
      code: 'DT-2026-001',
      shift: 'morning',
      approved: true,
    });

    const forbidden = await request(app)
      .post(`/api/shift-handovers/${response.body.handovers[0].id}/approve`)
      .set(OPERATOR);
    expect(forbidden.status).toBe(403);
  });

  it('creates a handover for an operator and requires a different person to approve it', async () => {
    const created = await request(app)
      .post('/api/shift-handovers')
      .set(ADMIN)
      .send({
        shift: 'evening',
        summary: 'Akşam vardiyası kritik arıza ve sensör uyarısı izleniyor.',
        notes: 'Gece vardiyası paketleme hattına müdahale öncesi enerji izolasyonu yapacak.',
      });

    expect(created.status).toBe(201);
    expect(created.body.handover.code).toBe('DT-2026-003');
    expect(created.body.handover.criticalFaults.some(
      (fault) => fault.code === 'ARZ-2026-001',
    )).toBe(true);
    expect(created.body.handover.attentionMachines.some(
      (machine) => machine.code === 'MCH-2026-006',
    )).toBe(true);

    const selfApproval = await request(app)
      .post(`/api/shift-handovers/${created.body.handover.id}/approve`)
      .set(ADMIN);
    expect(selfApproval.status).toBe(409);
    expect(selfApproval.body.error.code).toBe('SHIFT_HANDOVER_SELF_APPROVAL');

    const approved = await request(app)
      .post(`/api/shift-handovers/${created.body.handover.id}/approve`)
      .set(TECHNICIAN);
    expect(approved.status).toBe(200);
    expect(approved.body.handover.approved).toBe(true);
    expect(approved.body.handover.approvedByUser.name).toBe('Deniz Teknisyen');
  });

  it('rejects invalid shift values and empty summaries', async () => {
    const response = await request(app)
      .post('/api/shift-handovers')
      .set(ADMIN)
      .send({ shift: 'midday', summary: '' });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('Phase 6 notification center API', () => {
  it('returns per-user unread counts and marks every notification read for that user only', async () => {
    const adminBefore = await request(app).get('/api/notifications').set(ADMIN);
    expect(adminBefore.status).toBe(200);
    expect(adminBefore.body.notifications).toHaveLength(5);
    expect(adminBefore.body.unreadCount).toBe(5);

    const marked = await request(app).post('/api/notifications/read-all').set(ADMIN);
    expect(marked.status).toBe(200);
    expect(marked.body.unreadCount).toBe(0);

    const adminAfter = await request(app).get('/api/notifications').set(ADMIN);
    expect(adminAfter.body.unreadCount).toBe(0);
    expect(adminAfter.body.notifications.every((notification) => notification.isRead)).toBe(true);

    const technician = await request(app).get('/api/notifications').set(TECHNICIAN);
    expect(technician.body.unreadCount).toBe(5);
  });

  it('automatically notifies on a newly reported critical fault', async () => {
    const before = await notificationCount('critical_fault');
    const response = await request(app)
      .post('/api/machines/1/faults')
      .set(OPERATOR)
      .send({
        title: 'Test kritik arıza',
        category: 'electrical',
        urgency: 'critical',
        description: 'Kritik arıza bildirim akışını doğrular.',
      });

    expect(response.status).toBe(201);
    expect(await notificationCount('critical_fault')).toBe(before + 1);
    const notifications = await request(app).get('/api/notifications').set(ADMIN);
    expect(notifications.body.notifications.some(
      (notification) => notification.type === 'critical_fault'
        && notification.message.includes(response.body.fault.code),
    )).toBe(true);
  });

  it('automatically notifies when an open work order is assigned to a technician', async () => {
    const before = await notificationCount('work_order_assignment');
    const workOrderId = await idByCode('/api/work-orders', 'workOrders', 'IE-2026-001');
    const response = await request(app)
      .post(`/api/work-orders/${workOrderId}/assign`)
      .set(ADMIN)
      .send({ assignedTo: 2 });

    expect(response.status).toBe(200);
    expect(await notificationCount('work_order_assignment')).toBe(before + 1);
  });

  it('creates a fresh unread notification when stock crosses critical again after replenishment', async () => {
    await request(app).post('/api/notifications/read-all').set(ADMIN);
    const before = await notificationCount('critical_stock');
    const workOrderId = await idByCode('/api/work-orders', 'workOrders', 'IE-2026-001');
    const parts = await request(app).get('/api/spare-parts').set(ADMIN);
    const bearing = parts.body.parts.find((part) => part.code === 'YDK-2026-001');

    const firstCrossing = await request(app)
      .post(`/api/work-orders/${workOrderId}/parts`)
      .set(ADMIN)
      .send({ partId: bearing.id, quantity: 9 });
    expect(firstCrossing.status).toBe(201);
    await request(app).post('/api/notifications/read-all').set(ADMIN);

    const replenished = await request(app)
      .post(`/api/spare-parts/${bearing.id}/stock-movements`)
      .set(ADMIN)
      .send({ quantity: 9 });
    expect(replenished.status).toBe(201);

    const secondCrossing = await request(app)
      .post(`/api/work-orders/${workOrderId}/parts`)
      .set(ADMIN)
      .send({ partId: bearing.id, quantity: 9 });
    expect(secondCrossing.status).toBe(201);

    expect(await notificationCount('critical_stock')).toBe(before + 2);
    const notifications = await request(app).get('/api/notifications').set(ADMIN);
    expect(notifications.body.unreadCount).toBe(1);
  });

  it('automatically notifies when a catalog stock correction crosses the critical level', async () => {
    const before = await notificationCount('critical_stock');
    const parts = await request(app).get('/api/spare-parts').set(ADMIN);
    const bearing = parts.body.parts.find((part) => part.code === 'YDK-2026-001');

    const response = await request(app)
      .put(`/api/spare-parts/${bearing.id}`)
      .set(ADMIN)
      .send({ currentStock: 3 });

    expect(response.status).toBe(200);
    expect(await notificationCount('critical_stock')).toBe(before + 1);
  });

  it('automatically notifies when stock usage crosses the critical level', async () => {
    const before = await notificationCount('critical_stock');
    const workOrderId = await idByCode('/api/work-orders', 'workOrders', 'IE-2026-001');
    const parts = await request(app).get('/api/spare-parts').set(ADMIN);
    const bearing = parts.body.parts.find((part) => part.code === 'YDK-2026-001');

    const response = await request(app)
      .post(`/api/work-orders/${workOrderId}/parts`)
      .set(ADMIN)
      .send({ partId: bearing.id, quantity: 9 });

    expect(response.status).toBe(201);
    expect(await notificationCount('critical_stock')).toBe(before + 1);
    const notifications = await request(app).get('/api/notifications').set(ADMIN);
    expect(notifications.body.notifications.some(
      (notification) => notification.type === 'critical_stock'
        && notification.title.includes('YDK-2026-001'),
    )).toBe(true);
  });
});
