import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { closeDatabase, createDatabase, run } from '../src/db.js';
import { seedDemoData } from '../src/seed.js';
import { calculateNextDueDate } from '../src/services/preventive-plan-service.js';
import { addUtcDays, todayUtcDate } from '../src/utils/date-only.js';

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

async function createPlan(overrides = {}) {
  return request(app)
    .post('/api/preventive-plans')
    .set(ADMIN)
    .send({
      machineId: 1,
      name: 'Test periyodik bakım planı',
      frequency: 'weekly',
      assignedTo: 2,
      nextDueDate: addUtcDays(todayUtcDate(), 1),
      checklist: [
        { title: 'Yağ seviyesini kontrol et', measurementLabel: 'Yağ seviyesi (%)' },
        { title: 'Gürültüyü kontrol et' },
      ],
      ...overrides,
    });
}

function resultsFor(plan, overrides = {}) {
  return plan.checklistItems.map((item) => ({
    itemId: item.id,
    completed: true,
    ...(item.measurementLabel ? { measurementValue: 10 } : {}),
    ...overrides,
  }));
}

async function completePlan(plan, body = {}) {
  return request(app)
    .post(`/api/preventive-plans/${plan.id}/complete`)
    .set(TECHNICIAN)
    .send({
      checklistResults: resultsFor(plan),
      notes: 'Kontrol listesi eksiksiz tamamlandı.',
      ...body,
    });
}

