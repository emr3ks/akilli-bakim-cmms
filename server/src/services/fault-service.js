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
import { createNotification } from './notification-service.js';

export async function getFaultOrThrow(database, faultId, user) {
  const fault = await findFaultById(database, faultId);
  if (!fault) throw notFound('Fault not found', 'FAULT_NOT_FOUND');

  if (user?.role === 'admin') return fault;
  if (user?.role === 'operator' && fault.reportedBy.id === user.id) return fault;
  if (
    user?.role === 'technician'
    && (fault.reportedBy.id === user.id || fault.workOrder?.assignedTo === user.id)
  ) {
    return fault;
  }
  throw notFound('Fault not found', 'FAULT_NOT_FOUND');
}

export async function listFaultRecords(database, filters = {}, user) {
  const scopedFilters = { ...filters };
  if (user?.role === 'operator') {
    scopedFilters.reportedBy = user.id;
    delete scopedFilters.assignedTo;
  } else if (user?.role === 'technician') {
    scopedFilters.viewerId = user.id;
  }
  return listFaults(database, scopedFilters);
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
      await createNotification(database, {
        type: 'critical_fault',
        title: `${machine.code} kritik arıza bildirimi`,
        message: `${fault.code}: ${fault.title}`,
        severity: 'critical',
        dedupeKey: `critical-fault:${fault.id}`,
        createdAt: fault.createdAt,
      });
    }

    return findFaultById(database, fault.id);
  });
}
