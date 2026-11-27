import { Platform } from 'react-native';
import Constants from 'expo-constants';

import { apiConfigurationErrorMessage, resolveApiBaseUrl } from './apiConfiguration';
import type {
  DashboardSummary,
  Fault,
  FaultFilters,
  FaultInput,
  Machine,
  MachineFilters,
  MachineInput,
  MachineMaintenanceHistory,
  MachineRecord,
  MaintenanceAnalytics,
  PreventiveCompletion,
  PreventiveCompletionInput,
  PreventivePlan,
  PreventivePlanFilters,
  PreventivePlanInput,
  PartUsage,
  RecordType,
  ServiceReport,
  SparePart,
  SparePartFilters,
  SparePartInput,
  StockAlert,
  StockEntryInput,
  StockMovement,
  User,
  WorkOrder,
  WorkOrderCompletionInput,
  WorkOrderFilters,
  WorkOrderStatus,
} from './types';

const configuredBaseUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
const configuredApiPort = Number(process.env.EXPO_PUBLIC_API_PORT || 3006);

export const API_BASE_URL = resolveApiBaseUrl({
  platform: Platform.OS === 'web' ? 'web' : 'native',
  configuredUrl: configuredBaseUrl,
  hostUri: Constants.expoConfig?.hostUri,
  port: configuredApiPort,
});

