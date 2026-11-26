import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { closeDatabase, createDatabase } from '../src/db.js';
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

describe('CMMS API', () => {
  it('reports health, lists demo users, logs in, and returns dashboard counts', async () => {
    const health = await request(app).get('/api/health');
    expect(health.status).toBe(200);
    expect(health.body).toEqual({ ok: true });

    const users = await request(app).get('/api/auth/demo-users');
    expect(users.status).toBe(200);
    expect(users.body.users).toHaveLength(3);
    expect(users.body.users[0]).toMatchObject({ id: 1, role: 'admin' });

    const login = await request(app).post('/api/auth/login').send({ userId: 2 });
    expect(login.status).toBe(200);
    expect(login.body.user).toMatchObject({ id: 2, role: 'technician' });

    const summary = await request(app).get('/api/dashboard/summary').set(ADMIN);
    expect(summary.status).toBe(200);
    expect(summary.body).toMatchObject({
      total: 7,
      running: 3,
      maintenance: 2,
      faulted: 1,
      stopped: 1,
    });
  });

  it('filters machines by search text, line, status, and criticality', async () => {
    const response = await request(app)
      .get('/api/machines')
      .query({ q: 'kompresör' })
      .set(ADMIN);
    expect(response.status).toBe(200);
    expect(response.body.machines).toHaveLength(1);
    expect(response.body.machines[0].code).toBe('MCH-2026-003');

    const line = await request(app)
      .get('/api/machines')
      .query({ line: 'Paketleme Hattı C' })
      .set(ADMIN);
    expect(line.status).toBe(200);
    expect(line.body.machines.map((machine) => machine.code)).toEqual([
      'MCH-2026-004',
      'MCH-2026-006',
    ]);

    const filtered = await request(app)
      .get('/api/machines')
      .query({ status: 'running', criticality: 'medium' })
      .set(ADMIN);
    expect(filtered.status).toBe(200);
    expect(filtered.body.machines.every((machine) => machine.status === 'running' && machine.criticality === 'medium')).toBe(true);
  });

  it('allows admin CRUD and denies non-admin mutations', async () => {
    const created = await request(app)
      .post('/api/machines')
      .set(ADMIN)
      .send({
        code: 'MCH-2026-009',
        name: 'Laser Cutting Cell',
        line: 'Fabrication Line D',
        brand: 'TRUMPF',
        model: 'TruLaser 3030',
        serialNumber: 'TRU-TL3030-2025-0009',
        criticality: 'high',
        status: 'running',
      });
    expect(created.status).toBe(201);
    expect(created.body.machine.code).toBe('MCH-2026-009');
    expect(created.body.machine.qrCode).toBe('MCH-2026-009');

    const updated = await request(app)
      .put(`/api/machines/${created.body.machine.id}`)
      .set(ADMIN)
      .send({ status: 'stopped' });
    expect(updated.status).toBe(200);
    expect(updated.body.machine.status).toBe('stopped');

    const denied = await request(app)
      .post('/api/machines')
      .set(TECHNICIAN)
      .send({ code: 'MCH-2026-010' });
    expect(denied.status).toBe(403);
    expect(denied.body.error).toHaveProperty('message');

    const deleted = await request(app)
      .delete(`/api/machines/${created.body.machine.id}`)
      .set(ADMIN);
    expect(deleted.status).toBe(200);
    expect(deleted.body).toEqual({ deleted: true, id: created.body.machine.id });
  });

  it('enforces record permissions and updates machine status', async () => {
    const machineId = 1;

    const operatorMaintenance = await request(app)
      .post(`/api/machines/${machineId}/maintenance-records`)
      .set(OPERATOR)
      .send({ type: 'maintenance', description: 'Lubricate spindle' });
    expect(operatorMaintenance.status).toBe(403);

    const technicianRecord = await request(app)
      .post(`/api/machines/${machineId}/maintenance-records`)
      .set(TECHNICIAN)
      .send({ type: 'maintenance', description: 'Replace spindle bearing', severity: 'medium' });
    expect(technicianRecord.status).toBe(201);
    expect(technicianRecord.body.record.type).toBe('maintenance');

    let machine = await request(app).get(`/api/machines/${machineId}`).set(TECHNICIAN);
    expect(machine.body.machine.status).toBe('maintenance');

    const operatorFault = await request(app)
      .post(`/api/machines/${machineId}/fault-records`)
      .set(OPERATOR)
      .send({ description: 'Spindle stopped unexpectedly', severity: 'high' });
    expect(operatorFault.status).toBe(201);
    expect(operatorFault.body.record.type).toBe('fault');

    machine = await request(app).get(`/api/machines/${machineId}`).set(OPERATOR);
    expect(machine.body.machine.status).toBe('faulted');

    const faultRecords = await request(app).get(`/api/machines/${machineId}/fault-records`).set(OPERATOR);
    expect(faultRecords.status).toBe(200);
    expect(faultRecords.body.records).toHaveLength(1);
  });

  it('rejects malformed and duplicate machine codes with stable errors', async () => {
    const malformed = await request(app)
      .post('/api/machines')
      .set(ADMIN)
      .send({
        code: 'machine-1',
        name: 'Test Machine',
        line: 'Test Line',
        brand: 'Test Brand',
        model: 'Test Model',
        serialNumber: 'TEST-001',
        criticality: 'low',
        status: 'running',
      });
    expect(malformed.status).toBe(400);
    expect(malformed.body.error).toHaveProperty('message');

    const duplicate = await request(app)
      .post('/api/machines')
      .set(ADMIN)
      .send({
        code: 'MCH-2026-001',
        name: 'Duplicate Machine',
        line: 'Test Line',
        brand: 'Test Brand',
        model: 'Test Model',
        serialNumber: 'TEST-002',
        criticality: 'low',
        status: 'running',
      });
    expect(duplicate.status).toBe(400);
    expect(duplicate.body.error.code).toBe('MACHINE_CODE_DUPLICATE');
  });

  it('rejects missing or unknown authentication identities', async () => {
    const missing = await request(app).get('/api/machines');
    expect(missing.status).toBe(401);
    expect(missing.body.error).toHaveProperty('message');

    const unknown = await request(app).get('/api/machines').set({ 'x-user-id': '999' });
    expect(unknown.status).toBe(401);
  });
});
