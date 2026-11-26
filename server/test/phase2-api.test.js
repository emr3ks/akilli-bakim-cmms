import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { closeDatabase, createDatabase, run } from '../src/db.js';
import { seedDemoData } from '../src/seed.js';

const ADMIN = { 'x-user-id': '1' };
const TECHNICIAN = { 'x-user-id': '2' };
const OPERATOR = { 'x-user-id': '3' };
const PHOTO_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

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

async function createFault(overrides = {}) {
  return request(app)
    .post('/api/machines/1/faults')
    .set(OPERATOR)
    .send({
      title: 'CNC ekseni beklenmedik şekilde durdu',
      category: 'mechanical',
      urgency: 'high',
      description: 'Eksen hareketi sırasında ani durma ve titreşim oluştu.',
      ...overrides,
    });
}

const COMPLETION = {
  interventionNote: 'Parça değiştirildi ve saha doğrulaması tamamlandı.',
  rootCause: 'Parça yorulması',
  durationMinutes: 45,
  solutionPhotoBase64: PHOTO_BASE64,
  solutionPhotoMimeType: 'image/png',
};

async function createAssignedWorkOrder() {
  const fault = await createFault();
  const response = await request(app)
    .post('/api/work-orders')
    .set(ADMIN)
    .send({ faultId: fault.body.fault.id, assignedTo: 2 });
  expect(response.status).toBe(201);
  return response.body.workOrder.id;
}

async function advanceWorkOrderToInProgress() {
  const workOrderId = await createAssignedWorkOrder();
  const started = await request(app)
    .patch(`/api/work-orders/${workOrderId}/status`)
    .set(TECHNICIAN)
    .send({ status: 'in_progress' });
  expect(started.status).toBe(200);
  return workOrderId;
}

async function advanceWorkOrderToResolved() {
  const workOrderId = await advanceWorkOrderToInProgress();
  const resolved = await request(app)
    .patch(`/api/work-orders/${workOrderId}/status`)
    .set(TECHNICIAN)
    .send({ status: 'resolved', ...COMPLETION });
  expect(resolved.status).toBe(200);
  return workOrderId;
}

describe('Phase 2 fault reporting API', () => {
  it('creates a photo fault with an automatic code and persists it', async () => {
    const response = await createFault({
      urgency: 'critical',
      photoBase64: PHOTO_BASE64,
      photoMimeType: 'image/png',
    });

    expect(response.status).toBe(201);
    expect(response.body.fault).toMatchObject({
      machineId: 1,
      title: 'CNC ekseni beklenmedik şekilde durdu',
      category: 'mechanical',
      urgency: 'critical',
      status: 'open',
      photoBase64: PHOTO_BASE64,
      photoMimeType: 'image/png',
    });
    expect(response.body.fault.code).toMatch(/^ARZ-2026-\d{3}$/);
    expect(response.body.fault.reportedBy.id).toBe(3);
    expect(response.body.fault.createdBy).toBe(3);

    const detail = await request(app)
      .get(`/api/faults/${response.body.fault.id}`)
      .set(OPERATOR);
    expect(detail.status).toBe(200);
    expect(detail.body.fault).toMatchObject({
      id: response.body.fault.id,
      photoBase64: PHOTO_BASE64,
      photoMimeType: 'image/png',
    });

    const machine = await request(app).get('/api/machines/1').set(OPERATOR);
    expect(machine.body.machine.status).toBe('faulted');
  });

  it('keeps a non-critical machine state and validates fault fields', async () => {
    const response = await createFault({ urgency: 'medium' });
    expect(response.status).toBe(201);

    const machine = await request(app).get('/api/machines/1').set(OPERATOR);
    expect(machine.body.machine.status).toBe('running');

    const invalidCategory = await createFault({ category: 'unknown' });
    expect(invalidCategory.status).toBe(400);
    expect(invalidCategory.body.error.code).toBe('VALIDATION_ERROR');

    const missingTitle = await createFault({ title: ' ' });
    expect(missingTitle.status).toBe(400);

    const invalidPhoto = await createFault({
      photoBase64: PHOTO_BASE64,
      photoMimeType: 'application/pdf',
    });
    expect(invalidPhoto.status).toBe(400);

    const nonImage = await createFault({
      photoBase64: 'YQ==',
      photoMimeType: 'image/png',
    });
    expect(nonImage.status).toBe(400);

    const removedAlias = await createFault({
      photo: 'data:image/svg+xml;base64,PHN2Zy8+',
    });
    expect(removedAlias.status).toBe(400);
  });

  it('filters faults by open status, urgency, machine, and assigned technician', async () => {
    const open = await request(app).get('/api/faults').query({ status: 'open' }).set(ADMIN);
    expect(open.status).toBe(200);
    expect(open.body.faults).toHaveLength(4);
    expect(open.body.faults.every((fault) => fault.status === 'open')).toBe(true);

    const critical = await request(app)
      .get('/api/faults')
      .query({ urgency: 'critical' })
      .set(ADMIN);
    expect(critical.body.faults.map((fault) => fault.code)).toEqual(['ARZ-2026-001']);

    const assigned = await request(app)
      .get('/api/faults')
      .query({ assignedTo: 2 })
      .set(ADMIN);
    expect(assigned.body.faults.length).toBeGreaterThanOrEqual(3);
    expect(assigned.body.faults.every((fault) => fault.workOrder?.assignedTo === 2)).toBe(true);

    const combined = await request(app)
      .get('/api/faults')
      .query({ status: 'open', assignedTo: 2, urgency: 'medium' })
      .set(ADMIN);
    expect(combined.body.faults.map((fault) => fault.code)).toEqual(['ARZ-2026-003']);

    const invalid = await request(app)
      .get('/api/faults')
      .query({ urgency: 'urgent' })
      .set(ADMIN);
    expect(invalid.status).toBe(400);
  });
});

