export type Role = 'admin' | 'technician' | 'operator';
export type Criticality = 'high' | 'medium' | 'low';
export type MachineStatus = 'running' | 'maintenance' | 'faulted' | 'stopped';
export type RecordType = 'maintenance' | 'fault';
export type FaultCategory =
  | 'mechanical'
  | 'electrical'
  | 'pneumatic_hydraulic'
  | 'software_sensor'
  | 'other';
export type FaultUrgency = 'critical' | 'high' | 'medium' | 'low';
export type FaultStatus = 'open' | 'resolved';
export type WorkOrderStatus =
  | 'open'
  | 'assigned'
  | 'in_progress'
  | 'waiting_parts'
  | 'resolved'
  | 'closed';
export type SparePartCategory =
  | 'bearing'
  | 'belt_sprocket'
  | 'sensor_automation'
  | 'hydraulic_pneumatic'
  | 'electrical'
  | 'consumable';
export type SparePartUnit = 'piece' | 'meter' | 'liter' | 'set';
export type SparePartStatus = 'sufficient' | 'critical' | 'depleted';
export type StockMovementType = 'in' | 'out' | 'return';

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
  initials: string;
}

export interface Machine {
  id: number;
  code: string;
  name: string;
  line: string;
  brand: string;
  model: string;
  serialNumber: string;
  criticality: Criticality;
  status: MachineStatus;
  qrCode: string;
  currentRuntimeHours: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface MachineInput {
  code: string;
  name: string;
  line: string;
  brand: string;
  model: string;
  serialNumber: string;
  criticality: Criticality;
  status: MachineStatus;
}

export interface DashboardSummary {
  total: number;
  running: number;
  maintenance: number;
  faulted: number;
  stopped: number;
  openFaults: number;
  activeWorkOrders: number;
  duePreventive: number;
  upcomingPreventive: number;
  overduePreventive: number;
  criticalStockParts: number;
}

export interface MaintenanceAnalyticsSummary {
  machineCount: number;
  failureCount: number;
  closedWorkOrderCount: number;
  totalInterventionMinutes: number;
  mtbfMinutes: number | null;
  mtbfHours: number | null;
  mttrMinutes: number | null;
  mttrHours: number | null;
  workOrderSparePartCost: number;
  preventiveSparePartCost: number;
  totalSparePartCost: number;
}

export interface MachineMaintenanceMetrics {
  machineId: number;
  machineCode: string;
  machineName: string;
  line: string;
  criticality: Criticality;
  failureCount: number;
  closedWorkOrderCount: number;
  totalInterventionMinutes: number;
  mttrMinutes: number | null;
  mttrHours: number | null;
  mtbfMinutes: number | null;
  mtbfHours: number | null;
  workOrderSparePartCost: number;
  preventiveSparePartCost: number;
  totalSparePartCost: number;
}

export interface MaintenanceAnalytics {
  generatedAt: string;
  summary: MaintenanceAnalyticsSummary;
  faultCategories: {
    category: FaultCategory;
    count: number;
    percentage: number;
  }[];
  topFailureMachines: MachineMaintenanceMetrics[];
  machineMetrics: MachineMaintenanceMetrics[];
  methodology: {
    mtbf: string;
    mttr: string;
    cost: string;
  };
}

export type MaintenanceHistoryEntryType =
  | 'fault'
  | 'work_order'
  | 'preventive'
  | 'part_change'
  | 'maintenance_record';

export interface MaintenanceHistoryEntry {
  id: string;
  recordId: number;
  type: MaintenanceHistoryEntryType;
  source?: string;
  occurredAt: string;
  code: string | null;
  title: string;
  description: string | null;
  status: string;
  category?: FaultCategory;
  urgency?: FaultUrgency;
  reportedBy?: string;
  faultId?: number;
  faultCode?: string;
  rootCause?: string | null;
  durationMinutes?: number | null;
  technician?: string | null;
  partCost?: number;
  originalCost?: number;
  planCode?: string;
  runtimeHours?: number | null;
  nextDueDate?: string;
  results?: {
    title: string;
    completed: boolean;
    measurementValue: number | null;
    note: string | null;
  }[];
  quantity?: number;
  unit?: string;
  unitCost?: number;
  contextType?: string;
  contextId?: number | null;
  contextCode?: string | null;
  severity?: string | null;
}

export interface MachineMaintenanceHistory {
  machine: Machine;
  entries: MaintenanceHistoryEntry[];
  truncated: boolean;
}

export interface ServiceReportPart {
  id: number;
  partId: number;
  code: string;
  name: string;
  quantity: number;
  unit: string;
  unitCost: number;
  totalCost: number;
}

export interface ServiceReport {
  kind: 'work_order' | 'preventive';
  documentCode: string;
  title: string;
  generatedAt: string;
  machine: Machine;
  workOrder?: {
    id: number;
    code: string;
    status: WorkOrderStatus;
    interventionNote: string | null;
    rootCause: string | null;
    durationMinutes: number | null;
    assignedTo: { id: number; name: string; initials: string } | null;
    startedAt: string | null;
    closedAt: string | null;
    createdAt: string;
  };
  fault?: {
    id: number;
    code: string;
    title: string;
    category: FaultCategory;
    urgency: FaultUrgency;
    description: string;
    status: FaultStatus;
    reportedBy: { id: number; name: string; initials: string };
    createdAt: string;
  };
  preventive?: {
    planId: number;
    planCode: string;
    name: string;
    frequency: PreventiveFrequency;
    assignedTo: { id: number; name: string; initials: string } | null;
    completionId: number;
    completionCode: string;
    completedAt: string;
    completedBy: { id: number; name: string; initials: string };
    notes: string | null;
    runtimeHours: number | null;
    nextDueDate: string;
    nextDueRuntimeHours: number | null;
    results: {
      itemId: number;
      title: string;
      completed: boolean;
      measurementValue: number | null;
      note: string | null;
    }[];
  };
  parts: ServiceReportPart[];
  partsScope: 'work_order' | 'preventive_plan';
  totals: {
    partsCost: number;
  };
}

export interface SparePart {
  id: number;
  code: string;
  name: string;
  category: SparePartCategory;
  compatibleMachine: string;
  unit: SparePartUnit;
  currentStock: number;
  minimumStock: number;
  location: string;
  unitCost: number;
  status: SparePartStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SparePartInput {
  code: string;
  name: string;
  category: SparePartCategory;
  compatibleMachine: string;
  unit: SparePartUnit;
  currentStock: number;
  minimumStock: number;
  location: string;
  unitCost: number;
}

export interface SparePartFilters {
  q?: string;
  code?: string;
  name?: string;
  category?: SparePartCategory | '';
  status?: SparePartStatus | '';
}

export interface StockAlert {
  id: number;
  code: string;
  name: string;
  category: SparePartCategory;
  currentStock: number;
  minimumStock: number;
  status: SparePartStatus;
  shortage: number;
  unit: SparePartUnit;
  location: string;
}

export interface StockMovement {
  id: number;
  partId: number | null;
  partCode: string;
  partName: string;
  movementType: StockMovementType;
  quantity: number;
  unitCost: number;
  totalCost: number;
  user: {
    id: number;
    name: string;
    initials: string;
  };
  workOrderId: number | null;
  preventivePlanId: number | null;
  usageId: number | null;
  note: string | null;
  createdAt: string;
}

export interface StockEntryInput {
  quantity: number;
  note?: string | null;
}

export interface PartUsage {
  id: number;
  partId: number;
  part: SparePart;
  quantity: number;
  unitCost: number;
  totalCost: number;
  createdBy: number;
  createdAt: string;
}

export interface MachineRecord {
  id: number;
  machineId: number;
  type: RecordType;
  description: string;
  severity: string | null;
  createdBy: number | null;
  createdAt: string;
}

export interface MachineFilters {
  q?: string;
  line?: string;
  status?: MachineStatus | '';
  criticality?: Criticality | '';
}

export interface Fault {
  id: number;
  code: string;
  machineId: number;
  machine: {
    id: number;
    code: string;
    name: string;
    line: string;
    status: MachineStatus;
  };
  title: string;
  category: FaultCategory;
  urgency: FaultUrgency;
  description: string;
  photo: string | null;
  photoBase64: string | null;
  photoMimeType: string | null;
  hasPhoto: boolean;
  status: FaultStatus;
  reportedBy: {
    id: number;
    name: string;
    initials: string;
  };
  reportedById: number;
  createdBy: number;
  workOrder: {
    id: number;
    code: string;
    status: WorkOrderStatus;
    assignedTo: number | null;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface FaultInput {
  title: string;
  category: FaultCategory;
  urgency: FaultUrgency;
  description: string;
  photoBase64?: string | null;
  photoMimeType?: string | null;
}

export interface FaultFilters {
  status?: FaultStatus | '';
  urgency?: FaultUrgency | '';
  assignedTo?: number | '';
  machineId?: number | '';
  q?: string;
}

export interface FaultSummary {
  id: number;
  code: string;
  title: string;
  category: FaultCategory;
  urgency: FaultUrgency;
  description: string;
  photo: string | null;
  photoBase64: string | null;
  photoMimeType: string | null;
  hasPhoto: boolean;
  status: FaultStatus;
}

export interface WorkOrder {
  id: number;
  code: string;
  faultId: number;
  fault: FaultSummary;
  machine: Fault['machine'];
  assignedTo: {
    id: number;
    name: string;
    initials: string;
  } | null;
  assignedToId: number | null;
  technicianId: number | null;
  status: WorkOrderStatus;
  sparePartCount: number;
  sparePartCost: number;
  interventionNote: string | null;
  rootCause: string | null;
  durationMinutes: number | null;
  solutionPhoto: string | null;
  solutionPhotoBase64: string | null;
  solutionPhotoMimeType: string | null;
  hasSolutionPhoto: boolean;
  createdBy: number;
  createdByUser: {
    id: number;
    name: string;
    initials: string;
  };
  assignedAt: string | null;
  startedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkOrderFilters {
  status?: WorkOrderStatus | '';
  urgency?: FaultUrgency | '';
  assignedTo?: number | '';
  machineId?: number | '';
  faultId?: number | '';
}

export interface WorkOrderCompletionInput {
  interventionNote: string;
  rootCause: string;
  durationMinutes: number;
  solutionPhotoBase64?: string | null;
  solutionPhotoMimeType?: string | null;
}

export type PreventiveFrequency =
  | 'weekly'
  | 'monthly'
  | 'quarterly'
  | 'semiannual'
  | 'annual'
  | 'working_hours';

export type PreventiveDueState = 'overdue' | 'due' | 'upcoming' | 'scheduled';

export interface PreventiveChecklistItem {
  id: number;
  position: number;
  title: string;
  measurementLabel: string | null;
}

export interface PreventiveChecklistDefinition {
  title: string;
  measurementLabel?: string | null;
}

export interface PreventivePlan {
  id: number;
  code: string;
  machineId: number;
  machine: {
    id: number;
    code: string;
    name: string;
    line: string;
    status: MachineStatus;
  };
  name: string;
  frequency: PreventiveFrequency;
  assignedToId: number | null;
  assignedTo: {
    id: number;
    name: string;
    initials: string;
  } | null;
  nextDueDate: string;
  nextDueRuntimeHours: number | null;
  currentRuntimeHours: number | null;
  intervalHours: number | null;
  checklistItems: PreventiveChecklistItem[];
  sparePartCount: number;
  sparePartCost: number;
  dueState: PreventiveDueState;
  lastCompletedAt: string | null;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
}

export interface PreventivePlanInput {
  machineId: number;
  name: string;
  frequency: PreventiveFrequency;
  assignedTo: number;
  nextDueDate: string;
  checklist: PreventiveChecklistDefinition[];
  intervalHours?: number;
  runtimeHours?: number;
}

export interface PreventiveChecklistResultInput {
  itemId: number;
  completed: boolean;
  measurementValue?: string | number | null;
  note?: string | null;
}

export interface PreventiveCompletionInput {
  occurrenceKey: string;
  checklistResults: PreventiveChecklistResultInput[];
  notes?: string | null;
  runtimeHours?: number;
}

export interface PreventiveChecklistResult {
  itemId: number;
  title: string;
  completed: boolean;
  measurementValue: number | null;
  note: string | null;
}

export interface PreventiveCompletion {
  id: number;
  planId: number;
  code: string;
  completedBy: number;
  completedByUser: {
    id: number;
    name: string;
    initials: string;
  };
  completedAt: string;
  notes: string | null;
  runtimeHours: number | null;
  nextDueDate: string;
  nextDueRuntimeHours: number | null;
  results: PreventiveChecklistResult[];
}

export interface PreventivePlanFilters {
  machineId?: number | '';
  assignedTo?: number | '';
}

export interface ApiErrorShape {
  error?: {
    message?: string;
    code?: string;
    details?: unknown;
  };
}
