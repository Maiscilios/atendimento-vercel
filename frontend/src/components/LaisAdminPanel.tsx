import { useCallback, useEffect, useState } from 'react';
import {
  Calendar,
  CalendarClock,
  CalendarPlus,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  DollarSign,
  History,
  Home,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
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
  LAIS_SERVICES,
  addDaysToISO,
  buildWhatsAppLink,
  formatBRL,
  formatBrazilTimeBR,
  formatDateBR,
  getBrazilTodayISO,
  getLocalDateISO,
  getReturnOptionLabel,
  getReturnStatusLabel,
  type AttendanceRecord,
  type AuthUser,
  type Professional,
} from '../../../shared/catalog';
import {
  formatDaysSinceLastVisitBR,
  type DailyCommissionSummary,
  type PanelClientSummary,
  type PayoutStatus,
} from '../../../shared/panelTypes';
import {
  deleteAdminAttendance,
  fetchAdminAttendances,
  fetchAdminClients,
  fetchAdminCommissions,
  fetchAdminDashboard,
  fetchAdminDudaFinance,
  resetDudaPasswordByAdmin,
  updateAdminCommissionStatus,
} from '../lib/api';
import { AgendaBookingModal, type AgendaBookingModalState } from './AgendaBookingModal';
import { AgendaCalendarTab, type AgendaInitialBookingRequest } from './AgendaCalendarTab';
import { ChangePasswordModal } from './ChangePasswordModal';
import { ClientDetailModal } from './ClientDetailModal';
import { PanelSidebarNav, type SidebarNavItem } from './PanelSidebarNav';
import { computeRangeForPreset, PeriodFilterBar, type PeriodRange } from './PeriodFilterBar';

interface LaisAdminPanelProps {
  user: AuthUser;
  onGoHome: () => void;
  onLogout: () => void;
}

type AdminTab = 'home' | 'clients' | 'appointments' | 'agenda' | 'history' | 'finance';

const TABS: Array<SidebarNavItem<AdminTab>> = [
  { id: 'home', label: 'Início', icon: LayoutDashboard },
  { id: 'clients', label: 'Minhas clientes', icon: Users },
  { id: 'appointments', label: 'Agendamentos', icon: CalendarClock },
  { id: 'agenda', label: 'Minha agenda', icon: Calendar },
  { id: 'history', label: 'Histórico de atendimentos', icon: History },
  { id: 'finance', label: 'Controle financeiro', icon: DollarSign },
];

