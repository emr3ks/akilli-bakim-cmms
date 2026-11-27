import { getMaintenanceAnalyticsData } from '../repositories/maintenance-analytics.js';

function rounded(value, digits = 2) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function average(values) {
  if (!values.length) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function hoursBetween(later, earlier) {
  return (new Date(later).getTime() - new Date(earlier).getTime()) / (1000 * 60 * 60);
}

function machineMetrics(machine, faults, workOrders, usageCosts) {
  const machineFaults = faults
    .filter((fault) => fault.machine_id === machine.id)
    .sort((left, right) => left.created_at.localeCompare(right.created_at));
  const closedWorkOrders = workOrders.filter((workOrder) => (
    workOrder.machine_id === machine.id
    && workOrder.status === 'closed'
    && workOrder.duration_minutes !== null
    && workOrder.duration_minutes !== undefined
    && Number.isFinite(Number(workOrder.duration_minutes))
  ));
  const totalDurationMinutes = closedWorkOrders.reduce(
    (total, workOrder) => total + Number(workOrder.duration_minutes),
    0,
  );
  const intervals = [];
  for (let index = 1; index < machineFaults.length; index += 1) {
    const interval = hoursBetween(machineFaults[index].created_at, machineFaults[index - 1].created_at);
    if (Number.isFinite(interval) && interval >= 0) intervals.push(interval);
  }
  const machineUsageCosts = usageCosts.filter((usage) => usage.machine_id === machine.id);
  const workOrderPartCost = machineUsageCosts
    .filter((usage) => usage.work_order_id !== null)
    .reduce((total, usage) => total + Number(usage.total_cost || 0), 0);
  const preventivePartCost = machineUsageCosts
    .filter((usage) => usage.preventive_plan_id !== null)
    .reduce((total, usage) => total + Number(usage.total_cost || 0), 0);

  const mttrMinutes = rounded(
    average(closedWorkOrders.map((workOrder) => Number(workOrder.duration_minutes))),
  );
  return {
    machineId: machine.id,
    machineCode: machine.code,
    machineName: machine.name,
    line: machine.line,
    criticality: machine.criticality,
    failureCount: machineFaults.length,
    closedWorkOrderCount: closedWorkOrders.length,
    totalInterventionMinutes: totalDurationMinutes,
    mttrMinutes,
    mttrHours: mttrMinutes === null ? null : rounded(mttrMinutes / 60),
    mtbfMinutes: rounded(average(intervals.map((interval) => interval * 60)), 1),
    mtbfHours: rounded(average(intervals)),
    workOrderSparePartCost: rounded(workOrderPartCost),
    preventiveSparePartCost: rounded(preventivePartCost),
    totalSparePartCost: rounded(workOrderPartCost + preventivePartCost),
  };
}

export async function getMaintenanceAnalytics(database) {
  const { machines, faults, workOrders, usageCosts } = await getMaintenanceAnalyticsData(database);
  const metrics = machines.map((machine) => machineMetrics(machine, faults, workOrders, usageCosts));
  const metricsByMachineId = new Map(metrics.map((metric) => [metric.machineId, metric]));

  const facilityIntervals = [];
  for (const machine of machines) {
    const machineFaults = faults
      .filter((fault) => fault.machine_id === machine.id)
      .sort((left, right) => left.created_at.localeCompare(right.created_at));
    for (let index = 1; index < machineFaults.length; index += 1) {
      const interval = hoursBetween(machineFaults[index].created_at, machineFaults[index - 1].created_at);
      if (Number.isFinite(interval) && interval >= 0) facilityIntervals.push(interval);
    }
  }

  const closedWorkOrders = workOrders.filter((workOrder) => (
    workOrder.status === 'closed'
    && workOrder.duration_minutes !== null
    && workOrder.duration_minutes !== undefined
    && Number.isFinite(Number(workOrder.duration_minutes))
  ));
  const totalInterventionMinutes = closedWorkOrders.reduce(
    (total, workOrder) => total + Number(workOrder.duration_minutes),
    0,
  );
  const workOrderPartCost = usageCosts
    .filter((usage) => usage.work_order_id !== null)
    .reduce((total, usage) => total + Number(usage.total_cost || 0), 0);
  const preventivePartCost = usageCosts
    .filter((usage) => usage.preventive_plan_id !== null)
    .reduce((total, usage) => total + Number(usage.total_cost || 0), 0);

  const categoryCounts = new Map([
    ['mechanical', 0],
    ['electrical', 0],
    ['pneumatic_hydraulic', 0],
    ['software_sensor', 0],
    ['other', 0],
  ]);
  for (const fault of faults) {
    categoryCounts.set(fault.category, (categoryCounts.get(fault.category) || 0) + 1);
  }
  const faultCategories = Array.from(categoryCounts.entries())
    .map(([category, count]) => ({
      category,
      count,
      percentage: faults.length ? rounded((count / faults.length) * 100, 1) : 0,
    }))
    .sort((left, right) => right.count - left.count || left.category.localeCompare(right.category));

  const topFailureMachines = metrics
    .filter((metric) => metric.failureCount > 0)
    .sort((left, right) => (
      right.failureCount - left.failureCount
      || left.machineCode.localeCompare(right.machineCode)
    ))
    .slice(0, 5);

  const facilityMttrMinutes = rounded(
    average(closedWorkOrders.map((workOrder) => Number(workOrder.duration_minutes))),
  );
  return {
    generatedAt: new Date().toISOString(),
    summary: {
      machineCount: machines.length,
      failureCount: faults.length,
      closedWorkOrderCount: closedWorkOrders.length,
      totalInterventionMinutes,
      mttrMinutes: facilityMttrMinutes,
      mttrHours: facilityMttrMinutes === null ? null : rounded(facilityMttrMinutes / 60),
      mtbfMinutes: rounded(average(facilityIntervals.map((interval) => interval * 60)), 1),
      mtbfHours: rounded(average(facilityIntervals)),
      workOrderSparePartCost: rounded(workOrderPartCost),
      preventiveSparePartCost: rounded(preventivePartCost),
      totalSparePartCost: rounded(workOrderPartCost + preventivePartCost),
    },
    faultCategories,
    topFailureMachines,
    machineMetrics: Array.from(metricsByMachineId.values()).sort((left, right) => (
      right.failureCount - left.failureCount
      || left.machineCode.localeCompare(right.machineCode)
    )),
    methodology: {
      mtbf: 'Aynı makinedeki kronolojik kanonik arıza bildirimleri arasındaki sürelerin ortalamasıdır; çalışma saati tabanlı gerçek MTBF değildir ve en az iki arıza gerekir.',
      mttr: 'Yalnızca süresi kayıtlı kapatılmış iş emirlerinin müdahale sürelerinin aritmetik ortalamasıdır.',
      cost: 'İade edilmemiş yedek parça kullanımlarının miktar × kullanım anındaki birim maliyet toplamıdır; işçilik maliyeti bu modelde yer almaz.',
    },
  };
}