describe('Phase 3 preventive-plan API', () => {
  it('creates and lists plans with machine, technician, checklist, and due-state data', async () => {
    const created = await createPlan();
    expect(created.status).toBe(201);
    expect(created.body.plan).toMatchObject({
      machineId: 1,
      name: 'Test periyodik bakım planı',
      frequency: 'weekly',
      assignedToId: 2,
      dueState: 'upcoming',
      createdBy: 1,
    });
    expect(created.body.plan.code).toMatch(/^PB-2026-\d{3}$/);
    expect(created.body.plan.machine).toMatchObject({
      id: 1,
      code: 'MCH-2026-001',
      name: 'CNC Freze Merkezi',
      line: 'İşleme Hattı A',
      status: 'running',
    });
    expect(created.body.plan.assignedTo).toEqual({
      id: 2,
      name: 'Deniz Teknisyen',
      initials: 'DT',
    });
    expect(created.body.plan.checklistItems).toHaveLength(2);
    expect(created.body.plan.checklistItems[0]).toMatchObject({
      position: 1,
      title: 'Yağ seviyesini kontrol et',
      measurementLabel: 'Yağ seviyesi (%)',
    });

    const list = await request(app).get('/api/preventive-plans').set(ADMIN);
    expect(list.status).toBe(200);
    expect(list.body.plans.length).toBeGreaterThanOrEqual(6);
    expect(list.body.plans.some((plan) => plan.id === created.body.plan.id)).toBe(true);

    const filtered = await request(app)
      .get('/api/preventive-plans')
      .query({ machineId: 1 })
      .set(ADMIN);
    expect(filtered.body.plans.every((plan) => plan.machineId === 1)).toBe(true);
  });

  it('enforces role visibility, technician assignment, and create permissions', async () => {
    const operatorList = await request(app).get('/api/preventive-plans').set(OPERATOR);
    expect(operatorList.status).toBe(403);

    const technicianCreate = await request(app)
      .post('/api/preventive-plans')
      .set(TECHNICIAN)
      .send({});
    expect(technicianCreate.status).toBe(403);

    await run(
      database,
      "INSERT INTO users (id, name, email, role, initials) VALUES (4, 'Başka Teknisyen', 'other.tech@example.com', 'technician', 'BT')",
    );
    const otherPlan = await createPlan({ assignedTo: 4, name: 'Diğer teknisyenin planı' });
    expect(otherPlan.status).toBe(201);

    const technicianList = await request(app).get('/api/preventive-plans').set(TECHNICIAN);
    expect(technicianList.status).toBe(200);
    expect(technicianList.body.plans.every((plan) => plan.assignedToId === 2)).toBe(true);
    expect(technicianList.body.plans.some((plan) => plan.id === otherPlan.body.plan.id)).toBe(false);

    const forbiddenDetail = await request(app)
      .get(`/api/preventive-plans/${otherPlan.body.plan.id}`)
      .set(TECHNICIAN);
    expect(forbiddenDetail.status).toBe(403);

    const operatorDetail = await request(app)
      .get(`/api/preventive-plans/${otherPlan.body.plan.id}`)
      .set(OPERATOR);
    expect(operatorDetail.status).toBe(403);

    const technicianCompletion = await request(app)
      .post(`/api/preventive-plans/${otherPlan.body.plan.id}/complete`)
      .set(TECHNICIAN)
      .send({ checklistResults: resultsFor(otherPlan.body.plan) });
    expect(technicianCompletion.status).toBe(403);

    const operatorCompletion = await request(app)
      .post(`/api/preventive-plans/${otherPlan.body.plan.id}/complete`)
      .set(OPERATOR)
      .send({ checklistResults: resultsFor(otherPlan.body.plan) });
    expect(operatorCompletion.status).toBe(403);

    const adminCompletion = await request(app)
      .post(`/api/preventive-plans/${otherPlan.body.plan.id}/complete`)
      .set(ADMIN)
      .send({ checklistResults: resultsFor(otherPlan.body.plan) });
    expect(adminCompletion.status).toBe(200);
  });

  it('validates plan fields, checklist, frequency, and working-hours configuration', async () => {
    const emptyChecklist = await createPlan({ checklist: [] });
    expect(emptyChecklist.status).toBe(400);
    expect(emptyChecklist.body.error.code).toBe('VALIDATION_ERROR');

    const invalidFrequency = await createPlan({ frequency: 'daily' });
    expect(invalidFrequency.status).toBe(400);

    const invalidDate = await createPlan({ nextDueDate: '2026-02-30' });
    expect(invalidDate.status).toBe(400);

    const missingInterval = await createPlan({
      frequency: 'working_hours',
      intervalHours: undefined,
      runtimeHours: 1200,
    });
    expect(missingInterval.status).toBe(400);

    const missingRuntime = await createPlan({
      frequency: 'working_hours',
      intervalHours: 160,
      runtimeHours: undefined,
    });
    expect(missingRuntime.status).toBe(400);

    const nonTechnician = await createPlan({ assignedTo: 1 });
    expect(nonTechnician.status).toBe(400);
    expect(nonTechnician.body.error.code).toBe('TECHNICIAN_ROLE_REQUIRED');

    const unknownTechnician = await createPlan({ assignedTo: 999 });
    expect(unknownTechnician.status).toBe(404);
    expect(unknownTechnician.body.error.code).toBe('TECHNICIAN_NOT_FOUND');

    const ignoredHours = await createPlan({
      frequency: 'monthly',
      intervalHours: 'ignored',
      runtimeHours: 'ignored',
    });
    expect(ignoredHours.status).toBe(201);
    expect(ignoredHours.body.plan.intervalHours).toBeNull();
    expect(ignoredHours.body.plan.nextDueRuntimeHours).toBeNull();
  });

  it.each([
    ['weekly', '2020-01-01', {}, null],
    ['monthly', '2020-01-31', {}, null],
    ['quarterly', '2020-11-30', {}, null],
    ['semiannual', '2020-08-31', {}, null],
    ['annual', '2020-02-29', {}, null],
    ['working_hours', '2020-11-27', { intervalHours: 20 }, 1420],
  ])(
    'advances a %s plan from the completion date using the specified UTC date rule',
    async (frequency, previousDueDate, hours, expectedRuntime) => {
      const created = await createPlan({
        frequency,
        nextDueDate: previousDueDate,
        ...hours,
        ...(frequency === 'working_hours' ? { runtimeHours: 1200 } : {}),
      });
      expect(created.status).toBe(201);

      const completed = await completePlan(created.body.plan, {
        ...(frequency === 'working_hours' ? { runtimeHours: 1400 } : {}),
      });
      expect(completed.status).toBe(200);
      const expectedDate = calculateNextDueDate(
        completed.body.completion.completedAt.slice(0, 10),
        frequency,
        hours.intervalHours,
      );
      expect(completed.body.completion.nextDueDate).toBe(expectedDate);
      expect(completed.body.plan.nextDueDate).toBe(expectedDate);
      expect(completed.body.plan.lastCompletedAt).toBeTruthy();
      if (expectedRuntime !== null) {
        expect(completed.body.completion.nextDueRuntimeHours).toBe(expectedRuntime);
        expect(completed.body.plan.nextDueRuntimeHours).toBe(expectedRuntime);
      } else {
        expect(completed.body.completion.nextDueRuntimeHours).toBeNull();
      }
    },
  );

  it('clamps calendar-month recurrence to the target month end', () => {
    expect(calculateNextDueDate('2026-01-31', 'monthly')).toBe('2026-02-28');
    expect(calculateNextDueDate('2024-01-31', 'monthly')).toBe('2024-02-29');
    expect(calculateNextDueDate('2026-11-30', 'quarterly')).toBe('2027-02-28');
    expect(calculateNextDueDate('2026-08-31', 'semiannual')).toBe('2027-02-28');
    expect(calculateNextDueDate('2024-02-29', 'annual')).toBe('2025-02-28');
  });

  it('requires every checklist item, completed=true, and required measurements', async () => {
    const created = await createPlan();
    const plan = created.body.plan;

    const missing = await request(app)
      .post(`/api/preventive-plans/${plan.id}/complete`)
      .set(TECHNICIAN)
      .send({ checklistResults: [resultsFor(plan)[1]] });
    expect(missing.status).toBe(400);
    expect(missing.body.error.code).toBe('VALIDATION_ERROR');

    const incomplete = await request(app)
      .post(`/api/preventive-plans/${plan.id}/complete`)
      .set(TECHNICIAN)
      .send({
        checklistResults: resultsFor(plan).map((result, index) => (
          index === 0 ? { ...result, completed: false } : result
        )),
      });
    expect(incomplete.status).toBe(400);

    const duplicate = await request(app)
      .post(`/api/preventive-plans/${plan.id}/complete`)
      .set(TECHNICIAN)
      .send({ checklistResults: [resultsFor(plan)[0], resultsFor(plan)[0]] });
    expect(duplicate.status).toBe(400);

    const unknown = await request(app)
      .post(`/api/preventive-plans/${plan.id}/complete`)
      .set(TECHNICIAN)
      .send({ checklistResults: [...resultsFor(plan), { itemId: 9999, completed: true }] });
    expect(unknown.status).toBe(400);

    const missingMeasurement = await request(app)
      .post(`/api/preventive-plans/${plan.id}/complete`)
      .set(TECHNICIAN)
      .send({
        checklistResults: resultsFor(plan).map((result, index) => (
          index === 0 ? { ...result, measurementValue: undefined } : result
        )),
      });
    expect(missingMeasurement.status).toBe(400);

    const validZeroMeasurement = await request(app)
      .post(`/api/preventive-plans/${plan.id}/complete`)
      .set(TECHNICIAN)
      .send({
        checklistResults: resultsFor(plan).map((result, index) => (
          index === 0 ? { ...result, measurementValue: 0 } : result
        )),
      });
    expect(validZeroMeasurement.status).toBe(200);
    expect(validZeroMeasurement.body.completion.results[0].measurementValue).toBe(0);
  });

  it('requires runtime hours for working-hours completion and blocks other technicians', async () => {
    const working = await createPlan({
      frequency: 'working_hours',
      intervalHours: 160,
      runtimeHours: 1200,
    });
    const missingRuntime = await request(app)
      .post(`/api/preventive-plans/${working.body.plan.id}/complete`)
      .set(TECHNICIAN)
      .send({ checklistResults: resultsFor(working.body.plan) });
    expect(missingRuntime.status).toBe(400);

    await run(
      database,
      "INSERT INTO users (id, name, email, role, initials) VALUES (4, 'Başka Teknisyen', 'other.tech@example.com', 'technician', 'BT')",
    );
    const otherTechnician = { 'x-user-id': '4' };
    const forbidden = await request(app)
      .post(`/api/preventive-plans/${working.body.plan.id}/complete`)
      .set(otherTechnician)
      .send({
        checklistResults: resultsFor(working.body.plan),
        runtimeHours: 1400,
      });
    expect(forbidden.status).toBe(403);
  });

  it('records completion history, per-item results, a maintenance summary, and the advanced plan', async () => {
    const created = await createPlan();
    const plan = created.body.plan;
    const completed = await completePlan(plan);
    expect(completed.status).toBe(200);
    expect(completed.body.completion).toMatchObject({
      planId: plan.id,
      completedById: 2,
      notes: 'Kontrol listesi eksiksiz tamamlandı.',
    });
    expect(completed.body.completion.completedBy).toBe(2);
    expect(completed.body.completion.completedByUser).toEqual({
      id: 2,
      name: 'Deniz Teknisyen',
      initials: 'DT',
    });
    expect(completed.body.completion.results).toHaveLength(2);
    expect(completed.body.completion.results[0]).toMatchObject({
      itemId: plan.checklistItems[0].id,
      title: plan.checklistItems[0].title,
      completed: true,
      measurementValue: 10,
    });

    const history = await request(app)
      .get(`/api/preventive-plans/${plan.id}/completions`)
      .set(TECHNICIAN);
    expect(history.status).toBe(200);
    expect(history.body.completions).toHaveLength(1);
    expect(history.body.completions[0].id).toBe(completed.body.completion.id);

    const records = await request(app)
      .get(`/api/machines/${plan.machineId}/maintenance-records`)
      .set(ADMIN);
    expect(records.status).toBe(200);
    expect(records.body.records).toHaveLength(1);
    expect(records.body.records[0]).toMatchObject({
      type: 'maintenance',
      createdBy: 2,
    });
    expect(records.body.records[0].description).toContain(plan.code);

    const detail = await request(app)
      .get(`/api/preventive-plans/${plan.id}`)
      .set(TECHNICIAN);
    expect(detail.body.plan.lastCompletedAt).toBe(completed.body.completion.completedAt);
    expect(detail.body.plan.nextDueDate).toBe(completed.body.plan.nextDueDate);
  });

  it('exposes due, upcoming, and overdue preventive counters on the dashboard', async () => {
    const summary = await request(app).get('/api/dashboard/summary').set(ADMIN);
    expect(summary.status).toBe(200);
    expect(summary.body).toMatchObject({
      duePreventive: 1,
      upcomingPreventive: 2,
      overduePreventive: 1,
    });
  });
});

