import { transaction } from '../db.js';
import { ApiError, forbidden, notFound, validationError } from '../errors.js';
import { findMachineById } from '../repositories/machines.js';
import { insertRecord } from '../repositories/records.js';
import {
  findExecutionById,
  findPreventivePlanById,
  insertChecklistItem,
  insertExecution,
  insertExecutionItem,
  insertPreventivePlan,
  listExecutionsByPlanId,
  listPreventivePlans,
  nextExecutionCode,
  updatePreventivePlanAfterCompletion,
} from '../repositories/preventive-plans.js';
import { findUserById } from '../repositories/users.js';
import {
  validatePreventiveCompletionPayload,
  validatePreventivePlanPayload,
} from '../validators.js';
import {
  addCalendarMonths,
  addUtcDays,
  addWorkingDays,
} from '../utils/date-only.js';
import { generateDocumentCode } from './document-code.js';

async function requireTechnician(database, technicianId) {
  const technician = await findUserById(database, technicianId);
  if (!technician) throw notFound('Technician not found', 'TECHNICIAN_NOT_FOUND');
  if (technician.role !== 'technician') {
    throw new ApiError(
      400,
      'The selected user is not a maintenance technician',
      'TECHNICIAN_ROLE_REQUIRED',
    );
  }
  return technician;
}

export async function getPreventivePlanOrThrow(database, planId, user) {
  const plan = await findPreventivePlanById(database, planId);
  if (!plan) throw notFound('Preventive plan not found', 'PREVENTIVE_PLAN_NOT_FOUND');
  if (!user || user.role === 'admin') return plan;
  if (user.role === 'operator') {
    throw forbidden('Preventive plans are not available to operators');
  }
  if (user.role === 'technician' && plan.assignedToId !== user.id) {
    throw forbidden('Only the assigned technician can view this preventive plan');
  }
  return plan;
}

export async function listManagedPreventivePlans(database, filters = {}, user) {
  if (user?.role === 'operator') {
    throw forbidden('Preventive plans are not available to operators');
  }
  const scopedFilters = { ...filters };
  if (user?.role === 'technician') {
    scopedFilters.assignedTo = user.id;
  }
  return listPreventivePlans(database, scopedFilters);
}

