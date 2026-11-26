import { transaction } from '../db.js';
import { notFound } from '../errors.js';
import { findMachineById, setMachineStatus } from '../repositories/machines.js';
import {
  findFaultById,
  insertFault,
  listFaults,
} from '../repositories/faults.js';
import { validateFaultPayload } from '../validators.js';
import { generateDocumentCode } from './document-code.js';

export async function getFaultOrThrow(database, faultId) {
  const fault = await findFaultById(database, faultId);
  if (!fault) throw notFound('Fault not found', 'FAULT_NOT_FOUND');
  return fault;
}

export async function listFaultRecords(database, filters = {}) {
  return listFaults(database, filters);
}

export async function createFault(database, payload, user) {
  const data = validateFaultPayload(payload);
  const machine = await findMachineById(database, data.machineId);
  if (!machine) throw notFound('Machine not found', 'MACHINE_NOT_FOUND');

  return transaction(database, async () => {
    const code = await generateDocumentCode(database, 'fault');
    const fault = await insertFault(database, {
      ...data,
      code,
      reportedBy: user.id,
      status: 'open',
      createdAt: new Date().toISOString(),
    });

    if (data.urgency === 'critical') {
      await setMachineStatus(database, machine.id, 'faulted');
    }

    return findFaultById(database, fault.id);
  });
}
