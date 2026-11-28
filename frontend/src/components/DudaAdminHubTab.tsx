import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Bell,
  Calendar,
  CalendarClock,
  CalendarPlus,
  CheckCircle2,
  Clock,
  DollarSign,
  History,
  MessageCircle,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import {
  DUDA_SERVICES,
  addDaysToISO,
  buildWhatsAppLink,
  formatBRL,
  formatBrazilTimeBR,
  formatDateBR,
  getBrazilTodayISO,
  getLocalDateISO,
  getReturnOptionLabel,
  isValidHHMMTime,
  type AttendanceRecord,
} from '../../../shared/catalog';
import type {
  DailyCommissionSummary,
  PanelClientSummary,
  PayoutStatus,
  ReturnRequest,
  ReturnRequestStatus,
  StudioNotification,
} from '../../../shared/panelTypes';
import {
  deleteAdminAttendance,
  fetchAdminAttendances,
  fetchAdminClients,
  fetchAdminCommissions,
  fetchAdminDudaFinance,
  fetchAdminNotifications,
  fetchAdminReturnRequests,
  markAdminNotificationsRead,
  resetDudaPasswordByAdmin,
  updateAdminCommissionStatus,
} from '../lib/api';
import { AgendaBookingModal, type AgendaBookingModalState } from './AgendaBookingModal';
import { AgendaCalendarTab, type AgendaInitialBookingRequest } from './AgendaCalendarTab';
import { ClientDetailModal } from './ClientDetailModal';
import { ClientsTabView } from './ClientsTabView';
import { computeRangeForPreset, PeriodFilterBar, type PeriodRange } from './PeriodFilterBar';

export type DudaHubSection =
  | 'agenda'
  | 'requests'
  | 'attendances'
  | 'clients'
  | 'finance'
  | 'reports'
  | 'notifications';

interface DudaAdminHubTabProps {
  focusSectionSignal?: {
    token: number;
    section: DudaHubSection;
    targetDate?: string | null;
    returnRequestId?: string | null;
  } | null;
  externalInitialBooking?: AgendaInitialBookingRequest | null;
  onExternalInitialBookingConsumed?: () => void;
  refreshSignal?: number;
}

const DUDA_SUBTABS: Array<{
  id: DudaHubSection;
  label: string;
  icon: typeof Calendar;
}> = [
  { id: 'agenda', label: 'Agenda', icon: Calendar },
  { id: 'requests', label: 'Solicitações', icon: CalendarClock },
  { id: 'attendances', label: 'Atendimentos', icon: History },
  { id: 'clients', label: 'Clientes', icon: Users },
  { id: 'finance', label: 'Financeiro e Comissões', icon: DollarSign },
  { id: 'reports', label: 'Relatórios', icon: BarChart3 },
  { id: 'notifications', label: 'Notificações', icon: Bell },
];

