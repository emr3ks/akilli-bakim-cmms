import { notFound } from '../errors.js';
import { findMachineById } from '../repositories/machines.js';
import { listMachineMaintenanceHistory } from '../repositories/maintenance-history.js';

export async function getMachineMaintenanceHistory(database, machineId, user) {
  const machine = await findMachineById(database, machineId);
  if (!machine) throw notFound('Machine not found', 'MACHINE_NOT_FOUND');
  const entries = await listMachineMaintenanceHistory(database, machine.id, user);
  const truncated = entries.length > 1000;
  return { machine, entries: entries.slice(0, 1000), truncated };
}
