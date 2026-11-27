import { transaction } from '../db.js';
import { notFound, validationError } from '../errors.js';
import { insertFault } from '../repositories/faults.js';
import {
  findMachineById,
  findPersistedMachineStatus,
} from '../repositories/machines.js';
import {
  deleteSensorThresholds,
  findActiveSensorAlert,
  findSensorThreshold,
  insertSensorAlert,
  insertSensorReading,
  insertSensorThreshold,
  listActiveSensorAlerts,
  listLatestSensorReadings,
  listSensorThresholds,
} from '../repositories/sensors.js';
import { findWorkOrderById, insertWorkOrder } from '../repositories/work-orders.js';
import {
  validateSensorReadingsPayload,
  validateSensorThresholdsPayload,
} from '../validators.js';
import { generateDocumentCode } from './document-code.js';
import { createNotification } from './notification-service.js';

const sensorLabels = {
  temperature: 'Sıcaklık',
  vibration: 'Titreşim',
  runtime_hours: 'Çalışma saati',
  pressure: 'Basınç',
};

function exceedsThreshold(value, threshold) {
  return threshold.comparison === 'gte'
    ? value >= threshold.criticalThreshold
    : value > threshold.criticalThreshold;
}

export async function isLatestSensorReadingAboveThreshold(database, machineId, sensorType) {
  const threshold = await findSensorThreshold(database, machineId, sensorType);
  if (!threshold || !threshold.enabled) return false;
  const readings = await listLatestSensorReadings(database, machineId);
  const latest = readings.find((reading) => reading.sensorType === sensorType);
  if (!latest) return false;
  return exceedsThreshold(latest.value, threshold);
}

export async function getMachineSensorOverview(database, machineId) {
  const machine = await findMachineById(database, machineId);
  if (!machine) throw notFound('Machine not found', 'MACHINE_NOT_FOUND');
  const [thresholds, readings, alerts] = await Promise.all([
    listSensorThresholds(database, machine.id),
    listLatestSensorReadings(database, machine.id),
    listActiveSensorAlerts(database, machine.id),
  ]);
  return { machine, thresholds, readings, alerts };
}

export async function replaceMachineSensorThresholds(database, machineId, payload) {
  const data = validateSensorThresholdsPayload(payload);
  const machine = await findMachineById(database, machineId);
  if (!machine) throw notFound('Machine not found', 'MACHINE_NOT_FOUND');

  return transaction(database, async () => {
    await deleteSensorThresholds(database, machine.id);
    const thresholds = [];
    for (const threshold of data.thresholds) {
      thresholds.push(await insertSensorThreshold(database, {
        ...threshold,
        machineId: machine.id,
      }));
    }
    return {
      machine,
      thresholds,
      readings: await listLatestSensorReadings(database, machine.id),
      alerts: await listActiveSensorAlerts(database, machine.id),
    };
  });
}

export async function recordMachineSensorReadings(database, machineId, payload, user) {
  const data = validateSensorReadingsPayload(payload);
  const machine = await findMachineById(database, machineId);
  if (!machine) throw notFound('Machine not found', 'MACHINE_NOT_FOUND');

  return transaction(database, async () => {
    const readings = [];
    const createdAlerts = [];
    let latestWorkOrder = null;

    for (const reading of data.readings) {
      const threshold = await findSensorThreshold(database, machine.id, reading.sensorType);
      if (!threshold) {
        throw validationError(
          `No sensor threshold is configured for ${reading.sensorType}`,
          { sensorType: reading.sensorType },
        );
      }

      const recorded = await insertSensorReading(database, {
        machineId: machine.id,
        sensorType: reading.sensorType,
        value: reading.value,
        unit: threshold.unit,
        source: data.source,
        recordedBy: user.id,
        recordedAt: new Date().toISOString(),
      });
      readings.push(recorded);

      if (!threshold.enabled || !exceedsThreshold(reading.value, threshold)) continue;

      const existingAlert = await findActiveSensorAlert(
        database,
        machine.id,
        reading.sensorType,
      );
      if (existingAlert) continue;

      const timestamp = new Date().toISOString();
      const label = sensorLabels[reading.sensorType] ?? reading.sensorType;
      const faultCode = await generateDocumentCode(database, 'fault');
      const fault = await insertFault(database, {
        code: faultCode,
        machineId: machine.id,
        title: `${label} sensörü kritik eşiği aştı`,
        category: 'software_sensor',
        urgency: 'high',
        description: `${label} değeri ${reading.value} ${threshold.unit} olarak kaydedildi. Kritik eşik: ${threshold.comparison === 'gte' ? '≥' : '>'} ${threshold.criticalThreshold} ${threshold.unit}.`,
        status: 'open',
        reportedBy: user.id,
        createdAt: timestamp,
      });

      const workOrderCode = await generateDocumentCode(database, 'workOrder');
      const workOrder = await insertWorkOrder(database, {
        code: workOrderCode,
        faultId: fault.id,
        assignedTo: null,
        status: 'open',
        createdBy: user.id,
        createdAt: timestamp,
      });
      latestWorkOrder = workOrder;

      const priorMachineStatus = await findPersistedMachineStatus(database, machine.id);
      const alert = await insertSensorAlert(database, {
        machineId: machine.id,
        sensorType: reading.sensorType,
        value: reading.value,
        thresholdValue: threshold.criticalThreshold,
        unit: threshold.unit,
        comparison: threshold.comparison,
        faultId: fault.id,
        workOrderId: workOrder.id,
        priorMachineStatus,
        createdBy: user.id,
        createdAt: timestamp,
      });
      createdAlerts.push(alert);

      await createNotification(database, {
        type: 'sensor_threshold',
        title: `${machine.code} sensör eşiği aşıldı`,
        message: `${label} ${reading.value} ${threshold.unit}; ${workOrder.code} kestirimci bakım iş emri oluşturuldu.`,
        severity: 'critical',
        dedupeKey: `sensor-alert:${alert.id}`,
        createdAt: timestamp,
      });
    }

    const [updatedMachine, alerts] = await Promise.all([
      findMachineById(database, machine.id),
      listActiveSensorAlerts(database, machine.id),
    ]);
    return {
      readings,
      alerts: createdAlerts.length ? createdAlerts : alerts,
      machine: updatedMachine,
      workOrder: latestWorkOrder
        ? await findWorkOrderById(database, latestWorkOrder.id)
        : null,
    };
  });
}