export async function createPreventivePlan(database, payload, user) {
  const data = validatePreventivePlanPayload(payload);
  const machine = await findMachineById(database, data.machineId);
  if (!machine) throw notFound('Machine not found', 'MACHINE_NOT_FOUND');
  const technician = await requireTechnician(database, data.assignedTo);
  const timestamp = new Date().toISOString();

  return transaction(database, async () => {
    const code = await generateDocumentCode(database, 'preventivePlan');
    const planId = await insertPreventivePlan(database, {
      code,
      machineId: machine.id,
      name: data.name,
      frequency: data.frequency,
      assignedTo: technician.id,
      nextDueDate: data.nextDueDate,
      nextDueRuntimeHours: data.frequency === 'working_hours'
        ? data.runtimeHours + data.intervalHours
        : null,
      intervalHours: data.frequency === 'working_hours' ? data.intervalHours : null,
      createdBy: user.id,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    for (const item of data.checklist) {
      await insertChecklistItem(database, {
        planId,
        position: item.position,
        title: item.title,
        measurementLabel: item.measurementLabel,
      });
    }

    return findPreventivePlanById(database, planId);
  });
}

export function calculateNextDueDate(fromDate, frequency, intervalHours = null) {
  switch (frequency) {
    case 'weekly':
      return addUtcDays(fromDate, 7);
    case 'monthly':
      return addCalendarMonths(fromDate, 1);
    case 'quarterly':
      return addCalendarMonths(fromDate, 3);
    case 'semiannual':
      return addCalendarMonths(fromDate, 6);
    case 'annual':
      return addCalendarMonths(fromDate, 12);
    case 'working_hours': {
      if (!Number.isFinite(intervalHours) || intervalHours <= 0) {
        throw validationError('Working-hours preventive plans require a positive intervalHours');
      }
      return addWorkingDays(fromDate, Math.ceil(intervalHours / 8));
    }
    default:
      throw validationError(`Unsupported preventive plan frequency: ${frequency}`);
  }
}

function validateChecklistResults(plan, results) {
  const definitions = new Map(plan.checklistItems.map((item) => [item.id, item]));
  const supplied = new Map();

  for (const result of results) {
    if (supplied.has(result.itemId)) {
      throw validationError(`Checklist item ${result.itemId} was supplied more than once`);
    }
    const definition = definitions.get(result.itemId);
    if (!definition) {
      throw validationError(`Checklist item ${result.itemId} does not belong to this preventive plan`);
    }
    if (definition.measurementLabel && result.measurementValue === null) {
      throw validationError(`Checklist item ${definition.id} requires measurementValue for ${definition.measurementLabel}`);
    }
    supplied.set(result.itemId, { ...result, title: definition.title });
  }

  const missing = plan.checklistItems.filter((item) => !supplied.has(item.id));
  if (missing.length) {
    throw validationError(
      `Every checklist item must be completed; missing item ids: ${missing.map((item) => item.id).join(', ')}`,
    );
  }
  return Array.from(supplied.values());
}

function assertCanComplete(plan, user) {
  if (user?.role === 'admin') return;
  if (user?.role !== 'technician') {
    throw forbidden('Only the assigned technician or a maintenance manager can complete this preventive plan');
  }
  if (plan.assignedToId !== user.id) {
    throw forbidden('Only the assigned technician can complete this preventive plan');
  }
}

export async function listPreventiveCompletions(database, planId, user) {
  const plan = await getPreventivePlanOrThrow(database, planId, user);
  return listExecutionsByPlanId(database, plan.id);
}

export async function completePreventivePlan(database, planId, payload, user) {
  const data = validatePreventiveCompletionPayload(payload);

  return transaction(database, async () => {
    const plan = await findPreventivePlanById(database, planId);
    if (!plan) throw notFound('Preventive plan not found', 'PREVENTIVE_PLAN_NOT_FOUND');
    assertCanComplete(plan, user);
    const checklistResults = validateChecklistResults(plan, data.checklistResults);

    if (plan.frequency === 'working_hours' && data.runtimeHours === undefined) {
      throw validationError('Working-hours preventive completions require runtimeHours');
    }

    const completedAt = new Date().toISOString();
    const completionDate = completedAt.slice(0, 10);
    const nextDueDate = calculateNextDueDate(
      completionDate,
      plan.frequency,
      plan.intervalHours,
    );
    const nextDueRuntimeHours = plan.frequency === 'working_hours'
      ? data.runtimeHours + plan.intervalHours
      : null;
    const executionCode = await nextExecutionCode(database, plan.code);
    const executionId = await insertExecution(database, {
      code: executionCode,
      planId: plan.id,
      completedBy: user.id,
      completedAt,
      notes: data.notes,
      runtimeHours: plan.frequency === 'working_hours' ? data.runtimeHours : null,
      nextDueDate,
      nextDueRuntimeHours,
    });

    for (const result of checklistResults) {
      await insertExecutionItem(database, {
        executionId,
        itemId: result.itemId,
        title: result.title,
        completed: true,
        measurementValue: result.measurementValue,
        note: result.note,
      });
    }

    await insertRecord(database, {
      machineId: plan.machineId,
      type: 'maintenance',
      description: `${plan.code} - ${plan.name} önleyici bakımı tamamlandı (${plan.checklistItems.length}/${plan.checklistItems.length} kontrol).`,
      severity: null,
      createdBy: user.id,
      createdAt: completedAt,
    });

    await updatePreventivePlanAfterCompletion(database, plan.id, {
      nextDueDate,
      nextDueRuntimeHours,
      intervalHours: plan.intervalHours,
      completedAt,
      updatedAt: completedAt,
    });

    const updatedPlan = await findPreventivePlanById(database, plan.id);
    const completion = await findExecutionById(database, executionId);
    return {
      completion,
      plan: updatedPlan,
    };
  });
}
