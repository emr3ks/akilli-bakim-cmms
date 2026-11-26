import type {
  DashboardSummary,
  Fault,
  FaultFilters,
  FaultInput,
  Machine,
  MachineFilters,
  MachineInput,
  MachineRecord,
  PreventiveCompletion,
  PreventiveCompletionInput,
  PreventivePlan,
  PreventivePlanFilters,
  PreventivePlanInput,
  RecordType,
  User,
  WorkOrder,
  WorkOrderCompletionInput,
  WorkOrderFilters,
  WorkOrderStatus,
} from './types';

const configuredBaseUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
export const API_BASE_URL = (configuredBaseUrl || 'http://localhost:3006/api').replace(/\/$/, '');

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

type RequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown;
  userId?: number | null;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, userId, headers, ...init } = options;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(userId ? { 'x-user-id': String(userId) } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const errorPayload = payload as { error?: { message?: string; code?: string } } | null;
    throw new ApiError(
      errorPayload?.error?.message || `Sunucu isteği tamamlayamadı (${response.status}).`,
      response.status,
      errorPayload?.error?.code,
    );
  }

  return payload as T;
}

function toQuery(filters: MachineFilters): string {
  const params = new URLSearchParams();
  if (filters.q?.trim()) params.set('q', filters.q.trim());
  if (filters.line?.trim()) params.set('line', filters.line.trim());
  if (filters.status) params.set('status', filters.status);
  if (filters.criticality) params.set('criticality', filters.criticality);
  const query = params.toString();
  return query ? `?${query}` : '';
}

function toFaultQuery(filters: FaultFilters): string {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.urgency) params.set('urgency', filters.urgency);
  if (filters.assignedTo) params.set('assignedTo', String(filters.assignedTo));
  if (filters.machineId) params.set('machineId', String(filters.machineId));
  if (filters.q?.trim()) params.set('q', filters.q.trim());
  const query = params.toString();
  return query ? `?${query}` : '';
}

function toWorkOrderQuery(filters: WorkOrderFilters): string {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.urgency) params.set('urgency', filters.urgency);
  if (filters.assignedTo) params.set('assignedTo', String(filters.assignedTo));
  if (filters.machineId) params.set('machineId', String(filters.machineId));
  if (filters.faultId) params.set('faultId', String(filters.faultId));
  const query = params.toString();
  return query ? `?${query}` : '';
}

function toPreventivePlanQuery(filters: PreventivePlanFilters): string {
  const params = new URLSearchParams();
  if (filters.machineId) params.set('machineId', String(filters.machineId));
  if (filters.assignedTo) params.set('assignedTo', String(filters.assignedTo));
  const query = params.toString();
  return query ? `?${query}` : '';
}