export function DudaAdminHubTab({
  focusSectionSignal,
  externalInitialBooking,
  onExternalInitialBookingConsumed,
  refreshSignal,
}: DudaAdminHubTabProps) {
  const [section, setSection] = useState<DudaHubSection>('agenda');
  const [error, setError] = useState('');
  const [brazilToday] = useState<string>(() => getBrazilTodayISO());

  // Password reset (isolated inside Duda tab)
  const [confirmResetDuda, setConfirmResetDuda] = useState(false);
  const [resetFeedback, setResetFeedback] = useState('');

  // 1. Agenda
  const [agendaFocusDate, setAgendaFocusDate] = useState<string | undefined>(undefined);
  const [agendaInitialBooking, setAgendaInitialBooking] =
    useState<AgendaInitialBookingRequest | null>(null);
  const [agendaRefreshSignal, setAgendaRefreshSignal] = useState(0);

  // 2. Solicitações de retorno e pré-agendamento
  const [reqStatusFilter, setReqStatusFilter] = useState<'all' | ReturnRequestStatus>('all');
  const [requests, setRequests] = useState<ReturnRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [highlightedRequestId, setHighlightedRequestId] = useState<string | null>(null);
  const [bookingModal, setBookingModal] = useState<AgendaBookingModalState>({ kind: 'closed' });
  const [bookingFeedback, setBookingFeedback] = useState('');

  // 3. Atendimentos realizados
  const [attSearch, setAttSearch] = useState('');
  const [attServiceFilter, setAttServiceFilter] = useState('all');
  const [attDaysAgoInput, setAttDaysAgoInput] = useState('');
  const [attendances, setAttendances] = useState<AttendanceRecord[]>([]);
  const [attendancesLoading, setAttendancesLoading] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // 4. Clientes
  const [clientSearch, setClientSearch] = useState('');
  const [clients, setClients] = useState<PanelClientSummary[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [selectedClient, setSelectedClient] = useState<PanelClientSummary | null>(null);

  // 5. Financeiro e Comissões
  const [financeView, setFinanceView] = useState<'daily' | 'period'>('daily');
  const [commissionDate, setCommissionDate] = useState<string>(() => getLocalDateISO());
  const [selectedCommissionDay, setSelectedCommissionDay] =
    useState<DailyCommissionSummary | null>(null);
  const [availableCommissionDays, setAvailableCommissionDays] = useState<DailyCommissionSummary[]>(
    []
  );
  const [updatingPayoutDate, setUpdatingPayoutDate] = useState<string | null>(null);
  const [financePeriod, setFinancePeriod] = useState<PeriodRange>(() =>
    computeRangeForPreset('month')
  );
  const [dudaPeriodAttendances, setDudaPeriodAttendances] = useState<AttendanceRecord[]>([]);
  const [periodSummary, setPeriodSummary] = useState({
    count: 0,
    totalReceived: 0,
    totalCommissionToReceive: 0,
  });
  const [financeLoading, setFinanceLoading] = useState(false);

  // 6. Relatórios
  const [reportPeriod, setReportPeriod] = useState<PeriodRange>(() =>
    computeRangeForPreset('month')
  );
  const [reportAttendances, setReportAttendances] = useState<AttendanceRecord[]>([]);
  const [reportLoading, setReportLoading] = useState(false);

  // 7. Notificações individuais
  const [notifications, setNotifications] = useState<StudioNotification[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);

  const parsedAttDaysAgo =
    attDaysAgoInput.trim() === '' ? null : Number.parseInt(attDaysAgoInput, 10);
  const attTargetDate =
    parsedAttDaysAgo !== null && Number.isFinite(parsedAttDaysAgo) && parsedAttDaysAgo >= 0
      ? addDaysToISO(brazilToday, -parsedAttDaysAgo)
      : null;

  const loadRequests = useCallback(async () => {
    setRequestsLoading(true);
    setError('');
    try {
      const data = await fetchAdminReturnRequests({
        professional: 'duda',
        status: reqStatusFilter !== 'all' ? reqStatusFilter : undefined,
      });
      setRequests(data.requests);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao carregar solicitações da Duda.'
      );
    } finally {
      setRequestsLoading(false);
    }
  }, [reqStatusFilter]);

  const loadAttendances = useCallback(async () => {
    setAttendancesLoading(true);
    setError('');
    try {
      const data = await fetchAdminAttendances({
        professional: 'duda',
        serviceId: attServiceFilter,
        startDate: attTargetDate || undefined,
        endDate: attTargetDate || undefined,
        search: attSearch || undefined,
      });
      setAttendances(data.attendances);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao carregar atendimentos da Duda.'
      );
    } finally {
      setAttendancesLoading(false);
    }
  }, [attServiceFilter, attTargetDate, attSearch]);

  const loadClients = useCallback(async () => {
    setClientsLoading(true);
    setError('');
    try {
      const data = await fetchAdminClients(clientSearch, 'duda');
      setClients(data.clients);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar clientes da Duda.');
    } finally {
      setClientsLoading(false);
    }
  }, [clientSearch]);

  const loadFinance = useCallback(async () => {
    setFinanceLoading(true);
    setError('');
    try {
      if (financeView === 'daily') {
        const data = await fetchAdminCommissions(commissionDate);
        setSelectedCommissionDay(data.selectedDay);
        setAvailableCommissionDays(data.availableDays);
      } else {
        const data = await fetchAdminDudaFinance({
          startDate: financePeriod.startDate || undefined,
          endDate: financePeriod.endDate || undefined,
        });
        setDudaPeriodAttendances(data.attendances);
        setPeriodSummary({
          count: data.summary.count,
          totalReceived: data.summary.totalReceived,
          totalCommissionToReceive: data.summary.totalCommissionToReceive,
        });
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao carregar financeiro da Duda.'
      );
    } finally {
      setFinanceLoading(false);
    }
  }, [financeView, commissionDate, financePeriod.startDate, financePeriod.endDate]);

  const loadReports = useCallback(async () => {
    setReportLoading(true);
    setError('');
    try {
      const data = await fetchAdminAttendances({
        professional: 'duda',
        startDate: reportPeriod.startDate || undefined,
        endDate: reportPeriod.endDate || undefined,
      });
      setReportAttendances(data.attendances);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar relatórios da Duda.');
    } finally {
      setReportLoading(false);
    }
  }, [reportPeriod.startDate, reportPeriod.endDate]);

  const loadNotifications = useCallback(async () => {
    setNotificationsLoading(true);
    setError('');
    try {
      const data = await fetchAdminNotifications('duda');
      setNotifications(data.notifications);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao carregar notificações da Duda.'
      );
    } finally {
      setNotificationsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (section === 'requests') void loadRequests();
    else if (section === 'attendances') void loadAttendances();
    else if (section === 'clients') void loadClients();
    else if (section === 'finance') void loadFinance();
    else if (section === 'reports') void loadReports();
    else if (section === 'notifications') void loadNotifications();
  }, [
    section,
    loadRequests,
    loadAttendances,
    loadClients,
    loadFinance,
    loadReports,
    loadNotifications,
  ]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  useEffect(() => {
    if (!focusSectionSignal) return;
    setSection(focusSectionSignal.section);
    if (focusSectionSignal.targetDate) {
      setAgendaFocusDate(focusSectionSignal.targetDate);
    }
    if (focusSectionSignal.returnRequestId) {
      setHighlightedRequestId(focusSectionSignal.returnRequestId);
    }
    setAgendaRefreshSignal((n) => n + 1);
  }, [focusSectionSignal]);

  useEffect(() => {
    if (!externalInitialBooking) return;
    setSection('agenda');
    setAgendaInitialBooking(externalInitialBooking);
    onExternalInitialBookingConsumed?.();
  }, [externalInitialBooking, onExternalInitialBookingConsumed]);

  useEffect(() => {
    if (refreshSignal && refreshSignal > 0) {
      setAgendaRefreshSignal((n) => n + 1);
      if (section === 'requests') void loadRequests();
      if (section === 'notifications') void loadNotifications();
    }
  }, [refreshSignal, section, loadRequests, loadNotifications]);

  async function handleResetDudaPassword() {
    setError('');
    try {
      await resetDudaPasswordByAdmin();
      setConfirmResetDuda(false);
      setResetFeedback(
        'Senha da Duda redefinida. No próximo acesso dela, o sistema pedirá para cadastrar uma nova senha.'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível redefinir a senha.');
    }
  }

  async function handleDeleteAttendance(id: string) {
    setError('');
    try {
      await deleteAdminAttendance(id);
      setAttendances((prev) => prev.filter((item) => item.id !== id));
      setConfirmDeleteId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir atendimento.');
    }
  }

  async function handleTogglePayoutStatus(date: string, current: PayoutStatus) {
    const next: PayoutStatus = current === 'paid' ? 'pending' : 'paid';
    setUpdatingPayoutDate(date);
    setError('');
    try {
      const res = await updateAdminCommissionStatus(date, next);
      setSelectedCommissionDay((prev) =>
        prev && prev.date === date
          ? { ...prev, payoutStatus: res.payoutStatus, paidAt: res.paidAt }
          : prev
      );
      setAvailableCommissionDays((prev) =>
        prev.map((d) =>
          d.date === date ? { ...d, payoutStatus: res.payoutStatus, paidAt: res.paidAt } : d
        )
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao atualizar situação do repasse.'
      );
    } finally {
      setUpdatingPayoutDate(null);
    }
  }

  async function handleMarkDudaNotificationRead(id?: string) {
    try {
      await markAdminNotificationsRead(id, 'duda');
      setNotifications((prev) =>
        prev.map((n) => (!id || n.id === id ? { ...n, read: true } : n))
      );
    } catch {
      // Non-blocking
    }
  }

  const unreadDudaNotifications = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  const reportMetrics = useMemo(() => {
    const totalProduced = reportAttendances.reduce((acc, r) => acc + r.totalPaid, 0);
    const totalCommission = reportAttendances.reduce(
      (acc, r) => acc + r.commissionAmount,
      0
    );
    const avgTicket =
      reportAttendances.length > 0 ? totalProduced / reportAttendances.length : 0;

    const procMap = new Map<string, { name: string; count: number; totalValue: number }>();
    const additionalMap = new Map<string, number>();

    for (const att of reportAttendances) {
      for (const svc of att.services) {
        const key = svc.name;
        const curr = procMap.get(key) ?? { name: key, count: 0, totalValue: 0 };
        curr.count += 1;
        curr.totalValue += svc.price;
        procMap.set(key, curr);
      }
      for (const add of att.additionals) {
        additionalMap.set(add, (additionalMap.get(add) ?? 0) + 1);
      }
    }

    const procedureBreakdown = Array.from(procMap.values()).sort(
      (a, b) => b.count - a.count || b.totalValue - a.totalValue
    );
    const additionalBreakdown = Array.from(additionalMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    return {
      count: reportAttendances.length,
      totalProduced,
      totalCommission,
      avgTicket,
      procedureBreakdown,
      additionalBreakdown,
    };
  }, [reportAttendances]);

  return (
    <div className="space-y-5">
      {/* Cabeçalho exclusivo do espaço da Duda */}
      <div className="bg-surface border border-border rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl font-bold text-brand-strong">
              Acompanhamento da Duda
            </h2>
            <p className="text-xs sm:text-sm text-text-secondary">
              Agenda, solicitações, atendimentos, clientes, financeiro, comissões, relatórios e
              notificações individuais da Duda
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {confirmResetDuda ? (
              <div className="flex flex-wrap items-center gap-2 bg-background border border-border rounded-xl px-3 py-1.5 text-xs">
                <span className="text-text-primary">
                  Liberar novo cadastro de senha para Duda?
                </span>
                <button
                  type="button"
                  onClick={() => void handleResetDudaPassword()}
                  className="px-2.5 py-1 rounded-lg font-semibold btn-primary"
                >
                  Confirmar
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmResetDuda(false)}
                  className="px-2.5 py-1 rounded-lg btn-secondary"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setResetFeedback('');
                  setConfirmResetDuda(true);
                }}
                className="min-h-[38px] px-3 py-1.5 rounded-xl bg-background border border-border text-xs font-medium inline-flex items-center gap-1.5 transition-colors btn-ghost"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Redefinir senha da Duda</span>
              </button>
            )}
          </div>
        </div>

        {/* Sub-navegação interna da Duda */}
        <div className="flex flex-wrap gap-1.5 pt-2 border-t border-border">
          {DUDA_SUBTABS.map((tab) => {
            const Icon = tab.icon;
            const active = section === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSection(tab.id)}
                aria-pressed={active}
                className={`min-h-[40px] px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold inline-flex items-center gap-2 transition-colors ${
                  active ? 'tab-active' : 'bg-brand-soft/60 tab-idle'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{tab.label}</span>
                {tab.id === 'notifications' && unreadDudaNotifications > 0 && (
                  <span className="px-1.5 py-0.5 rounded-md bg-brand-strong text-surface text-[10px] font-bold tabular-nums leading-none">
                    {unreadDudaNotifications}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {resetFeedback && (
        <div className="p-3.5 rounded-xl bg-success-soft border border-success-border text-sm text-success">
          {resetFeedback}
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-xl bg-error-soft border border-error-border text-sm text-error">
          {error}
        </div>
      )}

      {/* 1. AGENDA DA DUDA */}
      {section === 'agenda' && (
        <AgendaCalendarTab
          isAdmin={true}
          lockedProfessional="duda"
          initialDate={agendaFocusDate}
          initialBooking={agendaInitialBooking}
          onInitialBookingConsumed={() => setAgendaInitialBooking(null)}
          refreshSignal={agendaRefreshSignal}
        />
      )}

      {/* 2. SOLICITAÇÕES DE RETORNO E PRÉ-AGENDAMENTO DA DUDA */}
      {section === 'requests' && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-surface border border-border rounded-2xl p-4">
            <div className="grid grid-cols-2 sm:flex w-full sm:w-auto max-w-full gap-1 p-1 bg-brand-soft rounded-xl">
              {(
                [
                  { id: 'all', label: 'Todos' },
                  { id: 'waiting', label: 'Aguardando confirmação' },
                  { id: 'pending_partner', label: 'Aguardando Laís' },
                  { id: 'confirmed', label: 'Confirmado' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setReqStatusFilter(opt.id)}
                  aria-pressed={reqStatusFilter === opt.id}
                  className={`min-h-[42px] min-w-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors text-center ${
                    reqStatusFilter === opt.id ? 'tab-active' : 'tab-idle'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => void loadRequests()}
              className="min-h-[40px] px-3.5 py-2 inline-flex items-center gap-1.5 text-xs font-semibold rounded-xl transition-colors btn-secondary"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${requestsLoading ? 'animate-spin' : ''}`} />
              <span>Atualizar</span>
            </button>
          </div>

          {bookingFeedback && (
            <div className="p-3.5 rounded-xl bg-success-soft border border-success-border text-sm text-success flex flex-wrap items-center justify-between gap-3">
              <span>{bookingFeedback}</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSection('agenda')}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold btn-success"
                >
                  Ver na agenda da Duda
                </button>
                <button
                  type="button"
                  onClick={() => setBookingFeedback('')}
                  aria-label="Fechar aviso"
                  className="text-success hover:opacity-75"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          <div className="bg-surface border border-border rounded-2xl overflow-hidden">
            {requestsLoading ? (
              <div className="p-8 text-center text-sm text-text-secondary">
                Carregando solicitações da Duda...
              </div>
            ) : requests.length === 0 ? (
              <div className="p-8 text-center space-y-1.5">
                <p className="text-base font-medium text-text-primary">
                  Nenhuma solicitação encontrada para a Duda
                </p>
                <p className="text-sm text-text-secondary">
                  As solicitações de manutenção e pré-agendamentos com a Duda aparecerão aqui.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {requests.map((item) => {
                  const isConfirmed = item.status === 'confirmed';
                  const isPendingPartner = item.status === 'pending_partner';
                  const targetDate = item.proposedDate || item.returnDate;
                  const requestedTime = item.proposedTime || item.desiredTime;
                  const formattedTimeInMsg = requestedTime
                    ? isValidHHMMTime(requestedTime)
                      ? ` às ${requestedTime}`
                      : ` (${requestedTime})`
                    : '';
                  const message = targetDate
                    ? `Olá ${item.clientName}! Aqui é do estúdio MAIS CÍLIOS. Vi sua solicitação com a Duda para ${formatDateBR(targetDate)}${formattedTimeInMsg}. Vamos confirmar seu horário?`
                    : `Olá ${item.clientName}! Aqui é do estúdio MAIS CÍLIOS. Vamos combinar a data da sua próxima manutenção com a Duda?`;

                  const statusLabel = isConfirmed
                    ? 'Confirmado'
                    : isPendingPartner
                      ? 'Aguardando Laís'
                      : 'Aguardando confirmação';

                  const requiresDudaPanelApproval = item.isJoint;

                  return (
                    <div
                      key={item.id}
                      className={`p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 transition-colors ${
                        highlightedRequestId === item.id
                          ? 'bg-brand-soft/60 ring-2 ring-inset ring-brand/40'
                          : 'hover:bg-background'
                      }`}
                    >
                      <div className="space-y-2 min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                          <h3 className="text-base font-semibold text-text-primary">
                            {item.clientName}
                          </h3>
                          <span
                            className={`inline-flex items-center gap-1 text-xs font-semibold ${
                              isConfirmed
                                ? 'text-success'
                                : isPendingPartner
                                  ? 'text-brand-strong'
                                  : 'text-warning'
                            }`}
                          >
                            {isConfirmed ? (
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            ) : (
                              <Clock className="w-3.5 h-3.5" />
                            )}
                            <span>{statusLabel}</span>
                          </span>
                          {item.isJoint && (
                            <span className="px-2 py-0.5 rounded-md bg-brand-soft border border-brand/40 text-[11px] font-bold uppercase tracking-wider text-brand-strong">
                              Conjunto · Laís + Duda
                            </span>
                          )}
                        </div>

                        <p className="text-sm text-text-secondary">
                          Procedimentos (Duda):{' '}
                          <strong className="text-text-primary">
                            {item.procedures.join(', ')}
                          </strong>
                        </p>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-text-primary">
                          {item.source === 'public_link' && (
                            <span className="text-xs font-semibold text-brand-strong">
                              Pré-agendamento
                            </span>
                          )}
                          <span>
                            Prazo:{' '}
                            <strong>{getReturnOptionLabel(item.returnOption, 'duda')}</strong>
                          </span>
                          {item.returnDate && (
                            <span className="tabular-nums">
                              {item.returnOption === 'specific_date'
                                ? 'Data escolhida:'
                                : 'Data prevista:'}{' '}
                              <strong className="text-brand-strong">
                                {formatDateBR(item.returnDate)}
                              </strong>
                            </span>
                          )}
                          {item.desiredTime && (
                            <span className="tabular-nums">
                              {isValidHHMMTime(item.desiredTime)
                                ? 'Horário desejado:'
                                : 'Preferência:'}{' '}
                              <strong className="text-brand-strong">
                                {item.desiredTime}
                              </strong>
                            </span>
                          )}
                          {item.proposedDate && item.proposedTime && (
                            <span className="tabular-nums">
                              Horário confirmado:{' '}
                              <strong className="text-brand-strong">
                                {formatDateBR(item.proposedDate)} às {item.proposedTime}
                              </strong>
                            </span>
                          )}
                        </div>

                        {item.notes && (
                          <p className="text-xs text-text-secondary">
                            Obs. da cliente:{' '}
                            <strong className="text-text-primary">{item.notes}</strong>
                          </p>
                        )}

                        {item.isJoint && item.partner && (
                          <div className="p-2.5 rounded-xl bg-brand-soft/75 border border-brand/35 text-xs text-text-secondary space-y-0.5">
                            <p>
                              <strong className="text-brand-strong">Laís:</strong>{' '}
                              {item.partner.procedures.join(', ')}
                            </p>
                            <p>
                              Status / horário da Laís:{' '}
                              <strong className="text-text-primary">
                                {item.partner.status === 'confirmed' &&
                                item.partner.proposedDate &&
                                item.partner.proposedTime
                                  ? `Confirmado para ${formatDateBR(item.partner.proposedDate)} às ${item.partner.proposedTime}`
                                  : item.partner.status === 'confirmed'
                                    ? 'Confirmado'
                                    : 'Aguardando confirmação dela'}
                              </strong>
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                        <a
                          href={buildWhatsAppLink(item.whatsapp, message)}
                          target="_blank"
                          rel="noreferrer"
                          className="min-h-[42px] px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-1.5 transition-colors tabular-nums btn-success-soft"
                        >
                          <MessageCircle className="w-4 h-4" />
                          <span>{item.whatsapp}</span>
                        </a>

                        {isConfirmed ? (
                          <button
                            type="button"
                            onClick={() => {
                              setAgendaFocusDate(targetDate || undefined);
                              setSection('agenda');
                            }}
                            className="min-h-[42px] px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-1.5 transition-colors btn-secondary"
                          >
                            <Calendar className="w-4 h-4" />
                            <span>Ver na agenda</span>
                          </button>
                        ) : requiresDudaPanelApproval ? (
                          <span className="min-h-[42px] px-4 py-2 rounded-xl bg-brand-soft border border-brand/35 text-xs font-semibold text-brand-strong inline-flex items-center">
                            Aguardando aprovação no painel da Duda
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              setBookingModal({
                                kind: 'confirm-return-request',
                                request: item,
                              })
                            }
                            className="min-h-[42px] px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-1.5 transition-colors btn-primary"
                          >
                            <CalendarPlus className="w-4 h-4" />
                            <span>Adicionar à agenda</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. ATENDIMENTOS REALIZADOS PELA DUDA */}
      {section === 'attendances' && (
        <div className="space-y-5">
          <div className="bg-surface border border-border rounded-2xl p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="relative">
                <Search className="w-4 h-4 text-brand absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={attSearch}
                  onChange={(e) => setAttSearch(e.target.value)}
                  placeholder="Buscar cliente ou telefone..."
                  className="w-full min-h-[44px] pl-10 pr-3 py-2 border rounded-xl field-control text-base"
                />
              </div>

              <select
                value={attServiceFilter}
                onChange={(e) => setAttServiceFilter(e.target.value)}
                aria-label="Filtrar por serviço da Duda"
                className="min-h-[44px] px-3 py-2 border rounded-xl field-control text-base"
              >
                <option value="all">Todos os serviços da Duda</option>
                {DUDA_SERVICES.map((svc) => (
                  <option key={svc.id} value={svc.id}>
                    {svc.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="pt-2 border-t border-border flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex flex-wrap items-center gap-2.5 text-sm font-medium text-text-primary">
                  <span>Consultar há quantos dias?</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={attDaysAgoInput}
                    onChange={(e) => setAttDaysAgoInput(e.target.value.replace(/\D/g, ''))}
                    placeholder="Ex: 1, 5, 15, 30"
                    className="w-36 min-h-[44px] px-3 py-1.5 font-semibold border rounded-xl tabular-nums field-control text-base"
                  />
                </label>

                {attTargetDate !== null && parsedAttDaysAgo !== null ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs sm:text-sm font-semibold text-brand-strong tabular-nums">
                      Data: {formatDateBR(attTargetDate)}{' '}
                      {parsedAttDaysAgo === 0
                        ? '(Hoje)'
                        : parsedAttDaysAgo === 1
                          ? '(Ontem)'
                          : `(Há ${parsedAttDaysAgo} dias)`}
                    </span>
                    <button
                      type="button"
                      onClick={() => setAttDaysAgoInput('')}
                      className="min-h-[36px] px-3 py-1 text-xs font-semibold rounded-lg btn-secondary"
                    >
                      Todo período
                    </button>
                  </div>
                ) : (
                  <span className="text-xs text-text-secondary">
                    Exibindo todos os dias (horário de Brasília)
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => void loadAttendances()}
                className="min-h-[40px] px-3.5 py-2 inline-flex items-center gap-1.5 text-xs font-semibold rounded-xl transition-colors self-start lg:self-auto btn-secondary"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${attendancesLoading ? 'animate-spin' : ''}`}
                />
                <span>Atualizar</span>
              </button>
            </div>
          </div>

          <div className="bg-surface border border-border rounded-2xl overflow-hidden">
            {attendancesLoading ? (
              <div className="p-8 text-center text-sm text-text-secondary">
                Carregando atendimentos da Duda...
              </div>
            ) : attendances.length === 0 ? (
              <div className="p-8 text-center space-y-1.5">
                <p className="text-base font-medium text-text-primary">
                  Nenhum atendimento da Duda encontrado
                </p>
                <p className="text-sm text-text-secondary">
                  Ajuste os filtros acima para visualizar outros períodos.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {attendances.map((item) => (
                  <div
                    key={item.id}
                    className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-background"
                  >
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                        <h3 className="text-base font-semibold text-text-primary">
                          {item.clientName}
                        </h3>
                        <span aria-hidden="true" className="text-border">
                          ·
                        </span>
                        <span className="text-xs text-text-secondary tabular-nums">
                          {formatDateBR(item.serviceDate)} · {formatBrazilTimeBR(item.createdAt)}
                        </span>
                      </div>

                      <p className="text-sm text-text-primary">
                        {item.services.map((s) => s.name).join(' · ')}
                        {item.additionals.length > 0 && (
                          <span className="text-xs text-brand-strong">
                            {' '}
                            · Adicionais: {item.additionals.join(', ')}
                          </span>
                        )}
                      </p>

                      <a
                        href={buildWhatsAppLink(item.whatsapp)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-success hover:underline tabular-nums"
                      >
                        <MessageCircle className="w-4 h-4" />
                        <span>{item.whatsapp}</span>
                      </a>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-border">
                      <div className="text-left lg:text-right">
                        <span className="block text-xs text-text-secondary">Valor pago</span>
                        <span className="text-base font-bold metric-value tabular-nums">
                          {formatBRL(item.totalPaid)}
                        </span>
                        <span className="block text-xs font-medium text-brand-strong tabular-nums">
                          Comissão 25%: {formatBRL(item.commissionAmount)}
                        </span>
                      </div>

                      {confirmDeleteId === item.id ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => void handleDeleteAttendance(item.id)}
                            className="min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold btn-danger-solid"
                          >
                            Excluir
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="min-h-[38px] px-2.5 py-1.5 rounded-lg text-xs font-medium btn-secondary"
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(item.id)}
                          aria-label="Excluir registro"
                          className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-text-secondary hover:text-error hover:bg-error-soft transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. CLIENTES DA DUDA */}
      {section === 'clients' && (
        <ClientsTabView
          clients={clients}
          loading={clientsLoading}
          search={clientSearch}
          onSearchChange={setClientSearch}
          brazilToday={brazilToday}
          onSelectClient={setSelectedClient}
          onScheduleClient={(client) => {
            setAgendaInitialBooking({
              requestId: Date.now(),
              clientName: client.clientName,
              whatsapp: client.whatsapp,
              professional: 'duda',
            });
            setSection('agenda');
          }}
          emptySubtitle="As clientes atendidas pela Duda aparecerão aqui conforme os atendimentos forem confirmados."
        />
      )}

      {/* 5. FINANCEIRO E COMISSÕES DA DUDA */}
      {section === 'finance' && (
        <div className="space-y-5">
          <div className="bg-surface border border-border rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1 p-1 bg-brand-soft rounded-xl">
              <button
                type="button"
                onClick={() => setFinanceView('daily')}
                aria-pressed={financeView === 'daily'}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  financeView === 'daily' ? 'tab-active' : 'tab-idle'
                }`}
              >
                Comissões por dia
              </button>
              <button
                type="button"
                onClick={() => setFinanceView('period')}
                aria-pressed={financeView === 'period'}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  financeView === 'period' ? 'tab-active' : 'tab-idle'
                }`}
              >
                Resumo financeiro por período
              </button>
            </div>

            <button
              type="button"
              onClick={() => void loadFinance()}
              className="min-h-[40px] px-3.5 py-2 inline-flex items-center gap-1.5 text-xs font-semibold rounded-xl transition-colors btn-secondary"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${financeLoading ? 'animate-spin' : ''}`} />
              <span>Atualizar</span>
            </button>
          </div>

          {financeView === 'daily' ? (
            <div className="space-y-5">
              <div className="bg-surface border border-border rounded-2xl p-4 flex flex-wrap items-center gap-3">
                <Calendar className="w-4 h-4 text-brand" />
                <span className="text-sm font-medium text-text-primary">
                  Consultar dia específico:
                </span>
                <input
                  type="date"
                  aria-label="Data das comissões da Duda"
                  value={commissionDate}
                  onChange={(e) => e.target.value && setCommissionDate(e.target.value)}
                  className="min-h-[44px] px-3 py-1.5 font-semibold border rounded-xl tabular-nums field-control text-base"
                />
                <button
                  type="button"
                  onClick={() => setCommissionDate(getLocalDateISO())}
                  className="min-h-[40px] px-3 py-1.5 text-xs font-semibold rounded-xl btn-secondary"
                >
                  Hoje
                </button>
              </div>

              {selectedCommissionDay && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-surface border border-border rounded-2xl p-5">
                    <span className="text-xs font-medium text-text-secondary">
                      Recebido pela Duda em {formatDateBR(selectedCommissionDay.date)}
                    </span>
                    <p className="mt-1.5 text-2xl sm:text-3xl font-bold metric-value tabular-nums">
                      {formatBRL(selectedCommissionDay.totalProduced)}
                    </p>
                  </div>

                  <div className="bg-brand-soft rounded-2xl p-5 metric-card-accent">
                    <span className="text-xs font-medium text-brand-strong">
                      Comissão de 25% a receber
                    </span>
                    <p className="mt-1.5 text-2xl sm:text-3xl font-bold text-brand-strong tabular-nums">
                      {formatBRL(selectedCommissionDay.commissionAmount)}
                    </p>
                  </div>

                  <div className="bg-surface border border-border rounded-2xl p-5 flex flex-col justify-between gap-2">
                    <span className="text-xs font-medium text-text-secondary">
                      Situação do repasse
                    </span>
                    {selectedCommissionDay.count === 0 ? (
                      <span className="text-base font-semibold text-text-secondary">
                        Sem atendimentos neste dia
                      </span>
                    ) : (
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`inline-flex items-center gap-1.5 text-lg font-bold ${
                            selectedCommissionDay.payoutStatus === 'paid'
                              ? 'text-success'
                              : 'text-warning'
                          }`}
                        >
                          {selectedCommissionDay.payoutStatus === 'paid' ? (
                            <CheckCircle2 className="w-5 h-5" />
                          ) : (
                            <Clock className="w-5 h-5" />
                          )}
                          <span>
                            {selectedCommissionDay.payoutStatus === 'paid'
                              ? 'Repassado'
                              : 'Pendente'}
                          </span>
                        </span>

                        <button
                          type="button"
                          disabled={updatingPayoutDate === selectedCommissionDay.date}
                          onClick={() =>
                            void handleTogglePayoutStatus(
                              selectedCommissionDay.date,
                              selectedCommissionDay.payoutStatus
                            )
                          }
                          className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                            selectedCommissionDay.payoutStatus === 'paid'
                              ? 'bg-background hover:bg-brand-soft text-text-secondary border border-border'
                              : 'btn-primary'
                          }`}
                        >
                          {selectedCommissionDay.payoutStatus === 'paid'
                            ? 'Voltar p/ pendente'
                            : 'Marcar repassado'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="bg-surface border border-border rounded-2xl overflow-hidden">
                <div className="px-5 py-3.5 border-b border-border">
                  <h3 className="text-base font-semibold text-text-primary">
                    Repasses da Duda por dia
                  </h3>
                </div>
                {availableCommissionDays.length === 0 ? (
                  <div className="p-8 text-center text-sm text-text-secondary">
                    Nenhum atendimento da Duda registrado até o momento.
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {availableCommissionDays.map((day) => {
                      const selected = day.date === commissionDate;
                      const isPaid = day.payoutStatus === 'paid';
                      return (
                        <div
                          key={day.date}
                          className={`p-4 sm:px-5 flex flex-wrap items-center justify-between gap-3 ${
                            selected ? 'bg-brand-soft' : 'hover:bg-background'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => setCommissionDate(day.date)}
                            className="text-left space-y-0.5"
                          >
                            <span className="block text-base font-semibold text-text-primary tabular-nums">
                              {formatDateBR(day.date)}
                            </span>
                            <span className="block text-xs text-text-secondary tabular-nums">
                              {day.count} {day.count === 1 ? 'atendimento' : 'atendimentos'}
                            </span>
                          </button>

                          <div className="flex flex-wrap items-center gap-4 sm:gap-6 tabular-nums">
                            <div className="text-right">
                              <span className="block text-xs text-text-secondary">Recebido</span>
                              <span className="text-sm font-bold metric-value">
                                {formatBRL(day.totalProduced)}
                              </span>
                            </div>
                            <div className="text-right">
                              <span className="block text-xs text-brand-strong">
                                Comissão 25%
                              </span>
                              <span className="text-sm font-bold text-brand-strong">
                                {formatBRL(day.commissionAmount)}
                              </span>
                            </div>
                            <button
                              type="button"
                              disabled={updatingPayoutDate === day.date}
                              onClick={() =>
                                void handleTogglePayoutStatus(day.date, day.payoutStatus)
                              }
                              className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
                                isPaid
                                  ? 'bg-success-soft text-success border border-success-border'
                                  : 'bg-warning-soft text-warning border border-warning-border hover:bg-warning-selected'
                              }`}
                            >
                              {isPaid ? (
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              ) : (
                                <Clock className="w-3.5 h-3.5" />
                              )}
                              <span>{isPaid ? 'Repassado' : 'Marcar repassado'}</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="bg-surface border border-border rounded-2xl p-4">
                <PeriodFilterBar value={financePeriod} onChange={setFinancePeriod} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-surface border border-border rounded-2xl p-5">
                  <span className="text-xs font-medium text-text-secondary">
                    Atendimentos da Duda no período
                  </span>
                  <p className="mt-1.5 text-2xl sm:text-3xl font-bold metric-value tabular-nums">
                    {periodSummary.count}
                  </p>
                </div>

                <div className="bg-surface border border-border rounded-2xl p-5">
                  <span className="text-xs font-medium text-text-secondary">
                    Total recebido nos atendimentos da Duda
                  </span>
                  <p className="mt-1.5 text-2xl sm:text-3xl font-bold metric-value tabular-nums">
                    {formatBRL(periodSummary.totalReceived)}
                  </p>
                </div>

                <div className="bg-brand-soft rounded-2xl p-5 metric-card-accent">
                  <span className="text-xs font-medium text-brand-strong">
                    Total de comissão 25% (Duda → Laís)
                  </span>
                  <p className="mt-1.5 text-2xl sm:text-3xl font-bold text-brand-strong tabular-nums">
                    {formatBRL(periodSummary.totalCommissionToReceive)}
                  </p>
                </div>
              </div>

              <div className="bg-surface border border-border rounded-2xl overflow-hidden">
                {financeLoading ? (
                  <div className="p-8 text-center text-sm text-text-secondary">
                    Carregando financeiro da Duda...
                  </div>
                ) : dudaPeriodAttendances.length === 0 ? (
                  <div className="p-8 text-center text-sm text-text-secondary">
                    Nenhum atendimento da Duda encontrado neste período.
                  </div>
                ) : (
                  <div
                    className="overflow-x-auto"
                    tabIndex={0}
                    role="region"
                    aria-label="Resumo financeiro da Duda por período"
                  >
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-border bg-background text-xs font-semibold text-text-secondary">
                          <th className="py-3 px-4">Data</th>
                          <th className="py-3 px-4">Cliente</th>
                          <th className="py-3 px-4">Serviços</th>
                          <th className="py-3 px-4 text-right">Valor recebido</th>
                          <th className="py-3 px-4 text-right">Comissão (25%)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border text-sm">
                        {dudaPeriodAttendances.map((item) => (
                          <tr key={item.id} className="hover:bg-background">
                            <td className="py-3 px-4 text-text-secondary tabular-nums whitespace-nowrap">
                              {formatDateBR(item.serviceDate)} ·{' '}
                              {formatBrazilTimeBR(item.createdAt)}
                            </td>
                            <td className="py-3 px-4 font-medium text-text-primary">
                              {item.clientName}
                            </td>
                            <td className="py-3 px-4 text-text-secondary">
                              {item.services.map((s) => s.name).join(', ')}
                            </td>
                            <td className="py-3 px-4 text-right font-semibold text-text-primary tabular-nums whitespace-nowrap">
                              {formatBRL(item.totalPaid)}
                            </td>
                            <td className="py-3 px-4 text-right font-bold text-brand-strong tabular-nums whitespace-nowrap">
                              {formatBRL(item.commissionAmount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 6. RELATÓRIOS DA DUDA */}
      {section === 'reports' && (
        <div className="space-y-5">
          <div className="bg-surface border border-border rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
            <PeriodFilterBar value={reportPeriod} onChange={setReportPeriod} />
            <button
              type="button"
              onClick={() => void loadReports()}
              className="min-h-[40px] px-3.5 py-2 inline-flex items-center gap-1.5 text-xs font-semibold rounded-xl transition-colors btn-secondary"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${reportLoading ? 'animate-spin' : ''}`} />
              <span>Atualizar</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-surface border border-border rounded-2xl p-5">
              <span className="text-xs font-medium text-text-secondary">
                Atendimentos realizados
              </span>
              <p className="mt-1.5 text-2xl sm:text-3xl font-bold metric-value tabular-nums">
                {reportMetrics.count}
              </p>
            </div>

            <div className="bg-surface border border-border rounded-2xl p-5">
              <span className="text-xs font-medium text-text-secondary">
                Faturamento da Duda
              </span>
              <p className="mt-1.5 text-2xl sm:text-3xl font-bold metric-value tabular-nums">
                {formatBRL(reportMetrics.totalProduced)}
              </p>
            </div>

            <div className="bg-brand-soft rounded-2xl p-5 metric-card-accent">
              <span className="text-xs font-medium text-brand-strong">
                Comissão 25% gerada
              </span>
              <p className="mt-1.5 text-2xl sm:text-3xl font-bold text-brand-strong tabular-nums">
                {formatBRL(reportMetrics.totalCommission)}
              </p>
            </div>

            <div className="bg-surface border border-border rounded-2xl p-5">
              <span className="text-xs font-medium text-text-secondary">Ticket médio</span>
              <p className="mt-1.5 text-2xl sm:text-3xl font-bold metric-value tabular-nums">
                {formatBRL(reportMetrics.avgTicket)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-surface border border-border rounded-2xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
                <h3 className="text-base font-semibold text-text-primary">
                  Procedimentos mais realizados (Duda)
                </h3>
                <span className="text-xs text-text-secondary tabular-nums">
                  {reportMetrics.procedureBreakdown.length} tipos
                </span>
              </div>
              {reportLoading ? (
                <div className="p-6 text-center text-sm text-text-secondary">
                  Gerando relatório...
                </div>
              ) : reportMetrics.procedureBreakdown.length === 0 ? (
                <div className="p-6 text-center text-sm text-text-secondary">
                  Sem procedimentos da Duda no período selecionado.
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {reportMetrics.procedureBreakdown.map((proc) => (
                    <div
                      key={proc.name}
                      className="px-5 py-3 flex items-center justify-between gap-3 text-sm"
                    >
                      <span className="font-medium text-text-primary">{proc.name}</span>
                      <div className="text-right tabular-nums shrink-0">
                        <span className="font-bold text-brand-strong">{proc.count}x</span>
                        <span className="text-text-secondary ml-2">
                          ({formatBRL(proc.totalValue)})
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-surface border border-border rounded-2xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
                <h3 className="text-base font-semibold text-text-primary">
                  Adicionais registrados
                </h3>
                <span className="text-xs text-text-secondary tabular-nums">
                  {reportMetrics.additionalBreakdown.length} tipos
                </span>
              </div>
              {reportMetrics.additionalBreakdown.length === 0 ? (
                <div className="p-6 text-center text-sm text-text-secondary">
                  Nenhum adicional registrado pela Duda neste período.
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {reportMetrics.additionalBreakdown.map((add) => (
                    <div
                      key={add.name}
                      className="px-5 py-3 flex items-center justify-between gap-3 text-sm"
                    >
                      <span className="font-medium text-text-primary">{add.name}</span>
                      <span className="font-bold text-brand-strong tabular-nums">
                        {add.count}x
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 7. NOTIFICAÇÕES INDIVIDUAIS DA DUDA */}
      {section === 'notifications' && (
        <div className="bg-surface border border-border rounded-2xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-text-primary">
                Notificações individuais da Duda
              </h3>
              <p className="text-xs text-text-secondary">
                Avisos enviados exclusivamente para o painel da Duda
              </p>
            </div>
            <div className="flex items-center gap-2">
              {unreadDudaNotifications > 0 && (
                <button
                  type="button"
                  onClick={() => void handleMarkDudaNotificationRead()}
                  className="min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold btn-secondary"
                >
                  Marcar todas como lidas
                </button>
              )}
              <button
                type="button"
                onClick={() => void loadNotifications()}
                className="min-h-[38px] px-3 py-1.5 inline-flex items-center gap-1.5 text-xs font-semibold rounded-xl btn-secondary"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${notificationsLoading ? 'animate-spin' : ''}`}
                />
                <span>Atualizar</span>
              </button>
            </div>
          </div>

          {notificationsLoading ? (
            <div className="p-8 text-center text-sm text-text-secondary">
              Carregando notificações da Duda...
            </div>
          ) : notifications.length === 0 ? (
            <div className="p-8 text-center text-sm text-text-secondary">
              Nenhuma notificação individual da Duda no momento.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {notifications.map((notif) => (
                <div
                  key={notif.id}
                  className={`p-4 sm:px-5 space-y-2 ${
                    notif.read ? 'bg-surface' : 'bg-brand-soft/50'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-brand-strong">
                        {notif.requestTypeLabel || notif.title}
                      </span>
                      {notif.isJoint && (
                        <span className="px-2 py-0.5 rounded-md bg-brand-soft border border-brand/40 text-[10px] font-bold uppercase text-brand-strong">
                          Conjunto · Laís + Duda
                        </span>
                      )}
                      {!notif.read && (
                        <span className="text-[11px] font-semibold text-brand-strong">
                          · Não lida
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-text-secondary tabular-nums">
                      {formatDateBR(notif.createdAt.slice(0, 10))} às{' '}
                      {formatBrazilTimeBR(notif.createdAt)}
                    </span>
                  </div>

                  {notif.clientName && (
                    <p className="text-sm font-semibold text-text-primary">
                      Cliente: {notif.clientName}
                    </p>
                  )}

                  {notif.procedures && notif.procedures.length > 0 && (
                    <p className="text-xs sm:text-sm text-text-secondary">
                      <strong className="text-text-primary">Procedimentos:</strong>{' '}
                      {notif.procedures.join(', ')}
                    </p>
                  )}

                  {notif.desiredDate && (
                    <p className="text-xs sm:text-sm text-text-secondary tabular-nums">
                      <strong className="text-text-primary">Data desejada:</strong>{' '}
                      {formatDateBR(notif.desiredDate)}
                      {notif.desiredTime
                        ? isValidHHMMTime(notif.desiredTime)
                          ? ` às ${notif.desiredTime}`
                          : ` (${notif.desiredTime})`
                        : ''}
                    </p>
                  )}

                  {!notif.clientName && (
                    <p className="text-sm text-text-primary">{notif.message}</p>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        if (!notif.read) {
                          void handleMarkDudaNotificationRead(notif.id);
                        }
                        if (notif.targetTab === 'agenda') {
                          if (notif.targetDate) setAgendaFocusDate(notif.targetDate);
                          setSection('agenda');
                        } else {
                          setHighlightedRequestId(notif.relatedReturnRequestId ?? null);
                          setSection('requests');
                        }
                      }}
                      className="text-xs font-semibold text-brand-strong hover:underline"
                    >
                      {notif.targetTab === 'agenda'
                        ? 'Ver na agenda da Duda'
                        : 'Ver nas solicitações da Duda'}
                    </button>

                    {!notif.read && (
                      <button
                        type="button"
                        onClick={() => void handleMarkDudaNotificationRead(notif.id)}
                        className="text-xs text-text-secondary hover:underline"
                      >
                        Marcar como lida
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <ClientDetailModal
        client={selectedClient}
        onClose={() => setSelectedClient(null)}
        showProfessionalBadge={false}
      />

      <AgendaBookingModal
        state={bookingModal}
        isAdmin={true}
        onClose={() => setBookingModal({ kind: 'closed' })}
        onSaved={({ appointment, message }) => {
          setBookingModal({ kind: 'closed' });
          if (appointment) {
            setAgendaFocusDate(appointment.appointmentDate);
          }
          setBookingFeedback(message);
          void loadRequests();
          setAgendaRefreshSignal((n) => n + 1);
        }}
      />
    </div>
  );
}