export function LaisAdminPanel({ user, onGoHome, onLogout }: LaisAdminPanelProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>('home');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [confirmResetDuda, setConfirmResetDuda] = useState(false);
  const [resetFeedback, setResetFeedback] = useState('');
  const [error, setError] = useState('');

  // Tab 1: Início
  const [homeDate, setHomeDate] = useState<string>(() => getLocalDateISO());
  const [homeProfFilter, setHomeProfFilter] = useState<'all' | Professional>('all');
  const [homeLoading, setHomeLoading] = useState(true);
  const [dayTotalProduced, setDayTotalProduced] = useState(0);
  const [dayLaisProduced, setDayLaisProduced] = useState(0);
  const [dayDudaProduced, setDayDudaProduced] = useState(0);
  const [dayDudaCommission, setDayDudaCommission] = useState(0);
  const [dayAttendances, setDayAttendances] = useState<AttendanceRecord[]>([]);

  // Tab 2: Minhas clientes
  const [clientSearch, setClientSearch] = useState('');
  const [clientProfFilter, setClientProfFilter] = useState<'all' | Professional>('all');
  const [clients, setClients] = useState<PanelClientSummary[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [selectedClient, setSelectedClient] = useState<PanelClientSummary | null>(null);
  const [brazilToday, setBrazilToday] = useState<string>(() => getBrazilTodayISO());

  // Tab 3: Agendamentos & Minha agenda
  const [apptProfFilter, setApptProfFilter] = useState<'all' | Professional>('all');
  const [apptStatusFilter, setApptStatusFilter] = useState<'all' | 'waiting' | 'confirmed'>('all');
  const [appointments, setAppointments] = useState<AttendanceRecord[]>([]);
  const [appointmentsLoading, setAppointmentsLoading] = useState(false);
  const [agendaBookingState, setAgendaBookingState] = useState<AgendaBookingModalState>({
    kind: 'closed',
  });
  const [agendaFeedback, setAgendaFeedback] = useState('');
  const [agendaFocusDate, setAgendaFocusDate] = useState<string | undefined>(undefined);
  const [agendaFocusProfessional, setAgendaFocusProfessional] = useState<Professional>('lais');
  const [agendaInitialBooking, setAgendaInitialBooking] =
    useState<AgendaInitialBookingRequest | null>(null);

  // Tab 4: Histórico de atendimentos
  const [histProfFilter, setHistProfFilter] = useState<'all' | Professional>('all');
  const [histServiceFilter, setHistServiceFilter] = useState('all');
  const [histDaysAgoInput, setHistDaysAgoInput] = useState('');
  const [histSearch, setHistSearch] = useState('');
  const [historyList, setHistoryList] = useState<AttendanceRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Tab 5: Controle financeiro
  const [financeView, setFinanceView] = useState<'daily' | 'period'>('daily');
  const [commissionDate, setCommissionDate] = useState<string>(() => getLocalDateISO());
  const [selectedCommissionDay, setSelectedCommissionDay] =
    useState<DailyCommissionSummary | null>(null);
  const [availableCommissionDays, setAvailableCommissionDays] = useState<DailyCommissionSummary[]>(
    []
  );
  const [updatingPayoutDate, setUpdatingPayoutDate] = useState<string | null>(null);
  const [financePeriod, setFinancePeriod] = useState<PeriodRange>(() => computeRangeForPreset('all'));
  const [dudaPeriodAttendances, setDudaPeriodAttendances] = useState<AttendanceRecord[]>([]);
  const [periodSummary, setPeriodSummary] = useState({
    count: 0,
    laisCount: 0,
    totalLaisProduced: 0,
    totalReceived: 0,
    totalCommissionToReceive: 0,
  });
  const [financeLoading, setFinanceLoading] = useState(false);

  const loadHome = useCallback(async () => {
    setHomeLoading(true);
    setError('');
    try {
      const data = await fetchAdminDashboard(homeDate, homeProfFilter);
      setDayTotalProduced(data.dayTotalProduced);
      setDayLaisProduced(data.dayLaisProduced);
      setDayDudaProduced(data.dayDudaProduced);
      setDayDudaCommission(data.dayDudaCommission);
      setDayAttendances(data.dayAttendances);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar o resumo do dia.');
    } finally {
      setHomeLoading(false);
    }
  }, [homeDate, homeProfFilter]);

  const loadClients = useCallback(async () => {
    setClientsLoading(true);
    setError('');
    try {
      const data = await fetchAdminClients(clientSearch, clientProfFilter);
      setClients(data.clients);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar clientes.');
    } finally {
      setClientsLoading(false);
    }
  }, [clientSearch, clientProfFilter]);

  const loadAppointments = useCallback(async () => {
    setAppointmentsLoading(true);
    setError('');
    try {
      const data = await fetchAdminAttendances({
        professional: apptProfFilter,
        returnStatus: apptStatusFilter !== 'all' ? apptStatusFilter : undefined,
        onlyReturns: true,
      });
      setAppointments(data.attendances);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar agendamentos.');
    } finally {
      setAppointmentsLoading(false);
    }
  }, [apptProfFilter, apptStatusFilter]);

  const parsedHistDaysAgo =
    histDaysAgoInput.trim() === '' ? null : Number.parseInt(histDaysAgoInput, 10);
  const histTargetDate =
    parsedHistDaysAgo !== null && Number.isFinite(parsedHistDaysAgo) && parsedHistDaysAgo >= 0
      ? addDaysToISO(brazilToday, -parsedHistDaysAgo)
      : null;

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    setError('');
    try {
      const data = await fetchAdminAttendances({
        professional: histProfFilter,
        serviceId: histServiceFilter,
        startDate: histTargetDate || undefined,
        endDate: histTargetDate || undefined,
        search: histSearch || undefined,
      });
      setHistoryList(data.attendances);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar histórico.');
    } finally {
      setHistoryLoading(false);
    }
  }, [histProfFilter, histServiceFilter, histTargetDate, histSearch]);

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
        setPeriodSummary(data.summary);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar controle financeiro.');
    } finally {
      setFinanceLoading(false);
    }
  }, [financeView, commissionDate, financePeriod.startDate, financePeriod.endDate]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const next = getBrazilTodayISO();
      setBrazilToday((prev) => (prev === next ? prev : next));
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (activeTab === 'home') void loadHome();
    else if (activeTab === 'clients') void loadClients();
    else if (activeTab === 'appointments') void loadAppointments();
    else if (activeTab === 'history') void loadHistory();
    else if (activeTab === 'finance') void loadFinance();
  }, [activeTab, loadHome, loadClients, loadAppointments, loadHistory, loadFinance]);

  async function handleDeleteAttendance(id: string) {
    setError('');
    try {
      await deleteAdminAttendance(id);
      setHistoryList((prev) => prev.filter((item) => item.id !== id));
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
      setError(err instanceof Error ? err.message : 'Erro ao atualizar situação do repasse.');
    } finally {
      setUpdatingPayoutDate(null);
    }
  }

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

  return (
    <div className="min-h-screen bg-background pb-12">
      <header className="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-1.5 sm:gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setSidebarOpen((open) => !open)}
              aria-label={sidebarOpen ? 'Fechar menu' : 'Abrir menu'}
              aria-expanded={sidebarOpen}
              className="lg:hidden min-h-[42px] min-w-[42px] rounded-xl flex items-center justify-center shrink-0 transition-colors btn-secondary"
            >
              <Menu className="w-5 h-5" />
            </button>
            <span className="font-display text-xl sm:text-2xl font-bold text-brand-strong whitespace-nowrap">
              MAIS CÍLIOS
            </span>
            <span className="hidden sm:inline text-sm text-text-secondary whitespace-nowrap">
              · Administração ({user.displayName})
            </span>
          </div>

          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={onGoHome}
              className="min-h-[40px] px-2 sm:px-3 py-1.5 inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium rounded-xl transition-colors whitespace-nowrap btn-secondary" aria-label="Tela inicial"
            >
              <Home className="w-4 h-4" />
              <span className="hidden sm:inline">Tela inicial</span>
            </button>
            <button
              type="button"
              onClick={() => setPasswordModalOpen(true)}
              aria-label="Alterar senha"
              className="min-h-[40px] px-2 sm:px-3 py-1.5 inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium rounded-xl transition-colors whitespace-nowrap btn-ghost"
            >
              <KeyRound className="w-4 h-4" />
              <span className="hidden md:inline">Minha senha</span>
            </button>
            <button
              type="button"
              onClick={onLogout}
              aria-label="Sair"
              className="min-h-[40px] px-2 sm:px-3 py-1.5 inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium rounded-xl transition-colors whitespace-nowrap btn-danger"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sair</span>
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 flex flex-col lg:flex-row gap-6 items-start">
        <PanelSidebarNav
          items={TABS}
          activeId={activeTab}
          onSelect={setActiveTab}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          subtitle={`Administração (${user.displayName})`}
        />

        <main className="flex-1 min-w-0 w-full space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <h1 className="font-display text-3xl font-bold text-brand-strong">
                Painel Administrativo da Laís
              </h1>
              <p className="text-sm text-text-secondary">
                Gestão completa de atendimentos, clientes, agendamentos e controle financeiro
              </p>
            </div>

            <div className="flex items-center gap-2">
              {confirmResetDuda ? (
                <div className="flex items-center gap-2 bg-surface border border-border rounded-xl px-3 py-1.5 text-xs">
                  <span className="text-text-primary">Liberar novo cadastro de senha para Duda?</span>
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
                  className="min-h-[38px] px-3 py-1.5 rounded-xl bg-surface border border-border text-xs font-medium inline-flex items-center gap-1.5 transition-colors btn-ghost"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Redefinir senha da Duda</span>
                </button>
              )}
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

        {/* 1. INÍCIO */}
        {activeTab === 'home' && (
          <div className="space-y-5">
            <div className="bg-surface border border-border rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
                  Data selecionada:
                </span>
                <div className="flex flex-wrap items-center gap-1.5 min-w-0 max-w-full">
                  <button
                    type="button"
                    onClick={() => setHomeDate((d) => addDaysToISO(d, -1))}
                    aria-label="Dia anterior"
                    className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-border bg-background btn-ghost"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <input
                    type="date"
                    aria-label="Data do resumo"
                    value={homeDate}
                    onChange={(e) => e.target.value && setHomeDate(e.target.value)}
                    className="w-40 min-w-0 min-h-[44px] px-3 py-1.5 font-semibold border rounded-xl tabular-nums field-control text-base"
                  />
                  <button
                    type="button"
                    onClick={() => setHomeDate((d) => addDaysToISO(d, 1))}
                    aria-label="Próximo dia"
                    className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-border bg-background btn-ghost"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setHomeDate(getLocalDateISO())}
                    className="min-h-[40px] px-3 py-1.5 text-xs font-semibold rounded-xl btn-secondary"
                  >
                    Hoje
                  </button>
                </div>

                <div className="flex items-center gap-1 p-1 bg-brand-soft rounded-xl ml-1">
                  {(
                    [
                      { id: 'all', label: 'Todas' },
                      { id: 'lais', label: 'Laís' },
                      { id: 'duda', label: 'Duda' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setHomeProfFilter(opt.id)}
                      className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                        homeProfFilter === opt.id
                          ? 'tab-active'
                          : 'tab-idle'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={() => void loadHome()}
                className="min-h-[40px] px-3.5 py-2 inline-flex items-center gap-1.5 text-xs font-semibold rounded-xl transition-colors btn-secondary"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${homeLoading ? 'animate-spin' : ''}`} />
                <span>Atualizar</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-surface rounded-2xl p-5 metric-card-featured">
                <span className="text-xs font-medium text-text-secondary">
                  Total produzido no dia ({dayAttendances.length})
                </span>
                <p className="mt-1.5 text-2xl sm:text-3xl font-bold metric-value tabular-nums">
                  {formatBRL(dayTotalProduced)}
                </p>
              </div>

              <div className="bg-surface border border-border rounded-2xl p-5">
                <span className="text-xs font-medium text-text-secondary">
                  Produção Laís no dia
                </span>
                <p className="mt-1.5 text-2xl sm:text-3xl font-bold metric-value tabular-nums">
                  {formatBRL(dayLaisProduced)}
                </p>
              </div>

              <div className="bg-surface border border-border rounded-2xl p-5">
                <span className="text-xs font-medium text-text-secondary">
                  Recebido Duda no dia
                </span>
                <p className="mt-1.5 text-2xl sm:text-3xl font-bold metric-value tabular-nums">
                  {formatBRL(dayDudaProduced)}
                </p>
              </div>

              <div className="bg-brand-soft rounded-2xl p-5 metric-card-accent">
                <span className="text-xs font-medium text-brand-strong">
                  Comissão 25% da Duda no dia
                </span>
                <p className="mt-1.5 text-2xl sm:text-3xl font-bold text-brand-strong tabular-nums">
                  {formatBRL(dayDudaCommission)}
                </p>
              </div>
            </div>

            <div className="bg-surface border border-border rounded-2xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
                <h2 className="text-base font-semibold text-text-primary">
                  Atendimentos de {formatDateBR(homeDate)}
                </h2>
                <span className="text-xs text-text-secondary tabular-nums">
                  {dayAttendances.length} registros
                </span>
              </div>

              {homeLoading ? (
                <div className="p-8 text-center text-sm text-text-secondary">
                  Carregando atendimentos do dia...
                </div>
              ) : dayAttendances.length === 0 ? (
                <div className="p-8 text-center space-y-1.5">
                  <p className="text-base font-medium text-text-primary">
                    Nenhum atendimento registrado em {formatDateBR(homeDate)}
                  </p>
                  <p className="text-sm text-text-secondary">
                    Escolha outra data no calendário acima.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {dayAttendances.map((item) => (
                    <div
                      key={item.id}
                      className="p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-background"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-bold uppercase tracking-wider text-brand-strong">
                            {item.professional === 'lais' ? 'Laís' : 'Duda'}
                          </span>
                          <span aria-hidden="true" className="text-border">
                            ·
                          </span>
                          <h3 className="text-base font-semibold text-text-primary">
                            {item.clientName}
                          </h3>
                          <span aria-hidden="true" className="text-border">
                            ·
                          </span>
                          <span className="text-xs text-text-secondary tabular-nums">
                            {formatBrazilTimeBR(item.createdAt)}
                          </span>
                        </div>
                        <p className="text-sm text-text-secondary">
                          {item.services.map((s) => s.name).join(' · ')}
                          {item.additionals.length > 0 && (
                            <span className="text-xs text-brand-strong">
                              {' '}
                              · Adicionais: {item.additionals.join(', ')}
                            </span>
                          )}
                        </p>
                      </div>

                      <div className="flex items-center gap-6 sm:text-right shrink-0">
                        <div>
                          <span className="block text-xs text-text-secondary">Valor recebido</span>
                          <span className="text-base font-bold metric-value tabular-nums">
                            {formatBRL(item.totalPaid)}
                          </span>
                        </div>
                        {item.professional === 'duda' && (
                          <div>
                            <span className="block text-xs text-brand-strong">Comissão (25%)</span>
                            <span className="text-base font-bold text-brand-strong tabular-nums">
                              {formatBRL(item.commissionAmount)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 2. MINHAS CLIENTES */}
        {activeTab === 'clients' && (
          <div className="space-y-5">
            <div className="bg-surface border border-border rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-1">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 text-brand absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={clientSearch}
                    onChange={(e) => setClientSearch(e.target.value)}
                    placeholder="Pesquisar cliente por nome ou WhatsApp..."
                    className="w-full min-h-[44px] pl-10 pr-4 py-2 border rounded-xl field-control text-base"
                  />
                </div>

                <div className="flex items-center gap-1 p-1 bg-brand-soft rounded-xl self-start sm:self-auto">
                  {(
                    [
                      { id: 'all', label: 'Todas' },
                      { id: 'lais', label: 'Laís' },
                      { id: 'duda', label: 'Duda' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setClientProfFilter(opt.id)}
                      className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                        clientProfFilter === opt.id
                          ? 'tab-active'
                          : 'tab-idle'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <span className="text-xs font-medium text-text-secondary tabular-nums">
                {clients.length} {clients.length === 1 ? 'cliente' : 'clientes'}
              </span>
            </div>

            <div className="bg-surface border border-border rounded-2xl overflow-hidden">
              {clientsLoading ? (
                <div className="p-8 text-center text-sm text-text-secondary">
                  Carregando clientes...
                </div>
              ) : clients.length === 0 ? (
                <div className="p-8 text-center space-y-1.5">
                  <p className="text-base font-medium text-text-primary">
                    Nenhuma cliente encontrada
                  </p>
                  <p className="text-sm text-text-secondary">
                    O cadastro das clientes será montado automaticamente conforme os atendimentos forem confirmados.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {clients.map((client) => (
                    <div
                      key={client.key}
                      className="p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-background transition-colors"
                    >
                      <div className="space-y-1 min-w-0">
                        <button
                          type="button"
                          onClick={() => setSelectedClient(client)}
                          className="text-left text-base font-semibold text-brand-strong hover:underline"
                        >
                          {client.clientName}
                        </button>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary tabular-nums">
                          <span>
                            {client.totalVisits}{' '}
                            {client.totalVisits === 1 ? 'atendimento' : 'atendimentos'}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>Último: {formatDateBR(client.lastVisitDate)}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-semibold text-brand-strong">
                            {formatDaysSinceLastVisitBR(client.lastVisitDate, brazilToday)}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>
                            {client.professionals
                              .map((p) => (p === 'lais' ? 'Laís' : 'Duda'))
                              .join(' e ')}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>Toque no nome para ver cadastro</span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
                        <a
                          href={buildWhatsAppLink(client.whatsapp)}
                          target="_blank"
                          rel="noreferrer"
                          className="min-h-[42px] px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2 transition-colors tabular-nums btn-success-soft"
                        >
                          <MessageCircle className="w-4 h-4" />
                          <span>{client.whatsapp}</span>
                        </a>

                        <button
                          type="button"
                          onClick={() => {
                            const targetProf: Professional =
                              clientProfFilter !== 'all'
                                ? clientProfFilter
                                : client.professionals.includes('lais')
                                  ? 'lais'
                                  : client.professionals[0] || 'lais';
                            setAgendaFocusProfessional(targetProf);
                            setAgendaInitialBooking({
                              requestId: Date.now(),
                              clientName: client.clientName,
                              whatsapp: client.whatsapp,
                              professional: targetProf,
                            });
                            setActiveTab('agenda');
                          }}
                          className="min-h-[42px] px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-1.5 transition-colors btn-primary"
                        >
                          <CalendarPlus className="w-4 h-4" />
                          <span>Agendar</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 3. AGENDAMENTOS */}
        {activeTab === 'appointments' && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 bg-surface border border-border rounded-2xl p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1 p-1 bg-brand-soft rounded-xl">
                  {(
                    [
                      { id: 'all', label: 'Todas' },
                      { id: 'lais', label: 'Laís' },
                      { id: 'duda', label: 'Duda' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setApptProfFilter(opt.id)}
                      className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        apptProfFilter === opt.id
                          ? 'tab-active'
                          : 'tab-idle'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-3 sm:flex w-full sm:w-auto max-w-full gap-1 p-1 bg-brand-soft rounded-xl">
                  {(
                    [
                      { id: 'all', label: 'Todos' },
                      { id: 'waiting', label: 'Aguardando confirmação' },
                      { id: 'confirmed', label: 'Confirmado' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setApptStatusFilter(opt.id)}
                      aria-pressed={apptStatusFilter === opt.id}
                      className={`min-h-[44px] min-w-0 px-2 sm:px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-normal sm:whitespace-nowrap text-center ${
                        apptStatusFilter === opt.id
                          ? 'tab-active'
                          : 'tab-idle'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={() => void loadAppointments()}
                className="min-h-[40px] px-3.5 py-2 inline-flex items-center gap-1.5 text-xs font-semibold rounded-xl transition-colors btn-secondary"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${appointmentsLoading ? 'animate-spin' : ''}`} />
                <span>Atualizar</span>
              </button>
            </div>

            {agendaFeedback && (
              <div className="p-3.5 rounded-xl bg-success-soft border border-success-border text-sm text-success flex flex-wrap items-center justify-between gap-3">
                <span>{agendaFeedback}</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab('agenda')}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold btn-success"
                  >
                    Ver na Minha agenda
                  </button>
                  <button
                    type="button"
                    onClick={() => setAgendaFeedback('')}
                    aria-label="Fechar aviso"
                    className="text-success hover:opacity-75"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            <div className="bg-surface border border-border rounded-2xl overflow-hidden">
              {appointmentsLoading ? (
                <div className="p-8 text-center text-sm text-text-secondary">
                  Carregando agendamentos...
                </div>
              ) : appointments.length === 0 ? (
                <div className="p-8 text-center space-y-1.5">
                  <p className="text-base font-medium text-text-primary">
                    Nenhum retorno pré-agendado encontrado
                  </p>
                  <p className="text-sm text-text-secondary">
                    As preferências de manutenção das clientes aparecerão aqui.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {appointments.map((item) => {
                    const isConfirmed = item.returnStatus === 'confirmed';
                    const profName = item.professional === 'lais' ? 'Laís' : 'Duda';
                    const message = item.returnDate
                      ? `Olá ${item.clientName}! Aqui é do estúdio MAIS CÍLIOS. Vi sua preferência de manutenção com ${profName} para ${formatDateBR(item.returnDate)} (${item.preferredTimes.join(', ')}). Vamos confirmar seu horário?`
                      : `Olá ${item.clientName}! Aqui é do estúdio MAIS CÍLIOS. Vamos combinar a data da sua próxima manutenção com ${profName}?`;

                    return (
                      <div
                        key={item.id}
                        className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-background"
                      >
                        <div className="space-y-1.5 min-w-0">
                          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                            <span className="text-xs font-bold uppercase tracking-wider text-brand-strong">
                              {profName}
                            </span>
                            <span aria-hidden="true" className="text-border">
                              ·
                            </span>
                            <h3 className="text-base font-semibold text-text-primary">
                              {item.clientName}
                            </h3>
                            <span
                              className={`inline-flex items-center gap-1 text-xs font-semibold ${
                                isConfirmed ? 'text-success' : 'text-warning'
                              }`}
                            >
                              {isConfirmed ? (
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              ) : (
                                <Clock className="w-3.5 h-3.5" />
                              )}
                              <span>{getReturnStatusLabel(item.returnStatus)}</span>
                            </span>
                          </div>

                          <p className="text-sm text-text-secondary">
                            Serviço: {item.services.map((s) => s.name).join(', ')}
                          </p>

                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-text-primary">
                            <span>
                              Prazo: <strong>{getReturnOptionLabel(item.returnOption)}</strong>
                            </span>
                            {item.returnDate && (
                              <span className="tabular-nums">
                                Data prevista:{' '}
                                <strong className="text-brand-strong">
                                  {formatDateBR(item.returnDate)}
                                </strong>
                              </span>
                            )}
                            {item.preferredTimes.length > 0 && (
                              <span className="tabular-nums">
                                Horários preferidos:{' '}
                                <strong>{item.preferredTimes.join(' · ')}</strong>
                              </span>
                            )}
                          </div>
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
                                setAgendaFocusProfessional(item.professional);
                                setAgendaFocusDate(item.returnDate || undefined);
                                setActiveTab('agenda');
                              }}
                              className="min-h-[42px] px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-1.5 transition-colors btn-secondary"
                            >
                              <Calendar className="w-4 h-4" />
                              <span>Ver na Minha agenda</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                setAgendaBookingState({ kind: 'confirm-request', request: item })
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

        {/* MINHA AGENDA (LAÍS E DUDA PARA A ADMINISTRADORA) */}
        {activeTab === 'agenda' && (
          <AgendaCalendarTab
            isAdmin={true}
            initialDate={agendaFocusDate}
            initialProfessional={agendaFocusProfessional}
            initialBooking={agendaInitialBooking}
            onInitialBookingConsumed={() => setAgendaInitialBooking(null)}
          />
        )}

        {/* 4. HISTÓRICO DE ATENDIMENTOS */}
        {activeTab === 'history' && (
          <div className="space-y-5">
            <div className="bg-surface border border-border rounded-2xl p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="relative">
                  <Search className="w-4 h-4 text-brand absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={histSearch}
                    onChange={(e) => setHistSearch(e.target.value)}
                    placeholder="Buscar cliente ou telefone..."
                    className="w-full min-h-[44px] pl-10 pr-3 py-2 border rounded-xl field-control text-base"
                  />
                </div>

                <select
                  value={histProfFilter}
                  onChange={(e) => setHistProfFilter(e.target.value as 'all' | Professional)}
                  aria-label="Filtrar por profissional"
                  className="min-h-[44px] px-3 py-2 border rounded-xl field-control text-base"
                >
                  <option value="all">Todas as profissionais</option>
                  <option value="lais">Somente Laís</option>
                  <option value="duda">Somente Duda</option>
                </select>

                <select
                  value={histServiceFilter}
                  onChange={(e) => setHistServiceFilter(e.target.value)}
                  aria-label="Filtrar por serviço"
                  className="min-h-[44px] px-3 py-2 border rounded-xl field-control text-base"
                >
                  <option value="all">Todos os serviços</option>
                  <optgroup label="Serviços da Laís">
                    {LAIS_SERVICES.map((svc) => (
                      <option key={svc.id} value={svc.id}>
                        {svc.name}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Serviços da Duda">
                    {DUDA_SERVICES.map((svc) => (
                      <option key={svc.id} value={svc.id}>
                        {svc.name}
                      </option>
                    ))}
                  </optgroup>
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
                      value={histDaysAgoInput}
                      onChange={(e) => setHistDaysAgoInput(e.target.value.replace(/\D/g, ''))}
                      placeholder="Ex: 1, 5, 15, 30"
                      className="w-36 min-h-[44px] px-3 py-1.5 font-semibold border rounded-xl tabular-nums field-control text-base"
                    />
                  </label>

                  {histTargetDate !== null && parsedHistDaysAgo !== null ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs sm:text-sm font-semibold text-brand-strong tabular-nums">
                        Data: {formatDateBR(histTargetDate)}{' '}
                        {parsedHistDaysAgo === 0
                          ? '(Hoje)'
                          : parsedHistDaysAgo === 1
                            ? '(Ontem · há 1 dia)'
                            : `(Há ${parsedHistDaysAgo} dias)`}
                      </span>
                      <button
                        type="button"
                        onClick={() => setHistDaysAgoInput('')}
                        className="min-h-[36px] px-3 py-1 text-xs font-semibold rounded-lg transition-colors btn-secondary"
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
                  onClick={() => void loadHistory()}
                  className="min-h-[40px] px-3.5 py-2 inline-flex items-center gap-1.5 text-xs font-semibold rounded-xl transition-colors self-start lg:self-auto btn-secondary"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${historyLoading ? 'animate-spin' : ''}`} />
                  <span>Atualizar</span>
                </button>
              </div>
            </div>

            <div className="bg-surface border border-border rounded-2xl overflow-hidden">
              {historyLoading ? (
                <div className="p-8 text-center text-sm text-text-secondary">
                  Carregando histórico...
                </div>
              ) : historyList.length === 0 ? (
                <div className="p-8 text-center space-y-1.5">
                  <p className="text-base font-medium text-text-primary">
                    Nenhum atendimento encontrado
                  </p>
                  <p className="text-sm text-text-secondary">
                    Ajuste os filtros acima para visualizar outros períodos.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {historyList.map((item) => {
                    const isDuda = item.professional === 'duda';
                    return (
                      <div
                        key={item.id}
                        className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-background"
                      >
                        <div className="space-y-1.5 min-w-0">
                          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                            <span className="text-xs font-bold uppercase tracking-wider text-brand-strong">
                              {isDuda ? 'Duda' : 'Laís'}
                            </span>
                            <span aria-hidden="true" className="text-border">
                              ·
                            </span>
                            <h3 className="text-base font-semibold text-text-primary">
                              {item.clientName}
                            </h3>
                            <span aria-hidden="true" className="text-border">
                              ·
                            </span>
                            <span className="text-xs text-text-secondary tabular-nums">
                              {formatDateBR(item.serviceDate)} ·{' '}
                              {formatBrazilTimeBR(item.createdAt)}
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
                            {isDuda && (
                              <span className="block text-xs font-medium text-brand-strong tabular-nums">
                                Comissão 25%: {formatBRL(item.commissionAmount)}
                              </span>
                            )}
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
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 5. CONTROLE FINANCEIRO */}
        {activeTab === 'finance' && (
          <div className="space-y-5">
            <div className="bg-surface border border-border rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1 p-1 bg-brand-soft rounded-xl">
                <button
                  type="button"
                  onClick={() => setFinanceView('daily')}
                  className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    financeView === 'daily'
                      ? 'tab-active'
                      : 'tab-idle'
                  }`} aria-pressed={financeView === 'daily'}
                >
                  Comissões da Duda por dia
                </button>
                <button
                  type="button"
                  onClick={() => setFinanceView('period')}
                  className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    financeView === 'period'
                      ? 'tab-active'
                      : 'tab-idle'
                  }`} aria-pressed={financeView === 'period'}
                >
                  Resumo por período
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
                    aria-label="Data das comissões"
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
                    <h2 className="text-base font-semibold text-text-primary">
                      Repasses da Duda por dia
                    </h2>
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
                                <span className="block text-xs text-brand-strong">Comissão 25%</span>
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
                      Total produzido por Laís ({periodSummary.laisCount})
                    </span>
                    <p className="mt-1.5 text-2xl sm:text-3xl font-bold metric-value tabular-nums">
                      {formatBRL(periodSummary.totalLaisProduced)}
                    </p>
                  </div>

                  <div className="bg-surface border border-border rounded-2xl p-5">
                    <span className="text-xs font-medium text-text-secondary">
                      Recebido nos atendimentos da Duda ({periodSummary.count})
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
                      Carregando atendimentos da Duda...
                    </div>
                  ) : dudaPeriodAttendances.length === 0 ? (
                    <div className="p-8 text-center text-sm text-text-secondary">
                      Nenhum atendimento da Duda encontrado neste período.
                    </div>
                  ) : (
                    <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Resumo financeiro por período">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-border bg-background text-xs font-semibold text-text-secondary">
                            <th className="py-3 px-4">Data</th>
                            <th className="py-3 px-4">Cliente</th>
                            <th className="py-3 px-4">Serviços</th>
                            <th className="py-3 px-4 text-right">Valor recebido</th>
                            <th className="py-3 px-4 text-right">Comissão Laís (25%)</th>
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
        </main>
      </div>

      <ClientDetailModal
        client={selectedClient}
        onClose={() => setSelectedClient(null)}
        showProfessionalBadge
      />

      <ChangePasswordModal
        isOpen={passwordModalOpen}
        onClose={() => setPasswordModalOpen(false)}
        userName={user.displayName}
      />

      <AgendaBookingModal
        state={agendaBookingState}
        isAdmin={true}
        onClose={() => setAgendaBookingState({ kind: 'closed' })}
        onSaved={({ appointment, updatedAttendance, message }) => {
          setAgendaBookingState({ kind: 'closed' });
          setAgendaFocusProfessional(appointment.professional);
          setAgendaFocusDate(appointment.appointmentDate);
          setAgendaFeedback(message);
          if (updatedAttendance) {
            setAppointments((prev) => {
              const next = prev.map((item) =>
                item.id === updatedAttendance.id ? updatedAttendance : item
              );
              return apptStatusFilter === 'waiting'
                ? next.filter((item) => item.returnStatus === 'waiting')
                : next;
            });
          } else {
            void loadAppointments();
          }
        }}
      />
    </div>
  );
}
