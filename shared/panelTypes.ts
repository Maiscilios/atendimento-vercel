import {
  getBrazilTodayISO,
  type AttendanceRecord,
  type Professional,
  type ReturnOption,
} from './catalog';

export type PayoutStatus = 'pending' | 'paid';

export interface DailyMetricPoint {
  date: string;
  totalProduced: number;
  commissionAmount: number;
  laisProduced?: number;
  dudaProduced?: number;
  count: number;
}

export interface DailyCommissionSummary {
  date: string;
  count: number;
  totalProduced: number;
  commissionAmount: number;
  payoutStatus: PayoutStatus;
  paidAt: string | null;
  attendances: AttendanceRecord[];
}

export interface SetupStatus {
  laisConfigured: boolean;
  dudaConfigured: boolean;
  setupKeyRequired?: boolean;
}

export interface PanelClientSummary {
  key: string;
  clientName: string;
  whatsapp: string;
  whatsappDigits: string;
  totalVisits: number;
  totalSpent: number;
  lastVisitDate: string;
  professionals: Professional[];
  attendances: AttendanceRecord[];
}

export function formatDaysSinceLastVisitBR(
  lastVisitISO: string,
  brazilTodayISO: string = getBrazilTodayISO()
): string {
  const lastParts = lastVisitISO.split('-').map(Number);
  const todayParts = brazilTodayISO.split('-').map(Number);
  if (
    lastParts.length !== 3 ||
    todayParts.length !== 3 ||
    lastParts.some((n) => Number.isNaN(n)) ||
    todayParts.some((n) => Number.isNaN(n))
  ) {
    return '';
  }

  const lastUtc = Date.UTC(lastParts[0], lastParts[1] - 1, lastParts[2]);
  const todayUtc = Date.UTC(todayParts[0], todayParts[1] - 1, todayParts[2]);
  const diffDays = Math.round((todayUtc - lastUtc) / 86_400_000);

  if (diffDays <= 0) return 'Hoje';
  if (diffDays === 1) return 'Há 1 dia';
  return `Há ${diffDays} dias`;
}

export type AgendaAppointmentStatus = 'confirmed' | 'cancelled';

export type AgendaViewMode = 'day' | 'week' | 'month';

export interface AgendaAppointment {
  id: string;
  professional: Professional;
  sourceAttendanceId: string | null;
  jointGroupId?: string | null;
  clientName: string;
  whatsapp: string;
  whatsappDigits: string;
  procedureName: string;
  appointmentDate: string;
  appointmentTime: string;
  notes: string;
  status: AgendaAppointmentStatus;
  createdAt: string;
  updatedAt: string;
}

export type ReturnRequestStatus = 'waiting' | 'pending_partner' | 'confirmed';

export interface ReturnRequestPartnerSummary {
  id: string;
  professional: Professional;
  procedures: string[];
  status: ReturnRequestStatus;
  approvedByProfessional: boolean;
  proposedDate: string | null;
  proposedTime: string | null;
}

export interface ReturnRequest {
  id: string;
  sourceAttendanceId: string;
  clientId: string | null;
  professional: Professional;
  clientName: string;
  whatsapp: string;
  whatsappDigits: string;
  serviceDate: string;
  returnOption: ReturnOption;
  returnDate: string | null;
  procedures: string[];
  isJoint: boolean;
  jointGroupId: string | null;
  proposedDate: string | null;
  proposedTime: string | null;
  approvedByProfessional: boolean;
  status: ReturnRequestStatus;
  appointmentId: string | null;
  partner: ReturnRequestPartnerSummary | null;
  createdAt: string;
  updatedAt: string;
}

export interface StudioNotification {
  id: string;
  recipient: Professional;
  type: 'return_request' | 'joint_proposed' | 'joint_approved' | 'joint_updated';
  title: string;
  message: string;
  relatedReturnRequestId: string | null;
  jointGroupId: string | null;
  read: boolean;
  createdAt: string;
}
