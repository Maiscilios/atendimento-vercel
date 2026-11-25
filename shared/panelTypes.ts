import {
  getBrazilTodayISO,
  type AttendanceRecord,
  type Professional,
  type ReturnOption,
  type ServiceCategoryId,
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

export interface ClientNextAppointmentSummary {
  id: string;
  professional: Professional;
  appointmentDate: string;
  appointmentTime: string;
  procedureName: string;
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
  serviceCategories: ServiceCategoryId[];
  performedProcedures: string[];
  nextAppointment: ClientNextAppointmentSummary | null;
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
  sourceAttendanceId: string | null;
  clientId: string | null;
  professional: Professional;
  clientName: string;
  whatsapp: string;
  whatsappDigits: string;
  serviceDate: string;
  returnOption: ReturnOption;
  returnDate: string | null;
  desiredTime?: string | null;
  source?: 'attendance_form' | 'public_link';
  notes?: string;
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

export type StudioNotificationType =
  | 'return_request'
  | 'public_pre_booking'
  | 'joint_request'
  | 'joint_proposed'
  | 'joint_approved'
  | 'joint_updated'
  | 'appointment_updated'
  | 'appointment_cancelled'
  | 'test_notification';

export interface StudioNotification {
  id: string;
  recipient: Professional;
  type: StudioNotificationType;
  title: string;
  message: string;
  requestTypeLabel?: string;
  clientName?: string;
  procedures?: string[];
  desiredDate?: string | null;
  desiredTime?: string | null;
  isJoint?: boolean;
  relatedReturnRequestId: string | null;
  relatedAppointmentId?: string | null;
  jointGroupId: string | null;
  targetTab?: 'appointments' | 'agenda';
  targetDate?: string | null;
  targetProfessional?: Professional | null;
  read: boolean;
  createdAt: string;
}

export interface PushSubscriptionInfo {
  id: string;
  deviceLabel: string;
  createdAt: string;
  updatedAt: string;
  lastSuccessAt: string | null;
}

export interface PushStatusResponse {
  vapidPublicKey: string;
  configured: boolean;
  activeSubscriptionsCount: number;
  subscriptions: PushSubscriptionInfo[];
}

export interface InterestedLeadService {
  id: string;
  name: string;
  professional: Professional;
  category: ServiceCategoryId;
}

export interface InterestedLead {
  id: string;
  name: string;
  whatsapp: string;
  whatsappDigits: string;
  services: InterestedLeadService[];
  serviceCategories: ServiceCategoryId[];
  acceptsPromotions: boolean;
  createdAt: string;
  updatedAt: string;
}
