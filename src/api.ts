import type {
  DashboardSummary,
  Machine,
  MachineFilters,
  MachineInput,
  MachineRecord,
  RecordType,
  User,
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
};
