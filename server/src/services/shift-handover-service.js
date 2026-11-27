import { all, get, transaction } from '../db.js';
import { ApiError, forbidden, notFound } from '../errors.js';
import {
  findShiftHandoverById,
  insertShiftHandover,
  insertShiftHandoverApproval,
  listShiftHandovers,
} from '../repositories/shift-handovers.js';
import { todayPlantDate } from '../utils/date-only.js';
import { validateShiftHandoverPayload } from '../validators.js';
import { generateDocumentCode } from './document-code.js';

const successorShifts = {
  morning: 'evening',
  evening: 'night',
  night: 'morning',
};

async function isAssignedToShift(database, userId, shift) {
  const row = await get(
    database,
    'SELECT 1 AS assigned FROM user_shift_assignments WHERE user_id = ? AND shift = ?',
    [userId, shift],
  );
  return Boolean(row?.assigned);
}

async function canApproveHandover(database, handover, user) {
  if (!handover || handover.approved || handover.createdByUser.id === user.id) return false;
  return isAssignedToShift(database, user.id, successorShifts[handover.shift]);
}

async function collectCriticalFaults(database) {
  const rows = await all(
    database,
    `SELECT f.id, f.code, f.title, m.code AS machine_code
     FROM faults f
     JOIN machines m ON m.id = f.machine_id
     WHERE f.status = 'open' AND f.urgency = 'critical'
     ORDER BY f.created_at DESC, f.id DESC`,
  );
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    title: row.title,
    machineCode: row.machine_code,
  }));
}

async function collectAttentionMachines(database) {
  const rows = await all(
    database,
    `SELECT
       m.id,
       m.code,
       m.name,
       m.status AS persisted_status,
       EXISTS (
         SELECT 1 FROM faults f
         WHERE f.machine_id = m.id AND f.status = 'open' AND f.urgency IN ('critical', 'high')
       ) AS has_open_urgent_fault,
       EXISTS (
         SELECT 1 FROM sensor_alerts sa
         WHERE sa.machine_id = m.id AND sa.status = 'active'
       ) AS has_sensor_alert
     FROM machines m
     WHERE m.status IN ('maintenance', 'faulted')
        OR EXISTS (
          SELECT 1 FROM faults f
          WHERE f.machine_id = m.id AND f.status = 'open' AND f.urgency IN ('critical', 'high')
        )
        OR EXISTS (
          SELECT 1 FROM sensor_alerts sa
          WHERE sa.machine_id = m.id AND sa.status = 'active'
        )
     ORDER BY m.code ASC`,
  );

  return rows.map((row) => {
    const reasons = [];
    if (row.has_open_urgent_fault) reasons.push('Açık yüksek/kritik arıza');
    if (row.has_sensor_alert) reasons.push('Sensör eşiği aşıldı');
    if (row.persisted_status === 'maintenance') reasons.push('Bakımda');
    if (row.persisted_status === 'faulted') reasons.push('Arızalı');
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      reasons,
    };
  });
}

export async function getShiftHandoverLedger(database, user) {
  const handovers = await listShiftHandovers(database);
  return {
    handovers: await Promise.all(handovers.map(async (handover) => ({
      ...handover,
      canApprove: await canApproveHandover(database, handover, user),
    }))),
  };
}

export async function createShiftHandover(database, payload, user) {
  const data = validateShiftHandoverPayload(payload);

  return transaction(database, async () => {
    const [criticalFaults, attentionMachines] = await Promise.all([
      collectCriticalFaults(database),
      collectAttentionMachines(database),
    ]);
    const code = await generateDocumentCode(database, 'shiftHandover');
    const created = await insertShiftHandover(database, {
      code,
      shift: data.shift,
      shiftDate: todayPlantDate(),
      summary: data.summary,
      notes: data.notes,
      criticalFaults,
      attentionMachines,
      createdBy: user.id,
      createdAt: new Date().toISOString(),
    });
    const handover = await findShiftHandoverById(database, created.id);
    return {
      ...handover,
      canApprove: await canApproveHandover(database, handover, user),
    };
  });
}

export async function approveShiftHandover(database, handoverId, user) {
  const handover = await findShiftHandoverById(database, handoverId);
  if (!handover) throw notFound('Shift handover not found', 'SHIFT_HANDOVER_NOT_FOUND');
  if (handover.approved) {
    throw new ApiError(409, 'Shift handover is already approved', 'SHIFT_HANDOVER_ALREADY_APPROVED');
  }
  if (handover.createdByUser.id === user.id) {
    throw new ApiError(
      409,
      'The next shift must approve the handover; the creator cannot approve their own record',
      'SHIFT_HANDOVER_SELF_APPROVAL',
    );
  }
  if (!await isAssignedToShift(database, user.id, successorShifts[handover.shift])) {
    throw forbidden('Only personnel assigned to the next shift can approve this handover');
  }

  return transaction(database, async () => {
    const current = await findShiftHandoverById(database, handover.id);
    if (!current) throw notFound('Shift handover not found', 'SHIFT_HANDOVER_NOT_FOUND');
    if (current.approved) {
      throw new ApiError(409, 'Shift handover is already approved', 'SHIFT_HANDOVER_ALREADY_APPROVED');
    }
    if (current.createdByUser.id === user.id) {
      throw new ApiError(
        409,
        'The next shift must approve the handover; the creator cannot approve their own record',
        'SHIFT_HANDOVER_SELF_APPROVAL',
      );
    }
    if (!await isAssignedToShift(database, user.id, successorShifts[current.shift])) {
      throw forbidden('Only personnel assigned to the next shift can approve this handover');
    }
    await insertShiftHandoverApproval(database, {
      handoverId: current.id,
      approvedBy: user.id,
      approvedAt: new Date().toISOString(),
    });
    const approved = await findShiftHandoverById(database, current.id);
    return { ...approved, canApprove: false };
  });
}
