import { run } from '../db.js';
import { ApiError, notFound } from '../errors.js';
import {
  findMachineByCode,
  findMachineById,
  insertMachine,
  updateMachine,
} from '../repositories/machines.js';
import { validateMachinePayload } from '../validators.js';

function isUniqueConstraint(error) {
  return error && typeof error.code === 'string' && error.code.startsWith('SQLITE_CONSTRAINT_UNIQUE');
}

export async function getMachineOrThrow(database, machineId) {
  const machine = await findMachineById(database, machineId);
  if (!machine) throw notFound('Machine not found', 'MACHINE_NOT_FOUND');
  return machine;
}

export async function createMachine(database, payload) {
  const data = validateMachinePayload(payload);
  const existing = await findMachineByCode(database, data.code);
  if (existing) {
    throw new ApiError(400, `Machine code ${data.code} is already in use`, 'MACHINE_CODE_DUPLICATE');
  }

  try {
    return await insertMachine(database, {
      ...data,
      qrCode: data.code,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    if (isUniqueConstraint(error)) {
      throw new ApiError(400, `Machine code ${data.code} is already in use`, 'MACHINE_CODE_DUPLICATE');
    }
    throw error;
  }
}

export async function updateMachineById(database, machineId, payload) {
  const machine = await getMachineOrThrow(database, machineId);
  const data = validateMachinePayload(payload, { partial: true });

  if (data.code && data.code !== machine.code) {
    const existing = await findMachineByCode(database, data.code);
    if (existing) {
      throw new ApiError(400, `Machine code ${data.code} is already in use`, 'MACHINE_CODE_DUPLICATE');
    }
  }

  try {
    return await updateMachine(database, machine.id, data);
  } catch (error) {
    if (isUniqueConstraint(error)) {
      throw new ApiError(400, `Machine code ${data.code || machine.code} is already in use`, 'MACHINE_CODE_DUPLICATE');
    }
    throw error;
  }
}

export async function deleteMachineById(database, machineId) {
  const machine = await getMachineOrThrow(database, machineId);
  await run(database, 'DELETE FROM machines WHERE id = ?', [machine.id]);
  return machine;
}