describe('Phase 3 preventive demo dataset', () => {
  it('seeds at least six realistic plans with all frequencies, states, and checklists', async () => {
    const response = await request(app).get('/api/preventive-plans').set(ADMIN);
    expect(response.status).toBe(200);
    expect(response.body.plans.length).toBeGreaterThanOrEqual(4);
    expect(response.body.plans.every((plan) => plan.checklistItems.length > 0)).toBe(true);
    expect(new Set(response.body.plans.map((plan) => plan.code)).size).toBe(response.body.plans.length);
    expect(new Set(response.body.plans.map((plan) => plan.frequency))).toEqual(
      new Set(['weekly', 'monthly', 'quarterly', 'semiannual', 'annual', 'working_hours']),
    );
    expect(new Set(response.body.plans.map((plan) => plan.dueState))).toEqual(
      new Set(['overdue', 'due', 'upcoming', 'scheduled']),
    );
    expect(response.body.plans.every((plan) => plan.assignedToId === 2)).toBe(true);

    const originalCodes = response.body.plans.map((plan) => plan.code);
    await seedDemoData(database);
    const reseeded = await request(app).get('/api/preventive-plans').set(ADMIN);
    expect(reseeded.body.plans.map((plan) => plan.code)).toEqual(originalCodes);
  });
});
