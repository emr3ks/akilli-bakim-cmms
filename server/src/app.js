import cors from 'cors';
import express from 'express';

import { createDatabase, DEFAULT_DB_PATH, initializeDatabase } from './db.js';
import { asyncHandler, forbidden, notFound, validationError } from './errors.js';
import { authenticate, requireRole } from './middleware/auth.js';
import { getStatusCounts, findMachineByCode, listMachines } from './repositories/machines.js';
import { findUserById, listUsers } from './repositories/users.js';
import {
  createMachine,
  deleteMachineById,
  getMachineOrThrow,
  updateMachineById,
} from './services/machine-service.js';
import {
  createMachineRecord,
  listMachineRecords,
} from './services/record-service.js';
import {
  createFault,
  getFaultOrThrow,
  listFaultRecords,
} from './services/fault-service.js';
import {
  assignWorkOrder,
  createWorkOrder,
  getWorkOrderOrThrow,
  listManagedWorkOrders,
  updateWorkOrderStatus,
} from './services/work-order-service.js';
import {
  validateFaultFilters,
  validateMachineFilters,
  validateRecordPayload,
  validateWorkOrderFilters,
} from './validators.js';

function parsePositiveId(value, label = 'Resource id') {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) {
    throw validationError(`${label} must be a positive integer`);
  }
  return id;
}

function parseMachineId(value) {
  return parsePositiveId(value, 'Machine id');
}

function prepareDatabase(input, dbPath) {
  if (!input) {
    return createDatabase(dbPath || process.env.CMMS_DB_PATH || DEFAULT_DB_PATH);
  }
  if (typeof input === 'string') {
    return createDatabase(input);
  }
  if (typeof input.then === 'function') {
    return input.then(async (database) => {
      if (!database) throw new TypeError('A sqlite3 database connection is required');
      await initializeDatabase(database);
      return database;
    });
  }
  return initializeDatabase(input).then(() => input);
}

/**
 * Create the CMMS API. A sqlite3 connection can be supplied for tests or for
 * an embedding process; otherwise the persistent default database is opened.
 * `app.ready` resolves after the schema is ready, while the request middleware
 * also awaits it so callers do not need a special startup sequence.
 */