export const api = {
  getDemoUsers: () => request<{ users: User[] }>('/auth/demo-users'),
  login: (userId: number) => request<{ user: User }>('/auth/login', { method: 'POST', body: { userId } }),
  getDashboard: (userId: number) =>
    request<DashboardSummary>('/dashboard/summary', { userId }),
  getMachines: (userId: number, filters: MachineFilters = {}) =>
    request<{ machines: Machine[] }>(`/machines${toQuery(filters)}`, { userId }),
  getMachine: (userId: number, id: number) =>
    request<{ machine: Machine }>(`/machines/${id}`, { userId }),
  getMachineByCode: (userId: number, code: string) =>
    request<{ machine: Machine }>(`/machines/code/${encodeURIComponent(code.trim())}`, { userId }),
  createMachine: (userId: number, machine: MachineInput) =>
    request<{ machine: Machine }>('/machines', { method: 'POST', body: machine, userId }),
  updateMachine: (userId: number, id: number, machine: Partial<MachineInput>) =>
    request<{ machine: Machine }>(`/machines/${id}`, { method: 'PUT', body: machine, userId }),
  deleteMachine: (userId: number, id: number) =>
    request<{ deleted: boolean; id: number }>(`/machines/${id}`, { method: 'DELETE', userId }),
  getRecords: (userId: number, machineId: number, type?: RecordType) =>
    request<{ records: MachineRecord[] }>(
      `/machines/${machineId}/${type === 'fault' ? 'fault' : 'maintenance'}-records`,
      { userId },
    ),
  createMaintenanceRecord: (
    userId: number,
    machineId: number,
    body: { type: RecordType; description: string; severity?: string },
  ) =>
    request<{ record: MachineRecord }>(`/machines/${machineId}/maintenance-records`, {
      method: 'POST',
      body,
      userId,
    }),
  createFaultRecord: (
    userId: number,
    machineId: number,
    body: { description: string; severity?: string },
  ) =>
    request<{ record: MachineRecord }>(`/machines/${machineId}/fault-records`, {
      method: 'POST',
      body,
      userId,
    }),
  getFaults: (userId: number, filters: FaultFilters = {}) =>
    request<{ faults: Fault[] }>(`/faults${toFaultQuery(filters)}`, { userId }),
  getFault: (userId: number, id: number) =>
    request<{ fault: Fault }>(`/faults/${id}`, { userId }),
  createFault: (userId: number, machineId: number, body: FaultInput) =>
    request<{ fault: Fault }>(`/machines/${machineId}/faults`, {
      method: 'POST',
      body,
      userId,
    }),
  getWorkOrders: (userId: number, filters: WorkOrderFilters = {}) =>
    request<{ workOrders: WorkOrder[] }>(`/work-orders${toWorkOrderQuery(filters)}`, { userId }),
  getWorkOrder: (userId: number, id: number) =>
    request<{ workOrder: WorkOrder }>(`/work-orders/${id}`, { userId }),
  createWorkOrder: (userId: number, faultId: number, assignedTo?: number | null) =>
    request<{ workOrder: WorkOrder }>('/work-orders', {
      method: 'POST',
      body: { faultId, ...(assignedTo ? { assignedTo } : {}) },
      userId,
    }),
  assignWorkOrder: (userId: number, id: number, assignedTo: number) =>
    request<{ workOrder: WorkOrder }>(`/work-orders/${id}/assign`, {
      method: 'POST',
      body: { assignedTo },
      userId,
    }),
  updateWorkOrderStatus: (
    userId: number,
    id: number,
    status: WorkOrderStatus,
    completion?: WorkOrderCompletionInput,
  ) =>
    request<{ workOrder: WorkOrder }>(`/work-orders/${id}/status`, {
      method: 'PATCH',
      body: { status, ...(completion ?? {}) },
      userId,
    }),
  getPreventivePlans: (userId: number, filters: PreventivePlanFilters = {}) =>
    request<{ plans: PreventivePlan[] }>(`/preventive-plans${toPreventivePlanQuery(filters)}`, { userId }),
  getPreventivePlan: (userId: number, id: number) =>
    request<{ plan: PreventivePlan }>(`/preventive-plans/${id}`, { userId }),
  createPreventivePlan: (userId: number, plan: PreventivePlanInput) =>
    request<{ plan: PreventivePlan }>('/preventive-plans', {
      method: 'POST',
      body: plan,
      userId,
    }),
  reportPreventiveRuntime: (userId: number, id: number, runtimeHours: number) =>
    request<{ plan: PreventivePlan }>(`/preventive-plans/${id}/runtime`, {
      method: 'POST',
      body: { runtimeHours },
      userId,
    }),
  completePreventivePlan: (userId: number, id: number, completion: PreventiveCompletionInput) =>
    request<{ completion: PreventiveCompletion; plan: PreventivePlan }>(`/preventive-plans/${id}/complete`, {
      method: 'POST',
      body: completion,
      userId,
    }),
  getPreventiveCompletions: (userId: number, id: number) =>
    request<{ completions: PreventiveCompletion[] }>(`/preventive-plans/${id}/completions`, { userId }),
};
