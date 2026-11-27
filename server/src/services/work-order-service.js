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
import {
  findSensorAlertByWorkOrderId,
  resolveSensorAlert,
} from '../repositories/sensors.js';
import { generateDocumentCode } from './document-code.js';
import { isLatestSensorReadingAboveThreshold } from './sensor-service.js';
import { createNotification } from './notification-service.js';

const ALLOWED_TRANSITIONS = {
  open: ['assigned'],
  assigned: ['in_progress'],
  in_progress: ['waiting_parts', 'resolved'],
  waiting_parts: ['in_progress', 'resolved'],
  resolved: ['closed'],
  closed: [],
};

export async function getWorkOrderOrThrow(database, workOrderId, user) {
  const workOrder = await findWorkOrderById(database, workOrderId);
  if (!workOrder) throw notFound('Work order not found', 'WORK_ORDER_NOT_FOUND');
  if (!user || user.role === 'admin') return workOrder;
  if (user.role === 'operator') {
    throw forbidden('Work orders are not available to operators');
  }
  if (user.role === 'technician' && workOrder.assignedTo?.id !== user.id) {
    throw forbidden('Only the assigned technician can view this work order');
  }
  return workOrder;
}

export async function listManagedWorkOrders(database, filters = {}, user) {
  if (user?.role === 'operator') {
    throw forbidden('Work orders are not available to operators');
  }
  const scopedFilters = { ...filters };
  if (user?.role === 'technician') {
    scopedFilters.assignedTo = user.id;
  }
  return listWorkOrders(database, scopedFilters);
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
    if (technician) {
      await createNotification(database, {
        type: 'work_order_assignment',
        title: `${technician.name} adına yeni iş emri`,
        message: `${created.code} iş emri ${fault.machine.code} · ${fault.title} için ${technician.name} adına atandı.`,
        severity: 'warning',
        dedupeKey: `work-order-assignment:${created.id}`,
        createdAt: timestamp,
      });
    }
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

    const assignedAt = new Date().toISOString();
    const updated = await updateWorkOrder(database, workOrder.id, {
      assignedTo: technician.id,
      status: 'assigned',
      assignedAt,
    });
    await createNotification(database, {
      type: 'work_order_assignment',
      title: `${technician.name} adına yeni iş emri`,
      message: `${workOrder.code} iş emri ${workOrder.machine.code} · ${workOrder.fault.title} için ${technician.name} adına atandı.`,
      severity: 'warning',
      dedupeKey: `work-order-assignment:${updated.id}`,
      createdAt: assignedAt,
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
  const existingSolutionPhoto = workOrder.solutionPhoto
    ?? (workOrder.solutionPhotoBase64 && workOrder.solutionPhotoMimeType
      ? `data:${workOrder.solutionPhotoMimeType};base64,${workOrder.solutionPhotoBase64}`
      : null);
  const completion = {
    interventionNote: data.interventionNote ?? workOrder.interventionNote,
    rootCause: data.rootCause ?? workOrder.rootCause,
    durationMinutes: data.durationMinutes ?? workOrder.durationMinutes,
    solutionPhoto: data.solutionPhoto ?? existingSolutionPhoto,
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

    const sensorAlert = data.status === 'resolved' || data.status === 'closed'
      ? await findSensorAlertByWorkOrderId(database, workOrder.id)
      : null;
    if (sensorAlert?.status === 'active') {
      const stillAboveThreshold = await isLatestSensorReadingAboveThreshold(
        database,
        workOrder.machine.id,
        sensorAlert.sensorType,
      );
      if (stillAboveThreshold) {
        throw new ApiError(
          409,
          'The latest sensor reading is still above its critical threshold; record a reading below the threshold before resolving this work order',
          'SENSOR_THRESHOLD_STILL_EXCEEDED',
        );
      }
    }

    const requiresCompletion = data.status === 'resolved' || data.status === 'closed';
    const closingStatus = data.status === 'closed';
    const completion = requiresCompletion
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
    if (closingStatus) {
      updates.closedAt = workOrder.closedAt || timestamp;
    }

    const updated = await updateWorkOrder(database, workOrder.id, updates);
    if (data.status === 'resolved' || data.status === 'closed') {
      if (sensorAlert?.status === 'active') {
        await resolveSensorAlert(database, sensorAlert.id, {
          resolvedBy: user.id,
          resolvedAt: timestamp,
        });
      }
    }
    if (closingStatus) {
      await updateFaultStatus(database, workOrder.faultId, 'resolved');
      const otherCriticalFault = await hasOtherOpenCriticalFault(
        database,
        workOrder.machine.id,
        workOrder.faultId,
      );
      if (workOrder.machine.status === 'faulted' && !otherCriticalFault) {
        await setMachineStatus(database, workOrder.machine.id, 'running');
      }
    }
    return findWorkOrderById(database, updated.id);
  });
}
