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
  intervalHours: number | null;
  checklistItems: PreventiveChecklistItem[];
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
