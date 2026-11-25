import { transaction } from '../db.js';
import { notFound } from '../errors.js';
import { insertRecord, listRecords } from '../repositories/records.js';
import { findMachineById, setMachineStatus } from '../repositories/machines.js';
import { validateRecordPayload } from '../validators.js';

export async function getMachineForRecords(database, machineId) {
  const machine = await findMachineById(database, machineId);
  if (!machine) throw notFound('Machine not found', 'MACHINE_NOT_FOUND');
  return machine;
}

export async function listMachineRecords(database, machineId, type = undefined) {
  await getMachineForRecords(database, machineId);
  return listRecords(database, Number(machineId), type);
}

export async function createMachineRecord(database, machineId, payload, user, { requireType = true } = {}) {
  const machine = await getMachineForRecords(database, machineId);
  const data = validateRecordPayload(payload, { requiredType: requireType });
  const createdAt = new Date().toISOString();

  return transaction(database, async () => {
    const record = await insertRecord(database, {
      machineId: machine.id,
      type: data.type,
      description: data.description,
      severity: data.severity ?? null,
      createdBy: user?.id ?? null,
      createdAt,
    });
    await setMachineStatus(database, machine.id, data.type === 'fault' ? 'faulted' : 'maintenance');
    return record;
  });
}
