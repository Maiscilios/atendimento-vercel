import type { AttendanceRecord, Professional } from './catalog';

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
