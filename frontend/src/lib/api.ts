import type {
  AttendanceRecord,
  AuthUser,
  Professional,
  ReturnOption,
} from '../../../shared/catalog';
import type {
  AgendaAppointment,
  DailyCommissionSummary,
  DailyMetricPoint,
  PanelClientSummary,
  PayoutStatus,
  SetupStatus,
} from '../../../shared/panelTypes';

const TOKEN_STORAGE_KEY = 'maiscilios_session_token';

export function getStoredToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // Ignore storage access restrictions
  }
}

async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options.headers);
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  const payload = (await response.json().catch(() => ({}))) as { error?: string } & T;
  if (!response.ok) {
    throw new Error(payload.error || 'Ocorreu um erro ao se comunicar com o sistema.');
  }
  return payload;
}

export async function fetchSetupStatus(): Promise<SetupStatus> {
  return apiFetch<SetupStatus>('/api/auth/setup-status');
}

export async function fetchCurrentUser(): Promise<AuthUser | null> {
  const data = await apiFetch<{ user: AuthUser | null }>('/api/auth/me');
  return data.user;
}

export async function setupInitialPassword(
  username: 'lais' | 'duda',
  password: string,
  setupKey?: string
): Promise<{ user: AuthUser; token: string }> {
  const data = await apiFetch<{ user: AuthUser; token: string }>('/api/auth/setup-password', {
    method: 'POST',
    body: JSON.stringify({ username, password, setupKey }),
  });
  setStoredToken(data.token);
  return data;
}

export async function loginRequest(
  username: string,
  password: string
): Promise<{ user: AuthUser; token: string }> {
  const data = await apiFetch<{ user: AuthUser; token: string }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  setStoredToken(data.token);
  return data;
}

export async function logoutRequest(): Promise<void> {
  try {
    await apiFetch<{ ok: boolean }>('/api/auth/logout', { method: 'POST' });
  } finally {
    setStoredToken(null);
  }
}

