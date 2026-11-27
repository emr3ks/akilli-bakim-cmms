import { ApiError, notFound } from '../errors.js';
import { findFaultById } from '../repositories/faults.js';
import { findMachineById } from '../repositories/machines.js';
import { findExecutionById } from '../repositories/preventive-plans.js';
import {
  listPreventivePlanStockUsages,
  listWorkOrderStockUsages,
} from '../repositories/spare-parts.js';
import { getPreventivePlanOrThrow } from './preventive-plan-service.js';
import { getWorkOrderOrThrow } from './work-order-service.js';

function reportParts(usages) {
  return usages.map((usage) => ({
    id: usage.id,
    partId: usage.partId,
    code: usage.part.code,
    name: usage.part.name,
    quantity: usage.quantity,
    unit: usage.part.unit,
    unitCost: usage.unitCost,
    totalCost: usage.totalCost,
  }));
}

function reportPartTotal(parts) {
  return parts.reduce((total, part) => total + Number(part.totalCost || 0), 0);
}

export async function getWorkOrderServiceReport(database, workOrderId, user) {
  const workOrder = await getWorkOrderOrThrow(database, workOrderId, user);
  if (!['resolved', 'closed'].includes(workOrder.status)) {
    throw new ApiError(
      409,
      'A service report can only be created for a completed work order',
      'WORK_ORDER_NOT_COMPLETED',
    );
  }

  const [machine, fault, usages] = await Promise.all([
    findMachineById(database, workOrder.machine.id),
    findFaultById(database, workOrder.faultId),
    listWorkOrderStockUsages(database, workOrder.id),
  ]);
  if (!machine) throw notFound('Machine not found', 'MACHINE_NOT_FOUND');
  if (!fault) throw notFound('Fault not found', 'FAULT_NOT_FOUND');

  const parts = reportParts(usages);
  return {
    report: {
      kind: 'work_order',
      documentCode: workOrder.code,
      title: 'Teknik Servis Formu',
      generatedAt: new Date().toISOString(),
      machine,
      workOrder: {
        id: workOrder.id,
        code: workOrder.code,
        status: workOrder.status,
        interventionNote: workOrder.interventionNote,
        rootCause: workOrder.rootCause,
        durationMinutes: workOrder.durationMinutes,
        assignedTo: workOrder.assignedTo,
        startedAt: workOrder.startedAt,
        closedAt: workOrder.closedAt,
        createdAt: workOrder.createdAt,
      },
      fault: {
        id: fault.id,
        code: fault.code,
        title: fault.title,
        category: fault.category,
        urgency: fault.urgency,
        description: fault.description,
        status: fault.status,
        reportedBy: fault.reportedBy,
        createdAt: fault.createdAt,
      },
      parts,
      partsScope: 'work_order',
      totals: {
        partsCost: reportPartTotal(parts),
      },
    },
  };
}

export async function getPreventiveServiceReport(database, planId, executionId, user) {
  const plan = await getPreventivePlanOrThrow(database, planId, user);
  const execution = await findExecutionById(database, executionId);
  if (!execution || execution.planId !== plan.id) {
    throw notFound('Preventive maintenance completion not found', 'PREVENTIVE_COMPLETION_NOT_FOUND');
  }

  const [machine, usages] = await Promise.all([
    findMachineById(database, plan.machineId),
    listPreventivePlanStockUsages(database, plan.id),
  ]);
  if (!machine) throw notFound('Machine not found', 'MACHINE_NOT_FOUND');

  const parts = reportParts(usages);
  return {
    report: {
      kind: 'preventive',
      documentCode: execution.code,
      title: 'Periyodik Bakım Servis Formu',
      generatedAt: new Date().toISOString(),
      machine,
      preventive: {
        planId: plan.id,
        planCode: plan.code,
        name: plan.name,
        frequency: plan.frequency,
        assignedTo: plan.assignedTo,
        completionId: execution.id,
        completionCode: execution.code,
        completedAt: execution.completedAt,
        completedBy: execution.completedByUser,
        notes: execution.notes,
        runtimeHours: execution.runtimeHours,
        nextDueDate: execution.nextDueDate,
        nextDueRuntimeHours: execution.nextDueRuntimeHours,
        results: execution.results,
      },
      parts,
      partsScope: 'preventive_plan',
      totals: {
        partsCost: reportPartTotal(parts),
      },
    },
  };
}