describe('Phase 2 work-order API', () => {
  it('creates, assigns, progresses, resolves, and closes a work order', async () => {
    const faultResponse = await createFault({ urgency: 'critical' });
    const faultId = faultResponse.body.fault.id;

    const created = await request(app)
      .post('/api/work-orders')
      .set(ADMIN)
      .send({ faultId });
    expect(created.status).toBe(201);
    expect(created.body.workOrder).toMatchObject({ faultId, status: 'open' });
    expect(created.body.workOrder.code).toMatch(/^IE-2026-\d{3}$/);

    const invalidJump = await request(app)
      .patch(`/api/work-orders/${created.body.workOrder.id}/status`)
      .set(TECHNICIAN)
      .send({ status: 'in_progress' });
    expect(invalidJump.status).toBe(409);
    expect(invalidJump.body.error.code).toBe('INVALID_STATUS_TRANSITION');

    const assigned = await request(app)
      .post(`/api/work-orders/${created.body.workOrder.id}/assign`)
      .set(ADMIN)
      .send({ assignedTo: 2 });
    expect(assigned.status).toBe(200);
    expect(assigned.body.workOrder).toMatchObject({ status: 'assigned', technicianId: 2 });
    expect(assigned.body.workOrder.assignedTo.id).toBe(2);

    const started = await request(app)
      .patch(`/api/work-orders/${created.body.workOrder.id}/status`)
      .set(TECHNICIAN)
      .send({ status: 'in_progress' });
    expect(started.status).toBe(200);
    expect(started.body.workOrder.status).toBe('in_progress');

    const waiting = await request(app)
      .patch(`/api/work-orders/${created.body.workOrder.id}/status`)
      .set(TECHNICIAN)
      .send({ status: 'waiting_parts' });
    expect(waiting.status).toBe(200);

    const resumed = await request(app)
      .patch(`/api/work-orders/${created.body.workOrder.id}/status`)
      .set(TECHNICIAN)
      .send({ status: 'in_progress' });
    expect(resumed.status).toBe(200);

    const missingClosure = await request(app)
      .patch(`/api/work-orders/${created.body.workOrder.id}/status`)
      .set(TECHNICIAN)
      .send({ status: 'resolved', interventionNote: 'Parça değiştirildi.' });
    expect(missingClosure.status).toBe(400);
    expect(missingClosure.body.error.code).toBe('VALIDATION_ERROR');

    const invalidDuration = await request(app)
      .patch(`/api/work-orders/${created.body.workOrder.id}/status`)
      .set(TECHNICIAN)
      .send({
        status: 'resolved',
        interventionNote: 'Parça değiştirildi.',
        rootCause: 'Rulman yorulması',
        durationMinutes: 0,
        solutionPhotoBase64: PHOTO_BASE64,
        solutionPhotoMimeType: 'image/png',
      });
    expect(invalidDuration.status).toBe(400);

    const resolved = await request(app)
      .patch(`/api/work-orders/${created.body.workOrder.id}/status`)
      .set(TECHNICIAN)
      .send({
        status: 'resolved',
        interventionNote: 'Arızalı rulman değiştirildi ve eksen hizalandı.',
        rootCause: 'Rulman yorulması',
        durationMinutes: 95,
        solutionPhotoBase64: PHOTO_BASE64,
        solutionPhotoMimeType: 'image/png',
      });
    expect(resolved.status).toBe(200);
    expect(resolved.body.workOrder).toMatchObject({
      status: 'resolved',
      rootCause: 'Rulman yorulması',
      durationMinutes: 95,
      solutionPhotoBase64: PHOTO_BASE64,
      solutionPhotoMimeType: 'image/png',
    });

    const faultBeforeClose = await request(app).get(`/api/faults/${faultId}`).set(TECHNICIAN);
    expect(faultBeforeClose.body.fault.status).toBe('open');
    const machineBeforeClose = await request(app).get('/api/machines/1').set(TECHNICIAN);
    expect(machineBeforeClose.body.machine.status).toBe('faulted');
    const summaryBeforeClose = await request(app).get('/api/dashboard/summary').set(ADMIN);
    expect(summaryBeforeClose.body).toMatchObject({ openFaults: 5, activeWorkOrders: 5 });

    const closed = await request(app)
      .patch(`/api/work-orders/${created.body.workOrder.id}/status`)
      .set(TECHNICIAN)
      .send({ status: 'closed' });
    expect(closed.status).toBe(200);
    expect(closed.body.workOrder.status).toBe('closed');
    expect(closed.body.workOrder.rootCause).toBe('Rulman yorulması');

    const fault = await request(app).get(`/api/faults/${faultId}`).set(TECHNICIAN);
    expect(fault.body.fault.status).toBe('resolved');

    const machine = await request(app).get('/api/machines/1').set(TECHNICIAN);
    expect(machine.body.machine.status).toBe('running');
    const summaryAfterClose = await request(app).get('/api/dashboard/summary').set(ADMIN);
    expect(summaryAfterClose.body).toMatchObject({ openFaults: 4, activeWorkOrders: 4 });
  });

  it('supports canonical fault creation and work-order detail endpoints', async () => {
    const faultResponse = await request(app)
      .post('/api/faults')
      .set(OPERATOR)
      .send({
        machineId: 1,
        title: 'Ana panel üzerinde sıcaklık alarmı',
        category: 'software_sensor',
        urgency: 'medium',
        description: 'PLC sıcaklık sensörü eşik değerini aştı.',
      });
    expect(faultResponse.status).toBe(201);

    const created = await request(app)
      .post(`/api/faults/${faultResponse.body.fault.id}/work-orders`)
      .set(ADMIN)
      .send({});
    expect(created.status).toBe(201);
    expect(created.body.workOrder.status).toBe('open');

    const assigned = await request(app)
      .patch(`/api/work-orders/${created.body.workOrder.id}/assign`)
      .set(ADMIN)
      .send({ technicianId: 2 });
    expect(assigned.status).toBe(200);
    expect(assigned.body.workOrder.technicianId).toBe(2);

    const detail = await request(app)
      .get(`/api/work-orders/${created.body.workOrder.id}`)
      .set(TECHNICIAN);
    expect(detail.status).toBe(200);
    expect(detail.body.workOrder.code).toBe(created.body.workOrder.code);
  });

  it('enforces manager, technician, assignment, and duplicate-work-order rules', async () => {
    const faultResponse = await createFault();
    const faultId = faultResponse.body.fault.id;

    const technicianCreate = await request(app)
      .post('/api/work-orders')
      .set(TECHNICIAN)
      .send({ faultId });
    expect(technicianCreate.status).toBe(403);

    const created = await request(app)
      .post('/api/work-orders')
      .set(ADMIN)
      .send({ faultId });
    expect(created.status).toBe(201);

    const duplicate = await request(app)
      .post('/api/work-orders')
      .set(ADMIN)
      .send({ faultId });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('WORK_ORDER_ALREADY_EXISTS');

    const nonTechnician = await request(app)
      .post(`/api/work-orders/${created.body.workOrder.id}/assign`)
      .set(ADMIN)
      .send({ assignedTo: 1 });
    expect(nonTechnician.status).toBe(400);
    expect(nonTechnician.body.error.code).toBe('TECHNICIAN_ROLE_REQUIRED');

    const unknownTechnician = await request(app)
      .post(`/api/work-orders/${created.body.workOrder.id}/assign`)
      .set(ADMIN)
      .send({ assignedTo: 999 });
    expect(unknownTechnician.status).toBe(404);
    expect(unknownTechnician.body.error.code).toBe('TECHNICIAN_NOT_FOUND');

    const assigned = await request(app)
      .post(`/api/work-orders/${created.body.workOrder.id}/assign`)
      .set(ADMIN)
      .send({ assignedTo: 2 });
    expect(assigned.status).toBe(200);

    const operatorUpdate = await request(app)
      .patch(`/api/work-orders/${created.body.workOrder.id}/status`)
      .set(OPERATOR)
      .send({ status: 'in_progress' });
    expect(operatorUpdate.status).toBe(403);
  });

  it('enforces role-based fault and work-order visibility', async () => {
    const adminFault = await request(app)
      .post('/api/faults')
      .set(ADMIN)
      .send({
        machineId: 1,
        title: 'Yönetici tarafından kaydedilen kontrol arızası',
        category: 'other',
        urgency: 'low',
        description: 'Bu kayıt operatör sonuçlarında görünmemelidir.',
      });
    expect(adminFault.status).toBe(201);

    const operatorFaults = await request(app).get('/api/faults').set(OPERATOR);
    expect(operatorFaults.status).toBe(200);
    expect(operatorFaults.body.faults.map((fault) => fault.code)).not.toContain(adminFault.body.fault.code);

    const operatorWorkOrders = await request(app).get('/api/work-orders').set(OPERATOR);
    expect(operatorWorkOrders.status).toBe(403);

    const technicianWorkOrders = await request(app).get('/api/work-orders').set(TECHNICIAN);
    expect(technicianWorkOrders.status).toBe(200);
    expect(technicianWorkOrders.body.workOrders.map((workOrder) => workOrder.code)).not.toContain('IE-2026-001');
    expect(technicianWorkOrders.body.workOrders.every((workOrder) => workOrder.technicianId === 2)).toBe(true);

    const unassignedDetail = await request(app).get('/api/work-orders/1').set(TECHNICIAN);
    expect(unassignedDetail.status).toBe(403);
  });

  it('prevents concurrent duplicate work orders for the same fault', async () => {
    const faultResponse = await createFault();
    const faultId = faultResponse.body.fault.id;

    const responses = await Promise.all([
      request(app).post('/api/work-orders').set(ADMIN).send({ faultId }),
      request(app).post('/api/work-orders').set(ADMIN).send({ faultId }),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    const conflict = responses.find((response) => response.status === 409);
    expect(conflict?.body.error.code).toBe('WORK_ORDER_ALREADY_EXISTS');
  });

  it('filters work orders and exposes dashboard counters', async () => {
    const assigned = await request(app)
      .get('/api/work-orders')
      .query({ status: 'assigned', assignedTo: 2 })
      .set(ADMIN);
    expect(assigned.status).toBe(200);
    expect(assigned.body.workOrders.map((workOrder) => workOrder.code)).toEqual(['IE-2026-002']);

    const critical = await request(app)
      .get('/api/work-orders')
      .query({ urgency: 'critical' })
      .set(ADMIN);
    expect(critical.body.workOrders.map((workOrder) => workOrder.code)).toEqual(['IE-2026-001']);

    const summary = await request(app).get('/api/dashboard/summary').set(ADMIN);
    expect(summary.body).toMatchObject({
      openFaults: 4,
      activeWorkOrders: 4,
    });
  });
});

async function workOrderIdByCode(code) {
  const response = await request(app).get('/api/work-orders').set(ADMIN);
  const workOrder = response.body.workOrders.find((item) => item.code === code);
  if (!workOrder) throw new Error(`Seeded work order not found: ${code}`);
  return workOrder.id;
}

describe('Phase 2 work-order transition matrix', () => {
  it.each([
    ['assigned to in_progress', async () => workOrderIdByCode('IE-2026-002'), 'in_progress', {}],
    ['in_progress to waiting_parts', async () => workOrderIdByCode('IE-2026-003'), 'waiting_parts', {}],
    ['waiting_parts to in_progress', async () => workOrderIdByCode('IE-2026-004'), 'in_progress', {}],
    ['in_progress to resolved', advanceWorkOrderToInProgress, 'resolved', COMPLETION],
    ['waiting_parts to resolved', async () => workOrderIdByCode('IE-2026-004'), 'resolved', COMPLETION],
    ['resolved to closed', advanceWorkOrderToResolved, 'closed', {}],
  ])('allows %s', async (_label, prepare, targetStatus, body) => {
    const workOrderId = await prepare();
    const response = await request(app)
      .patch(`/api/work-orders/${workOrderId}/status`)
      .set(TECHNICIAN)
      .send({ status: targetStatus, ...body });
    expect(response.status).toBe(200);
    expect(response.body.workOrder.status).toBe(targetStatus);
  });

  it.each([
    ['open to in_progress', async () => workOrderIdByCode('IE-2026-001'), 'in_progress'],
    ['open to resolved', async () => workOrderIdByCode('IE-2026-001'), 'resolved'],
    ['open to closed', async () => workOrderIdByCode('IE-2026-001'), 'closed'],
    ['assigned to waiting_parts', async () => workOrderIdByCode('IE-2026-002'), 'waiting_parts'],
    ['assigned to resolved', async () => workOrderIdByCode('IE-2026-002'), 'resolved'],
    ['assigned to closed', async () => workOrderIdByCode('IE-2026-002'), 'closed'],
    ['in_progress to assigned', async () => workOrderIdByCode('IE-2026-003'), 'assigned'],
    ['in_progress to closed', async () => workOrderIdByCode('IE-2026-003'), 'closed'],
    ['waiting_parts to assigned', async () => workOrderIdByCode('IE-2026-004'), 'assigned'],
    ['waiting_parts to closed', async () => workOrderIdByCode('IE-2026-004'), 'closed'],
    ['resolved to in_progress', advanceWorkOrderToResolved, 'in_progress'],
    ['resolved to waiting_parts', advanceWorkOrderToResolved, 'waiting_parts'],
    ['resolved to assigned', advanceWorkOrderToResolved, 'assigned'],
    ['closed to in_progress', async () => workOrderIdByCode('IE-2026-005'), 'in_progress'],
    ['closed to waiting_parts', async () => workOrderIdByCode('IE-2026-005'), 'waiting_parts'],
    ['closed to resolved', async () => workOrderIdByCode('IE-2026-005'), 'resolved'],
    ['closed to closed', async () => workOrderIdByCode('IE-2026-005'), 'closed'],
  ])('rejects %s', async (_label, prepare, targetStatus) => {
    const workOrderId = await prepare();
    const response = await request(app)
      .patch(`/api/work-orders/${workOrderId}/status`)
      .set(TECHNICIAN)
      .send({ status: targetStatus, ...(targetStatus === 'resolved' ? COMPLETION : {}) });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('INVALID_STATUS_TRANSITION');
  });

  it('prevents a different technician from updating an assigned work order', async () => {
    await run(
      database,
      "INSERT INTO users (id, name, email, role, initials) VALUES (4, 'Başka Teknisyen', 'other.tech@example.com', 'technician', 'BT')",
    );
    const otherTechnician = { 'x-user-id': '4' };
    const workOrderId = await workOrderIdByCode('IE-2026-002');

    const response = await request(app)
      .patch(`/api/work-orders/${workOrderId}/status`)
      .set(otherTechnician)
      .send({ status: 'in_progress' });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('allows the manager to progress any work order', async () => {
    const workOrderId = await workOrderIdByCode('IE-2026-002');
    const response = await request(app)
      .patch(`/api/work-orders/${workOrderId}/status`)
      .set(ADMIN)
      .send({ status: 'in_progress' });
    expect(response.status).toBe(200);
    expect(response.body.workOrder.status).toBe('in_progress');
  });
});

describe('Phase 2 demo dataset', () => {
  it('seeds at least four realistic fault and work-order records across stages', async () => {
    const faults = await request(app).get('/api/faults').set(ADMIN);
    const workOrders = await request(app).get('/api/work-orders').set(ADMIN);

    expect(faults.body.faults.length).toBeGreaterThanOrEqual(4);
    expect(workOrders.body.workOrders.length).toBeGreaterThanOrEqual(4);
    expect(new Set(faults.body.faults.map((fault) => fault.code)).size).toBe(faults.body.faults.length);
    expect(new Set(workOrders.body.workOrders.map((workOrder) => workOrder.code)).size).toBe(workOrders.body.workOrders.length);
    expect(new Set(workOrders.body.workOrders.map((workOrder) => workOrder.status))).toEqual(
      new Set(['open', 'assigned', 'in_progress', 'waiting_parts', 'closed']),
    );
    const photoFault = faults.body.faults.find((fault) => fault.code === 'ARZ-2026-005');
    expect(photoFault).toMatchObject({ hasPhoto: true, photo: null, photoBase64: null });

    const originalCodes = faults.body.faults.map((fault) => fault.code);
    await seedDemoData(database);
    const reseeded = await request(app).get('/api/faults').set(ADMIN);
    expect(reseeded.body.faults.map((fault) => fault.code)).toEqual(originalCodes);
  });
});