export async function changePasswordRequest(
  currentPassword: string,
  newPassword: string
): Promise<void> {
  await apiFetch<{ ok: boolean }>('/api/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

export interface SubmitAttendancePayload {
  professional: Professional;
  clientName: string;
  whatsapp: string;
  totalPaid: number;
  serviceIds: string[];
  additionals: string[];
  returnOption: ReturnOption;
  preferredTimes: string[];
  serviceDate: string;
  idempotencyKey?: string;
}

export interface SubmissionConfirmation {
  id: string;
  professional: Professional;
  clientName: string;
  serviceDate: string;
  createdAt?: string;
  returnOption: ReturnOption;
  returnDate: string | null;
  preferredTimes: string[];
  returnStatus: string;
}

export async function submitAttendance(
  payload: SubmitAttendancePayload
): Promise<SubmissionConfirmation> {
  const res = await apiFetch<{ confirmation: SubmissionConfirmation }>('/api/attendances', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return res.confirmation;
}

// ============================================================================
// DUDA PANEL API
// ============================================================================

export interface DudaDashboardResponse {
  selectedDate: string;
  dayTotalProduced: number;
  dayCommissionToLais: number;
  dayAttendances: AttendanceRecord[];
  dailyChart: DailyMetricPoint[];
}

export async function fetchDudaDashboard(date: string): Promise<DudaDashboardResponse> {
  return apiFetch<DudaDashboardResponse>(
    `/api/duda/dashboard?date=${encodeURIComponent(date)}`
  );
}

export async function fetchDudaClients(search?: string): Promise<{ clients: PanelClientSummary[] }> {
  const query = new URLSearchParams();
  if (search && search.trim()) query.set('search', search.trim());
  const qs = query.toString();
  return apiFetch<{ clients: PanelClientSummary[] }>(`/api/duda/clients${qs ? `?${qs}` : ''}`);
}

export interface DudaAttendancesResponse {
  attendances: AttendanceRecord[];
  summary: {
    count: number;
    totalReceived: number;
    totalCommissionToLais: number;
  };
}

export async function fetchDudaAttendances(params: {
  startDate?: string;
  endDate?: string;
  search?: string;
  returnStatus?: 'waiting' | 'confirmed';
  onlyReturns?: boolean;
}): Promise<DudaAttendancesResponse> {
  const query = new URLSearchParams();
  if (params.startDate) query.set('startDate', params.startDate);
  if (params.endDate) query.set('endDate', params.endDate);
  if (params.search) query.set('search', params.search);
  if (params.returnStatus) query.set('returnStatus', params.returnStatus);
  if (params.onlyReturns) query.set('onlyReturns', 'true');
  const qs = query.toString();
  return apiFetch<DudaAttendancesResponse>(`/api/duda/attendances${qs ? `?${qs}` : ''}`);
}

export interface CommissionsByDayResponse {
  selectedDay: DailyCommissionSummary;
  availableDays: DailyCommissionSummary[];
}

export async function fetchDudaCommissions(date: string): Promise<CommissionsByDayResponse> {
  return apiFetch<CommissionsByDayResponse>(
    `/api/duda/commissions?date=${encodeURIComponent(date)}`
  );
}

export async function updateDudaReturnStatus(
  id: string,
  status: 'waiting' | 'confirmed'
): Promise<AttendanceRecord> {
  const res = await apiFetch<{ attendance: AttendanceRecord }>(
    `/api/duda/attendances/${id}/return-status`,
    {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }
  );
  return res.attendance;
}

export interface AgendaAppointmentPayload {
  clientName: string;
  whatsapp: string;
  procedureName: string;
  appointmentDate: string;
  appointmentTime: string;
  notes?: string;
}

export async function fetchDudaAgenda(params?: {
  startDate?: string;
  endDate?: string;
}): Promise<{ appointments: AgendaAppointment[] }> {
  const query = new URLSearchParams();
  if (params?.startDate) query.set('startDate', params.startDate);
  if (params?.endDate) query.set('endDate', params.endDate);
  const qs = query.toString();
  return apiFetch<{ appointments: AgendaAppointment[] }>(
    `/api/duda/agenda${qs ? `?${qs}` : ''}`
  );
}

export async function createDudaAgendaAppointment(
  payload: AgendaAppointmentPayload
): Promise<AgendaAppointment> {
  const res = await apiFetch<{ appointment: AgendaAppointment }>(
    '/api/duda/agenda/appointments',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
  return res.appointment;
}

export async function confirmDudaAgendaRequest(
  attendanceId: string,
  payload: {
    appointmentDate: string;
    appointmentTime: string;
    procedureName: string;
    notes?: string;
  }
): Promise<{ appointment: AgendaAppointment; attendance: AttendanceRecord }> {
  return apiFetch<{ appointment: AgendaAppointment; attendance: AttendanceRecord }>(
    `/api/duda/agenda/confirm-request/${encodeURIComponent(attendanceId)}`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
}

export async function updateDudaAgendaAppointment(
  id: string,
  payload: AgendaAppointmentPayload
): Promise<AgendaAppointment> {
  const res = await apiFetch<{ appointment: AgendaAppointment }>(
    `/api/duda/agenda/appointments/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }
  );
  return res.appointment;
}

export async function cancelDudaAgendaAppointment(id: string): Promise<AgendaAppointment> {
  const res = await apiFetch<{ appointment: AgendaAppointment }>(
    `/api/duda/agenda/appointments/${encodeURIComponent(id)}/cancel`,
    {
      method: 'PATCH',
    }
  );
  return res.appointment;
}

export async function deleteDudaAgendaAppointment(id: string): Promise<void> {
  await apiFetch<{ ok: boolean }>(`/api/duda/agenda/appointments/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

// ============================================================================
// LAÍS ADMIN PANEL API
// ============================================================================

export interface AdminDashboardResponse {
  selectedDate: string;
  dayTotalProduced: number;
  dayLaisProduced: number;
  dayDudaProduced: number;
  dayDudaCommission: number;
  dayAttendances: AttendanceRecord[];
  dailyChart: DailyMetricPoint[];
}

export async function fetchAdminDashboard(
  date: string,
  professional: 'all' | Professional = 'all'
): Promise<AdminDashboardResponse> {
  const query = new URLSearchParams({ date });
  if (professional !== 'all') query.set('professional', professional);
  return apiFetch<AdminDashboardResponse>(`/api/admin/dashboard?${query.toString()}`);
}

export async function fetchAdminAttendances(params: {
  professional?: Professional | 'all';
  serviceId?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
  returnStatus?: 'waiting' | 'confirmed';
  onlyReturns?: boolean;
}): Promise<{ attendances: AttendanceRecord[] }> {
  const query = new URLSearchParams();
  if (params.professional && params.professional !== 'all') {
    query.set('professional', params.professional);
  }
  if (params.serviceId && params.serviceId !== 'all') {
    query.set('serviceId', params.serviceId);
  }
  if (params.startDate) query.set('startDate', params.startDate);
  if (params.endDate) query.set('endDate', params.endDate);
  if (params.search) query.set('search', params.search);
  if (params.returnStatus) query.set('returnStatus', params.returnStatus);
  if (params.onlyReturns) query.set('onlyReturns', 'true');
  const qs = query.toString();
  return apiFetch<{ attendances: AttendanceRecord[] }>(
    `/api/admin/attendances${qs ? `?${qs}` : ''}`
  );
}

export async function fetchAdminClients(
  search?: string,
  professional: 'all' | Professional = 'all'
): Promise<{ clients: PanelClientSummary[] }> {
  const query = new URLSearchParams();
  if (search && search.trim()) query.set('search', search.trim());
  if (professional !== 'all') query.set('professional', professional);
  const qs = query.toString();
  return apiFetch<{ clients: PanelClientSummary[] }>(`/api/admin/clients${qs ? `?${qs}` : ''}`);
}

export async function fetchAdminCommissions(date: string): Promise<CommissionsByDayResponse> {
  return apiFetch<CommissionsByDayResponse>(
    `/api/admin/commissions?date=${encodeURIComponent(date)}`
  );
}

export async function updateAdminCommissionStatus(
  date: string,
  status: PayoutStatus
): Promise<{ payoutDate: string; payoutStatus: PayoutStatus; paidAt: string | null }> {
  return apiFetch<{ payoutDate: string; payoutStatus: PayoutStatus; paidAt: string | null }>(
    `/api/admin/commissions/${encodeURIComponent(date)}/status`,
    {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }
  );
}

export interface DudaFinanceResponse {
  attendances: AttendanceRecord[];
  summary: {
    count: number;
    laisCount: number;
    totalLaisProduced: number;
    totalReceived: number;
    totalCommissionToReceive: number;
  };
}

export async function fetchAdminDudaFinance(params: {
  startDate?: string;
  endDate?: string;
}): Promise<DudaFinanceResponse> {
  const query = new URLSearchParams();
  if (params.startDate) query.set('startDate', params.startDate);
  if (params.endDate) query.set('endDate', params.endDate);
  const qs = query.toString();
  return apiFetch<DudaFinanceResponse>(`/api/admin/duda-finance${qs ? `?${qs}` : ''}`);
}

export async function resetDudaPasswordByAdmin(): Promise<void> {
  await apiFetch<{ ok: boolean }>('/api/admin/reset-duda-password', {
    method: 'POST',
  });
}

export async function updateAdminReturnStatus(
  id: string,
  status: 'waiting' | 'confirmed'
): Promise<AttendanceRecord> {
  const res = await apiFetch<{ attendance: AttendanceRecord }>(
    `/api/admin/attendances/${id}/return-status`,
    {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }
  );
  return res.attendance;
}

export async function deleteAdminAttendance(id: string): Promise<void> {
  await apiFetch<{ ok: boolean }>(`/api/admin/attendances/${id}`, {
    method: 'DELETE',
  });
}

export async function fetchAdminAgenda(params: {
  professional: Professional;
  startDate?: string;
  endDate?: string;
}): Promise<{ professional: Professional; appointments: AgendaAppointment[] }> {
  const query = new URLSearchParams({ professional: params.professional });
  if (params.startDate) query.set('startDate', params.startDate);
  if (params.endDate) query.set('endDate', params.endDate);
  return apiFetch<{ professional: Professional; appointments: AgendaAppointment[] }>(
    `/api/admin/agenda?${query.toString()}`
  );
}

export async function createAdminAgendaAppointment(
  payload: AgendaAppointmentPayload & { professional: Professional }
): Promise<AgendaAppointment> {
  const res = await apiFetch<{ appointment: AgendaAppointment }>(
    '/api/admin/agenda/appointments',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
  return res.appointment;
}

export async function confirmAdminAgendaRequest(
  attendanceId: string,
  payload: {
    appointmentDate: string;
    appointmentTime: string;
    procedureName: string;
    notes?: string;
  }
): Promise<{ appointment: AgendaAppointment; attendance: AttendanceRecord }> {
  return apiFetch<{ appointment: AgendaAppointment; attendance: AttendanceRecord }>(
    `/api/admin/agenda/confirm-request/${encodeURIComponent(attendanceId)}`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
}

export async function updateAdminAgendaAppointment(
  id: string,
  payload: AgendaAppointmentPayload
): Promise<AgendaAppointment> {
  const res = await apiFetch<{ appointment: AgendaAppointment }>(
    `/api/admin/agenda/appointments/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }
  );
  return res.appointment;
}

export async function cancelAdminAgendaAppointment(id: string): Promise<AgendaAppointment> {
  const res = await apiFetch<{ appointment: AgendaAppointment }>(
    `/api/admin/agenda/appointments/${encodeURIComponent(id)}/cancel`,
    {
      method: 'PATCH',
    }
  );
  return res.appointment;
}

export async function deleteAdminAgendaAppointment(id: string): Promise<void> {
  await apiFetch<{ ok: boolean }>(`/api/admin/agenda/appointments/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