export function createApp(options = {}) {
  const app = express();
  const databasePromise = prepareDatabase(options.db, options.dbPath);

  app.locals.db = options.db && typeof options.db !== 'string' && typeof options.db.then !== 'function'
    ? options.db
    : null;
  app.ready = databasePromise.then((database) => {
    app.locals.db = database;
    return database;
  });
  app.locals.ready = app.ready;

  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  app.use(asyncHandler(async (request, response, next) => {
    request.db = await app.ready;
    next();
  }));

  const api = express.Router();

  api.get('/health', (request, response) => {
    response.json({ ok: true });
  });

  api.get('/auth/demo-users', asyncHandler(async (request, response) => {
    const users = await listUsers(request.db);
    response.json({ users });
  }));

  api.post('/auth/login', asyncHandler(async (request, response) => {
    const body = request.body;
    if (!body || typeof body !== 'object' || body.userId === undefined || body.userId === null || body.userId === '') {
      throw validationError('userId is required');
    }
    const user = await findUserById(request.db, body.userId);
    if (!user) throw notFound('User not found', 'USER_NOT_FOUND');
    response.json({ user });
  }));

  // Every operational endpoint requires a known local user identified by the
  // x-user-id header. The demo-user list and login remain public bootstrap APIs.
  api.use(authenticate);

  api.get('/dashboard/summary', asyncHandler(async (request, response) => {
    response.json(await getStatusCounts(request.db));
  }));

  api.get('/faults', asyncHandler(async (request, response) => {
    const filters = validateFaultFilters(request.query);
    const faults = await listFaultRecords(request.db, filters);
    response.json({ faults });
  }));

  api.get('/faults/:id', asyncHandler(async (request, response) => {
    const faultId = parsePositiveId(request.params.id, 'Fault id');
    const fault = await getFaultOrThrow(request.db, faultId);
    response.json({ fault });
  }));

  api.post('/faults', asyncHandler(async (request, response) => {
    const fault = await createFault(request.db, request.body, request.user);
    response.status(201).json({ fault });
  }));

  api.post('/machines/:id/faults', asyncHandler(async (request, response) => {
    const machineId = parseMachineId(request.params.id);
    const fault = await createFault(
      request.db,
      { ...(request.body || {}), machineId },
      request.user,
    );
    response.status(201).json({ fault });
  }));

  api.get('/work-orders', asyncHandler(async (request, response) => {
    const filters = validateWorkOrderFilters(request.query);
    const workOrders = await listManagedWorkOrders(request.db, filters);
    response.json({ workOrders });
  }));

  api.get('/work-orders/:id', asyncHandler(async (request, response) => {
    const workOrderId = parsePositiveId(request.params.id, 'Work order id');
    const workOrder = await getWorkOrderOrThrow(request.db, workOrderId);
    response.json({ workOrder });
  }));

  api.post('/work-orders', requireRole('admin'), asyncHandler(async (request, response) => {
    const workOrder = await createWorkOrder(request.db, request.body, request.user);
    response.status(201).json({ workOrder });
  }));

  api.post('/faults/:faultId/work-orders', requireRole('admin'), asyncHandler(async (request, response) => {
    const faultId = parsePositiveId(request.params.faultId, 'Fault id');
    const workOrder = await createWorkOrder(
      request.db,
      { ...(request.body || {}), faultId },
      request.user,
    );
    response.status(201).json({ workOrder });
  }));

  const assignWorkOrderHandler = asyncHandler(async (request, response) => {
    const workOrderId = parsePositiveId(request.params.id, 'Work order id');
    const workOrder = await assignWorkOrder(request.db, workOrderId, request.body);
    response.json({ workOrder });
  });
  api.post('/work-orders/:id/assign', requireRole('admin'), assignWorkOrderHandler);
  api.patch('/work-orders/:id/assign', requireRole('admin'), assignWorkOrderHandler);

  api.patch(
    '/work-orders/:id/status',
    requireRole('admin', 'technician'),
    asyncHandler(async (request, response) => {
      const workOrderId = parsePositiveId(request.params.id, 'Work order id');
      const workOrder = await updateWorkOrderStatus(
        request.db,
        workOrderId,
        request.body,
        request.user,
      );
      response.json({ workOrder });
    }),
  );

  api.get('/machines', asyncHandler(async (request, response) => {
    const filters = validateMachineFilters(request.query);
    const machines = await listMachines(request.db, filters);
    response.json({ machines });
  }));

  // Keep the code route before /machines/:id so a code is never parsed as an id.
  api.get('/machines/code/:code', asyncHandler(async (request, response) => {
    const machine = await findMachineByCode(request.db, request.params.code);
    if (!machine) throw notFound('Machine not found', 'MACHINE_NOT_FOUND');
    response.json({ machine });
  }));

  api.get('/machines/:id', asyncHandler(async (request, response) => {
    const machineId = parseMachineId(request.params.id);
    const machine = await getMachineOrThrow(request.db, machineId);
    response.json({ machine });
  }));

  api.post('/machines', requireRole('admin'), asyncHandler(async (request, response) => {
    const machine = await createMachine(request.db, request.body);
    response.status(201).json({ machine });
  }));

  api.put('/machines/:id', requireRole('admin'), asyncHandler(async (request, response) => {
    const machineId = parseMachineId(request.params.id);
    const machine = await updateMachineById(request.db, machineId, request.body);
    response.json({ machine });
  }));

  api.delete('/machines/:id', requireRole('admin'), asyncHandler(async (request, response) => {
    const machineId = parseMachineId(request.params.id);
    const deletedMachine = await deleteMachineById(request.db, machineId);
    response.json({ deleted: true, id: deletedMachine.id });
  }));

  api.get('/machines/:id/maintenance-records', asyncHandler(async (request, response) => {
    const machineId = parseMachineId(request.params.id);
    const records = await listMachineRecords(request.db, machineId, 'maintenance');
    response.json({ records });
  }));

  api.post('/machines/:id/maintenance-records', asyncHandler(async (request, response) => {
    const machineId = parseMachineId(request.params.id);
    const data = validateRecordPayload(request.body);

    // Operators can report faults, but only admins and technicians can perform
    // planned maintenance through this endpoint.
    if (request.user.role === 'operator' && data.type !== 'fault') {
      throw forbidden('Operators may only create fault records');
    }
    if (!['admin', 'technician', 'operator'].includes(request.user.role)) {
      throw forbidden('This action is not available for the current role');
    }

    const record = await createMachineRecord(request.db, machineId, data, request.user);
    response.status(201).json({ record });
  }));

  api.get('/machines/:id/fault-records', asyncHandler(async (request, response) => {
    const machineId = parseMachineId(request.params.id);
    const records = await listMachineRecords(request.db, machineId, 'fault');
    response.json({ records });
  }));

  api.post('/machines/:id/fault-records', asyncHandler(async (request, response) => {
    const machineId = parseMachineId(request.params.id);
    const data = validateRecordPayload(request.body, { requiredType: false });
    const record = await createMachineRecord(request.db, machineId, data, request.user, { requireType: false });
    response.status(201).json({ record });
  }));

  app.use('/api', api);

  app.use((request, response) => {
    response.status(404).json({ error: { message: 'Route not found', code: 'NOT_FOUND' } });
  });

  app.use((error, request, response, next) => {
    if (response.headersSent) {
      next(error);
      return;
    }

    if (error?.type === 'entity.too.large') {
      response.status(413).json({
        error: {
          message: 'Request body is too large',
          code: 'PAYLOAD_TOO_LARGE',
        },
      });
      return;
    }

    if (error?.type === 'entity.parse.failed') {
      response.status(400).json({ error: { message: 'Request body must contain valid JSON', code: 'INVALID_JSON' } });
      return;
    }

    const status = Number.isInteger(error?.status) ? error.status : 500;
    const message = status >= 500 ? 'Internal server error' : (error?.message || 'Request failed');
    const body = { error: { message } };
    if (error?.code) body.error.code = error.code;
    if (error?.details && status < 500) body.error.details = error.details;
    response.status(status).json(body);
  });

  return app;
}

export default createApp;