export const API_CONFIGURATION_ERROR = apiConfigurationErrorMessage(API_BASE_URL);

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
  if (!API_BASE_URL) {
    throw new ApiError(
      API_CONFIGURATION_ERROR || 'API adresi yapılandırılmadı.',
      503,
      'API_URL_NOT_CONFIGURED',
    );
  }

  const { body, userId, headers, ...init } = options;
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(userId ? { 'x-user-id': String(userId) } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (reason) {
    const detail = reason instanceof Error ? reason.message : 'Ağ bağlantısı kurulamadı.';
    throw new ApiError(
      `CMMS API'ye bağlanılamadı (${API_BASE_URL}). ${detail} Fiziksel iOS cihazda EXPO_PUBLIC_API_URL değerinin bilgisayarın LAN IP adresini içerdiğini doğrulayın.`,
      0,
      'NETWORK_ERROR',
    );
  }

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

function toSparePartQuery(filters: SparePartFilters): string {
  const params = new URLSearchParams();
  if (filters.q?.trim()) params.set('q', filters.q.trim());
  if (filters.code?.trim()) params.set('code', filters.code.trim());
  if (filters.name?.trim()) params.set('name', filters.name.trim());
  if (filters.category) params.set('category', filters.category);
  if (filters.status) params.set('status', filters.status);
  const query = params.toString();
  return query ? `?${query}` : '';
}

type RawPart = Partial<SparePart> & {
  stockStatus?: SparePart['status'];
  compatibility?: string;
};

function normalizePart(raw: RawPart): SparePart {
  const currentStock = Number(raw.currentStock ?? 0);
  const minimumStock = Number(raw.minimumStock ?? 0);
  const candidateStatus = raw.status ?? raw.stockStatus;
  const status: SparePart['status'] = candidateStatus === 'sufficient'
    || candidateStatus === 'critical'
    || candidateStatus === 'depleted'
    ? candidateStatus
    : currentStock <= 0
      ? 'depleted'
      : currentStock <= minimumStock
        ? 'critical'
        : 'sufficient';
  return {
    id: raw.id ?? 0,
    code: raw.code ?? '',
    name: raw.name ?? '',
    category: raw.category ?? 'consumable',
    compatibleMachine: raw.compatibleMachine ?? raw.compatibility ?? '',
    unit: raw.unit ?? 'piece',
    currentStock,
    minimumStock,
    location: raw.location ?? '',
    unitCost: Number(raw.unitCost ?? 0),
    status,
    createdAt: raw.createdAt ?? '',
    updatedAt: raw.updatedAt ?? raw.createdAt ?? '',
  };
}

type RawUsage = Partial<Omit<PartUsage, 'part'>> & {
  part?: RawPart;
  partCode?: string;
  partName?: string;
  unit?: SparePart['unit'];
  category?: SparePart['category'];
  compatibility?: string;
  compatibleMachine?: string;
  currentStock?: number;
  minimumStock?: number;
  location?: string;
  status?: SparePart['status'];
  stockStatus?: SparePart['status'];
  updatedAt?: string;
};

function normalizeUsage(raw: RawUsage): PartUsage {
  const unitCost = Number(raw.unitCost ?? 0);
  const quantity = Number(raw.quantity ?? 0);
  const part = raw.part
    ? normalizePart(raw.part)
    : normalizePart({
        id: raw.partId,
        code: raw.partCode,
        name: raw.partName,
        category: raw.category,
        compatibleMachine: raw.compatibleMachine ?? raw.compatibility,
        unit: raw.unit,
        currentStock: raw.currentStock,
        minimumStock: raw.minimumStock,
        location: raw.location,
        unitCost,
        status: raw.status ?? raw.stockStatus,
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt,
      });
  return {
    id: raw.id ?? 0,
    partId: raw.partId ?? part.id,
    part,
    quantity,
    unitCost,
    totalCost: Number(raw.totalCost ?? quantity * unitCost),
    createdBy: raw.createdBy ?? 0,
    createdAt: raw.createdAt ?? '',
  };
}

type RawAlert = {
  id?: number;
  code?: string;
  name?: string;
  category?: SparePart['category'];
  currentStock?: number;
  minimumStock?: number;
  status?: SparePart['status'];
  stockStatus?: SparePart['status'];
  shortage?: number;
  unit?: SparePart['unit'];
  location?: string;
  part?: RawPart;
};

function normalizeAlert(raw: RawAlert): StockAlert {
  const part = raw.part ? normalizePart(raw.part) : null;
  const currentStock = Number(raw.currentStock ?? part?.currentStock ?? 0);
  const minimumStock = Number(raw.minimumStock ?? part?.minimumStock ?? 0);
  const status = raw.status ?? raw.stockStatus ?? part?.status
    ?? (currentStock <= 0 ? 'depleted' : currentStock <= minimumStock ? 'critical' : 'sufficient');
  return {
    id: raw.id ?? part?.id ?? 0,
    code: raw.code ?? part?.code ?? '',
    name: raw.name ?? part?.name ?? '',
    category: raw.category ?? part?.category ?? 'consumable',
    currentStock,
    minimumStock,
    status,
    shortage: Number(raw.shortage ?? Math.max(minimumStock - currentStock, 0)),
    unit: raw.unit ?? part?.unit ?? 'piece',
    location: raw.location ?? part?.location ?? '',
  };
}

type RawMovement = Partial<Omit<StockMovement, 'user'>> & {
  user?: StockMovement['user'];
  userId?: number;
};

function normalizeMovement(raw: RawMovement): StockMovement {
  const unitCost = Number(raw.unitCost ?? 0);
  const quantity = Number(raw.quantity ?? 0);
  return {
    id: raw.id ?? 0,
    partId: raw.partId ?? null,
    partCode: raw.partCode ?? '',
    partName: raw.partName ?? '',
    movementType: raw.movementType ?? 'in',
    quantity,
    unitCost,
    totalCost: Number(raw.totalCost ?? quantity * unitCost),
    user: raw.user ?? {
      id: raw.userId ?? 0,
      name: 'Bilinmeyen kullanıcı',
      initials: '?',
    },
    workOrderId: raw.workOrderId ?? null,
    preventivePlanId: raw.preventivePlanId ?? null,
    usageId: raw.usageId ?? null,
    note: raw.note ?? null,
    createdAt: raw.createdAt ?? '',
  };
}

type RawUsageResponse = {
  usage?: RawUsage;
  parts?: RawUsage[];
  totalCost?: number;
  partsCost?: number;
};

async function getUsageParts(userId: number, path: string) {
  const response = await request<RawUsageResponse>(path, { userId });
  const parts = (response.parts ?? []).map(normalizeUsage);
  return {
    parts,
    totalCost: Number(response.totalCost ?? response.partsCost ?? parts.reduce((sum, part) => sum + part.totalCost, 0)),
  };
}

async function saveUsage(
  userId: number,
  path: string,
  method: 'POST' | 'PUT',
  body: { partId: number; quantity: number },
) {
  const response = await request<RawUsageResponse>(path, { method, body, userId });
  const parts = (response.parts ?? []).map(normalizeUsage);
  const usage = response.usage ? normalizeUsage(response.usage) : null;
  return {
    usage,
    parts,
    totalCost: Number(
      response.totalCost
      ?? response.partsCost
      ?? usage?.totalCost
      ?? parts.reduce((sum, part) => sum + part.totalCost, 0)
      ?? 0,
    ),
  };
}

export const api = {
  getDemoUsers: () => request<{ users: User[] }>('/auth/demo-users'),
  login: (userId: number) => request<{ user: User }>('/auth/login', { method: 'POST', body: { userId } }),
  getDashboard: (userId: number) =>
    request<DashboardSummary>('/dashboard/summary', { userId }),
  getMaintenanceAnalytics: (userId: number) =>
    request<{ analytics: MaintenanceAnalytics }>('/analytics/maintenance', { userId }),
  getMachineMaintenanceHistory: (userId: number, machineId: number) =>
    request<MachineMaintenanceHistory>(`/machines/${machineId}/maintenance-history`, { userId }),
  getWorkOrderServiceReport: (userId: number, workOrderId: number) =>
    request<{ report: ServiceReport }>(`/work-orders/${workOrderId}/service-report`, { userId }),
  getPreventiveServiceReport: (
    userId: number,
    planId: number,
    executionId: number,
  ) => request<{ report: ServiceReport }>(
    `/preventive-plans/${planId}/completions/${executionId}/service-report`,
    { userId },
  ),
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
  getSpareParts: async (userId: number, filters: SparePartFilters = {}) => {
    const response = await request<{ parts?: RawPart[]; spareParts?: RawPart[] }>(
      `/spare-parts${toSparePartQuery(filters)}`,
      { userId },
    );
    return { parts: (response.parts ?? response.spareParts ?? []).map(normalizePart) };
  },
  getSparePart: async (userId: number, id: number) => {
    const response = await request<{ part?: RawPart; sparePart?: RawPart }>(`/spare-parts/${id}`, { userId });
    return { part: normalizePart(response.part ?? response.sparePart ?? {}) };
  },
  createSparePart: async (userId: number, part: SparePartInput) => {
    const response = await request<{ part?: RawPart; sparePart?: RawPart }>('/spare-parts', {
      method: 'POST',
      body: part,
      userId,
    });
    return { part: normalizePart(response.part ?? response.sparePart ?? {}) };
  },
  updateSparePart: async (userId: number, id: number, part: Partial<SparePartInput>) => {
    const response = await request<{ part?: RawPart; sparePart?: RawPart }>(`/spare-parts/${id}`, {
      method: 'PUT',
      body: part,
      userId,
    });
    return { part: normalizePart(response.part ?? response.sparePart ?? {}) };
  },
  deleteSparePart: (userId: number, id: number) =>
    request<{ deleted: boolean; id: number }>(`/spare-parts/${id}`, { method: 'DELETE', userId }),
  createStockMovement: async (userId: number, partId: number, body: StockEntryInput) => {
    type StockResponse = {
      part?: RawPart;
      sparePart?: RawPart;
      movement?: RawMovement;
    };
    let response: StockResponse;
    try {
      response = await request<StockResponse>(`/spare-parts/${partId}/stock-movements`, {
        method: 'POST',
        body,
        userId,
      });
    } catch (reason) {
      if (!(reason instanceof ApiError) || reason.status !== 404) throw reason;
      response = await request<StockResponse>(`/spare-parts/${partId}/stock`, {
        method: 'POST',
        body,
        userId,
      });
    }
    return {
      part: normalizePart(response.part ?? response.sparePart ?? {}),
      movement: normalizeMovement(response.movement ?? {}),
    };
  },
  getStockAlerts: async (userId: number) => {
    const response = await request<{ alerts?: RawAlert[]; count?: number }>('/stock-alerts', { userId });
    const alerts = (response.alerts ?? []).map(normalizeAlert);
    return { alerts, count: Number(response.count ?? alerts.length) };
  },
  getStockMovements: async (userId: number) => {
    const response = await request<{ movements?: RawMovement[] }>('/stock-movements', { userId });
    return { movements: (response.movements ?? []).map(normalizeMovement) };
  },
  getWorkOrderParts: (userId: number, id: number) =>
    getUsageParts(userId, `/work-orders/${id}/parts`),
  addWorkOrderPart: (userId: number, id: number, body: { partId: number; quantity: number }) =>
    saveUsage(userId, `/work-orders/${id}/parts`, 'POST', body),
  updateWorkOrderPart: (
    userId: number,
    id: number,
    usageId: number,
    body: { partId: number; quantity: number },
  ) => saveUsage(userId, `/work-orders/${id}/parts/${usageId}`, 'PUT', body),
  removeWorkOrderPart: (userId: number, id: number, usageId: number) =>
    request<{ deleted: boolean; id: number; totalCost?: number }>(`/work-orders/${id}/parts/${usageId}`, {
      method: 'DELETE',
      userId,
    }),
  getPreventivePlanParts: (userId: number, id: number) =>
    getUsageParts(userId, `/preventive-plans/${id}/parts`),
  addPreventivePlanPart: (userId: number, id: number, body: { partId: number; quantity: number }) =>
    saveUsage(userId, `/preventive-plans/${id}/parts`, 'POST', body),
  updatePreventivePlanPart: (
    userId: number,
    id: number,
    usageId: number,
    body: { partId: number; quantity: number },
  ) => saveUsage(userId, `/preventive-plans/${id}/parts/${usageId}`, 'PUT', body),
  removePreventivePlanPart: (userId: number, id: number, usageId: number) =>
    request<{ deleted: boolean; id: number; totalCost?: number }>(`/preventive-plans/${id}/parts/${usageId}`, {
      method: 'DELETE',
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
