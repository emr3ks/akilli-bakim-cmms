import { transaction } from '../db.js';
import { ApiError, forbidden, notFound, validationError } from '../errors.js';
import { findUserById } from '../repositories/users.js';
import { setMachineStatus } from '../repositories/machines.js';
import {
  findFaultById,
  hasOtherOpenCriticalFault,
  updateFaultStatus,
} from '../repositories/faults.js';
import {
  findWorkOrderByFaultId,
  findWorkOrderById,
  insertWorkOrder,
  listWorkOrders,
  updateWorkOrder,
} from '../repositories/work-orders.js';
import {
  validateAssignmentPayload,
  validateWorkOrderPayload,
  validateWorkOrderStatusPayload,
} from '../validators.js';
import { generateDocumentCode } from './document-code.js';

const ALLOWED_TRANSITIONS = {
  open: ['assigned'],
  assigned: ['in_progress'],
  in_progress: ['waiting_parts', 'resolved'],
  waiting_parts: ['in_progress', 'resolved'],
  resolved: ['closed'],
  closed: [],
};

export async function getWorkOrderOrThrow(database, workOrderId) {
  const workOrder = await findWorkOrderById(database, workOrderId);
  if (!workOrder) throw notFound('Work order not found', 'WORK_ORDER_NOT_FOUND');
  return workOrder;
}

export async function listManagedWorkOrders(database, filters = {}) {
  return listWorkOrders(database, filters);
}

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

export async function createWorkOrder(database, payload, user) {
  const data = validateWorkOrderPayload(payload);
  const technician = data.assignedTo
    ? await requireTechnician(database, data.assignedTo)
    : null;
  const timestamp = new Date().toISOString();

  return transaction(database, async () => {
    const fault = await findFaultById(database, data.faultId);
    if (!fault) throw notFound('Fault not found', 'FAULT_NOT_FOUND');
    if (fault.status !== 'open') {
      throw new ApiError(409, 'Only an open fault can be converted to a work order', 'FAULT_NOT_OPEN');
    }

    const existing = await findWorkOrderByFaultId(database, fault.id);
    if (existing) {
      throw new ApiError(409, 'This fault already has a work order', 'WORK_ORDER_ALREADY_EXISTS');
    }

    const code = await generateDocumentCode(database, 'workOrder');
    const created = await insertWorkOrder(database, {
      code,
      faultId: fault.id,
      assignedTo: technician?.id ?? null,
      status: technician ? 'assigned' : 'open',
      createdBy: user.id,
      assignedAt: technician ? timestamp : null,
      createdAt: timestamp,
    });
    return findWorkOrderById(database, created.id);
  });
}

export async function assignWorkOrder(database, workOrderId, payload) {
  const data = validateAssignmentPayload(payload);
  const technician = await requireTechnician(database, data.assignedTo);

  return transaction(database, async () => {
    const workOrder = await getWorkOrderOrThrow(database, workOrderId);
    if (workOrder.status !== 'open') {
      throw new ApiError(
        409,
        `A work order in ${workOrder.status} status cannot be assigned`,
        'INVALID_STATUS_TRANSITION',
      );
    }

    const updated = await updateWorkOrder(database, workOrder.id, {
      assignedTo: technician.id,
      status: 'assigned',
      assignedAt: new Date().toISOString(),
    });
    return findWorkOrderById(database, updated.id);
  });
}

function assertCanProgress(workOrder, user) {
  if (user.role === 'admin') return;
  if (user.role !== 'technician') {
    throw forbidden('Only the assigned technician or a maintenance manager can update a work order');
  }
  if (workOrder.assignedTo?.id !== user.id) {
    throw forbidden('Only the assigned technician can update this work order');
  }
}

function assertValidTransition(workOrder, nextStatus) {
  const allowed = ALLOWED_TRANSITIONS[workOrder.status] || [];
  if (!allowed.includes(nextStatus)) {
    throw new ApiError(
      409,
      `Cannot move a work order from ${workOrder.status} to ${nextStatus}`,
      'INVALID_STATUS_TRANSITION',
    );
  }
}

function mergeCompletion(workOrder, data) {
  const completion = {
    interventionNote: data.interventionNote ?? workOrder.interventionNote,
    rootCause: data.rootCause ?? workOrder.rootCause,
    durationMinutes: data.durationMinutes ?? workOrder.durationMinutes,
    solutionPhoto: data.solutionPhoto ?? workOrder.solutionPhoto,
  };

  if (completion.interventionNote === null || completion.rootCause === null
    || completion.durationMinutes === null || completion.solutionPhoto === null) {
    throw validationError(
      'Final work-order updates require interventionNote, rootCause, durationMinutes, and solutionPhoto',
    );
  }

  return completion;
}

export async function updateWorkOrderStatus(database, workOrderId, payload, user) {
  const data = validateWorkOrderStatusPayload(payload);
  if (data.status === 'open' || data.status === 'assigned') {
    throw new ApiError(
      409,
      'Use the assignment endpoint to move a work order to assigned status',
      'INVALID_STATUS_TRANSITION',
    );
  }

  return transaction(database, async () => {
    const workOrder = await getWorkOrderOrThrow(database, workOrderId);
    assertValidTransition(workOrder, data.status);
    assertCanProgress(workOrder, user);

    const finalStatus = data.status === 'resolved' || data.status === 'closed';
    const completion = finalStatus
      ? mergeCompletion(workOrder, data)
      : {
          ...(data.interventionNote !== undefined ? { interventionNote: data.interventionNote } : {}),
          ...(data.rootCause !== undefined ? { rootCause: data.rootCause } : {}),
          ...(data.durationMinutes !== undefined ? { durationMinutes: data.durationMinutes } : {}),
          ...(data.solutionPhoto !== undefined ? { solutionPhoto: data.solutionPhoto } : {}),
        };

    const timestamp = new Date().toISOString();
    const updates = {
      ...completion,
      status: data.status,
    };
    if (data.status === 'in_progress' && !workOrder.startedAt) {
      updates.startedAt = timestamp;
    }
    if (finalStatus) {
      updates.closedAt = workOrder.closedAt || timestamp;
    }

    const updated = await updateWorkOrder(database, workOrder.id, updates);
    if (finalStatus) {
      await updateFaultStatus(database, workOrder.faultId, 'resolved');
      const otherCriticalFault = await hasOtherOpenCriticalFault(
        database,
        workOrder.machine.id,
        workOrder.faultId,
      );
      if (!otherCriticalFault) {
        await setMachineStatus(database, workOrder.machine.id, 'running');
      }
    }
    return findWorkOrderById(database, updated.id);
  });
}
