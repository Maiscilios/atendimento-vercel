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
import { AgendaCalendarTab } from './AgendaCalendarTab';
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
    <div className="min-h-screen bg-[#FFF9FB] pb-12">
      <header className="sticky top-0 z-20 border-b border-[#F3DCE6] bg-white/95 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setSidebarOpen((open) => !open)}
              aria-label={sidebarOpen ? 'Fechar menu' : 'Abrir menu'}
              aria-expanded={sidebarOpen}
              className="lg:hidden min-h-[42px] min-w-[42px] rounded-xl bg-[#FDF2F6] hover:bg-[#F9E3EC] border border-[#EBC5D5] text-[#831843] flex items-center justify-center shrink-0 transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
            <span className="font-display text-2xl font-bold text-[#831843] whitespace-nowrap">
              MAIS CÍLIOS
            </span>
            <span className="hidden sm:inline text-sm text-[#7A5464] whitespace-nowrap">
              · Administração ({user.displayName})
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onGoHome}
              className="min-h-[40px] px-3 py-1.5 inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-[#831843] bg-[#FDF2F6] hover:bg-[#F9E3EC] border border-[#EBC5D5] rounded-xl transition-colors whitespace-nowrap"
            >
              <Home className="w-4 h-4" />
              <span className="hidden sm:inline">Tela inicial</span>
            </button>
            <button
              type="button"
              onClick={() => setPasswordModalOpen(true)}
              aria-label="Alterar senha"
              className="min-h-[40px] px-3 py-1.5 inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-[#5E3A4A] hover:bg-[#FDF2F6] rounded-xl transition-colors whitespace-nowrap"
            >
              <KeyRound className="w-4 h-4" />
              <span className="hidden md:inline">Minha senha</span>
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="min-h-[40px] px-3 py-1.5 inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-[#9F1239] hover:bg-[#FFF1F2] rounded-xl transition-colors whitespace-nowrap"
            >
              <LogOut className="w-4 h-4" />
              <span>Sair</span>
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
              <h1 className="font-display text-3xl font-bold text-[#831843]">
                Painel Administrativo da Laís
              </h1>
              <p className="text-sm text-[#7A5464]">
                Gestão completa de atendimentos, clientes, agendamentos e controle financeiro
              </p>
            </div>

            <div className="flex items-center gap-2">
              {confirmResetDuda ? (
                <div className="flex items-center gap-2 bg-white border border-[#EBC5D5] rounded-xl px-3 py-1.5 text-xs">
                  <span className="text-[#4D2939]">Liberar novo cadastro de senha para Duda?</span>
                  <button
                    type="button"
                    onClick={() => void handleResetDudaPassword()}
                    className="px-2.5 py-1 rounded-lg bg-[#9D2A58] text-white font-semibold"
                  >
                    Confirmar
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmResetDuda(false)}
                    className="px-2.5 py-1 rounded-lg bg-[#FDF2F6] text-[#6E4959]"
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
                  className="min-h-[38px] px-3 py-1.5 rounded-xl bg-white hover:bg-[#FDF2F6] border border-[#EED2DE] text-xs font-medium text-[#6E4959] inline-flex items-center gap-1.5 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Redefinir senha da Duda</span>
                </button>
              )}
            </div>
          </div>

          {resetFeedback && (
            <div className="p-3.5 rounded-xl bg-[#F0FDF4] border border-[#BBF7D0] text-sm text-[#166534]">
              {resetFeedback}
            </div>
          )}

          {error && (
            <div className="p-3.5 rounded-xl bg-[#FFF1F2] border border-[#FECDD3] text-sm text-[#9F1239]">
              {error}
            </div>
          )}

        {/* 1. INÍCIO */}
        {activeTab === 'home' && (
          <div className="space-y-5">
            <div className="bg-white border border-[#F1D8E2] rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-xs font-semibold uppercase tracking-wider text-[#7A5464]">
                  Data selecionada:
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setHomeDate((d) => addDaysToISO(d, -1))}
                    aria-label="Dia anterior"
                    className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-[#EED2DE] bg-[#FFF9FB] hover:bg-[#FDF2F6] text-[#831843]"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <input
                    type="date"
                    value={homeDate}
                    onChange={(e) => e.target.value && setHomeDate(e.target.value)}
                    className="min-h-[40px] px-3 py-1.5 text-sm font-semibold bg-[#FFF9FB] border border-[#EED2DE] rounded-xl text-[#331824] tabular-nums focus:outline-none focus:border-[#9D2A58]"
                  />
                  <button
                    type="button"
                    onClick={() => setHomeDate((d) => addDaysToISO(d, 1))}
                    aria-label="Próximo dia"
                    className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-[#EED2DE] bg-[#FFF9FB] hover:bg-[#FDF2F6] text-[#831843]"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setHomeDate(getLocalDateISO())}
                    className="min-h-[40px] px-3 py-1.5 text-xs font-semibold text-[#831843] bg-[#FDF2F6] hover:bg-[#F9E3EC] rounded-xl"
                  >
                    Hoje
                  </button>
                </div>

                <div className="flex items-center gap-1 p-1 bg-[#F9ECF2] rounded-xl ml-1">
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
                          ? 'bg-white text-[#831843] shadow-sm'
                          : 'text-[#6E4959] hover:text-[#331824]'
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
                className="min-h-[40px] px-3.5 py-2 inline-flex items-center gap-1.5 text-xs font-semibold text-[#831843] bg-[#FDF2F6] hover:bg-[#F9E3EC] rounded-xl transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${homeLoading ? 'animate-spin' : ''}`} />
                <span>Atualizar</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white border border-[#F1D8E2] rounded-2xl p-5">
                <span className="text-xs font-medium text-[#7A5464]">
                  Total produzido no dia ({dayAttendances.length})
                </span>
                <p className="mt-1.5 text-2xl sm:text-3xl font-bold text-[#331824] tabular-nums">
                  {formatBRL(dayTotalProduced)}
                </p>
              </div>

              <div className="bg-white border border-[#F1D8E2] rounded-2xl p-5">
                <span className="text-xs font-medium text-[#7A5464]">
                  Produção Laís no dia
                </span>
                <p className="mt-1.5 text-2xl sm:text-3xl font-bold text-[#331824] tabular-nums">
                  {formatBRL(dayLaisProduced)}
                </p>
              </div>

              <div className="bg-white border border-[#F1D8E2] rounded-2xl p-5">
                <span className="text-xs font-medium text-[#7A5464]">
                  Recebido Duda no dia
                </span>
                <p className="mt-1.5 text-2xl sm:text-3xl font-bold text-[#331824] tabular-nums">
                  {formatBRL(dayDudaProduced)}
                </p>
              </div>

              <div className="bg-[#FDF2F6] border border-[#EBC5D5] rounded-2xl p-5">
                <span className="text-xs font-medium text-[#831843]">
                  Comissão 25% da Duda no dia
                </span>
                <p className="mt-1.5 text-2xl sm:text-3xl font-bold text-[#831843] tabular-nums">
                  {formatBRL(dayDudaCommission)}
                </p>
              </div>
            </div>

            <div className="bg-white border border-[#F1D8E2] rounded-2xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-[#F5E4EC] flex items-center justify-between">
                <h2 className="text-base font-semibold text-[#331824]">
                  Atendimentos de {formatDateBR(homeDate)}
                </h2>
                <span className="text-xs text-[#7A5464] tabular-nums">
                  {dayAttendances.length} registros
                </span>
              </div>

              {homeLoading ? (
                <div className="p-8 text-center text-sm text-[#7A5464]">
                  Carregando atendimentos do dia...
                </div>
              ) : dayAttendances.length === 0 ? (
                <div className="p-8 text-center space-y-1.5">
                  <p className="text-base font-medium text-[#331824]">
                    Nenhum atendimento registrado em {formatDateBR(homeDate)}
                  </p>
                  <p className="text-sm text-[#7A5464]">
                    Escolha outra data no calendário acima.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-[#F5E4EC]">
                  {dayAttendances.map((item) => (
                    <div
                      key={item.id}
                      className="p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[#FFF9FB]"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-bold uppercase tracking-wider text-[#9D2A58]">
                            {item.professional === 'lais' ? 'Laís' : 'Duda'}
                          </span>
                          <span aria-hidden="true" className="text-[#D9B6C5]">
                            ·
                          </span>
                          <h3 className="text-base font-semibold text-[#331824]">
                            {item.clientName}
                          </h3>
                        </div>
                        <p className="text-sm text-[#5E3A4A]">
                          {item.services.map((s) => s.name).join(' · ')}
                          {item.additionals.length > 0 && (
                            <span className="text-xs text-[#831843]">
                              {' '}
                              · Adicionais: {item.additionals.join(', ')}
                            </span>
                          )}
                        </p>
                      </div>

                      <div className="flex items-center gap-6 sm:text-right shrink-0">
                        <div>
                          <span className="block text-xs text-[#7A5464]">Valor recebido</span>
                          <span className="text-base font-bold text-[#331824] tabular-nums">
                            {formatBRL(item.totalPaid)}
                          </span>
                        </div>
                        {item.professional === 'duda' && (
                          <div>
                            <span className="block text-xs text-[#831843]">Comissão (25%)</span>
                            <span className="text-base font-bold text-[#831843] tabular-nums">
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
            <div className="bg-white border border-[#F1D8E2] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-1">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 text-[#9D2A58] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={clientSearch}
                    onChange={(e) => setClientSearch(e.target.value)}
                    placeholder="Pesquisar cliente por nome ou WhatsApp..."
                    className="w-full min-h-[44px] pl-10 pr-4 py-2 text-sm bg-[#FFF9FB] border border-[#EED2DE] rounded-xl text-[#331824] focus:outline-none focus:border-[#9D2A58]"
                  />
                </div>

                <div className="flex items-center gap-1 p-1 bg-[#F9ECF2] rounded-xl self-start sm:self-auto">
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
                          ? 'bg-white text-[#831843] shadow-sm'
                          : 'text-[#6E4959] hover:text-[#331824]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <span className="text-xs font-medium text-[#7A5464] tabular-nums">
                {clients.length} {clients.length === 1 ? 'cliente' : 'clientes'}
              </span>
            </div>

            <div className="bg-white border border-[#F1D8E2] rounded-2xl overflow-hidden">
              {clientsLoading ? (
                <div className="p-8 text-center text-sm text-[#7A5464]">
                  Carregando clientes...
                </div>
              ) : clients.length === 0 ? (
                <div className="p-8 text-center space-y-1.5">
                  <p className="text-base font-medium text-[#331824]">
                    Nenhuma cliente encontrada
                  </p>
                  <p className="text-sm text-[#7A5464]">
                    O cadastro das clientes será montado automaticamente conforme os atendimentos forem confirmados.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-[#F5E4EC]">
                  {clients.map((client) => (
                    <div
                      key={client.key}
                      className="p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[#FFF9FB] transition-colors"
                    >
                      <div className="space-y-1 min-w-0">
                        <button
                          type="button"
                          onClick={() => setSelectedClient(client)}
                          className="text-left text-base font-semibold text-[#831843] hover:underline"
                        >
                          {client.clientName}
                        </button>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-[#7A5464] tabular-nums">
                          <span>
                            {client.totalVisits}{' '}
                            {client.totalVisits === 1 ? 'atendimento' : 'atendimentos'}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>Último: {formatDateBR(client.lastVisitDate)}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-semibold text-[#831843]">
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

                      <a
                        href={buildWhatsAppLink(client.whatsapp)}
                        target="_blank"
                        rel="noreferrer"
                        className="min-h-[42px] px-4 py-2 rounded-xl bg-[#ECFDF3] hover:bg-[#DCFCE7] border border-[#BBF7D0] text-[#15803D] text-sm font-semibold inline-flex items-center gap-2 self-start sm:self-auto transition-colors tabular-nums"
                      >
                        <MessageCircle className="w-4 h-4" />
                        <span>{client.whatsapp}</span>
                      </a>
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
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-[#F1D8E2] rounded-2xl p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1 p-1 bg-[#F9ECF2] rounded-xl">
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
                          ? 'bg-white text-[#831843] shadow-sm'
                          : 'text-[#6E4959] hover:text-[#331824]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1 p-1 bg-[#F9ECF2] rounded-xl">
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
                      className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                        apptStatusFilter === opt.id
                          ? 'bg-white text-[#831843] shadow-sm'
                          : 'text-[#6E4959] hover:text-[#331824]'
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
                className="min-h-[40px] px-3.5 py-2 inline-flex items-center gap-1.5 text-xs font-semibold text-[#831843] bg-[#FDF2F6] hover:bg-[#F9E3EC] rounded-xl transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${appointmentsLoading ? 'animate-spin' : ''}`} />
                <span>Atualizar</span>
              </button>
            </div>

            {agendaFeedback && (
              <div className="p-3.5 rounded-xl bg-[#F0FDF4] border border-[#BBF7D0] text-sm text-[#166534] flex flex-wrap items-center justify-between gap-3">
                <span>{agendaFeedback}</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab('agenda')}
                    className="px-3 py-1.5 rounded-lg bg-[#15803D] text-white text-xs font-semibold"
                  >
                    Ver na Minha agenda
                  </button>
                  <button
                    type="button"
                    onClick={() => setAgendaFeedback('')}
                    aria-label="Fechar aviso"
                    className="text-[#166534] hover:opacity-75"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            <div className="bg-white border border-[#F1D8E2] rounded-2xl overflow-hidden">
              {appointmentsLoading ? (
                <div className="p-8 text-center text-sm text-[#7A5464]">
                  Carregando agendamentos...
                </div>
              ) : appointments.length === 0 ? (
                <div className="p-8 text-center space-y-1.5">
                  <p className="text-base font-medium text-[#331824]">
                    Nenhum retorno pré-agendado encontrado
                  </p>
                  <p className="text-sm text-[#7A5464]">
                    As preferências de manutenção das clientes aparecerão aqui.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-[#F5E4EC]">
                  {appointments.map((item) => {
                    const isConfirmed = item.returnStatus === 'confirmed';
                    const profName = item.professional === 'lais' ? 'Laís' : 'Duda';
                    const message = item.returnDate
                      ? `Olá ${item.clientName}! Aqui é do estúdio MAIS CÍLIOS. Vi sua preferência de manutenção com ${profName} para ${formatDateBR(item.returnDate)} (${item.preferredTimes.join(', ')}). Vamos confirmar seu horário?`
                      : `Olá ${item.clientName}! Aqui é do estúdio MAIS CÍLIOS. Vamos combinar a data da sua próxima manutenção com ${profName}?`;

                    return (
                      <div
                        key={item.id}
                        className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-[#FFF9FB]"
                      >
                        <div className="space-y-1.5 min-w-0">
                          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                            <span className="text-xs font-bold uppercase tracking-wider text-[#9D2A58]">
                              {profName}
                            </span>
                            <span aria-hidden="true" className="text-[#D9B6C5]">
                              ·
                            </span>
                            <h3 className="text-base font-semibold text-[#331824]">
                              {item.clientName}
                            </h3>
                            <span
                              className={`inline-flex items-center gap-1 text-xs font-semibold ${
                                isConfirmed ? 'text-[#15803D]' : 'text-[#B45309]'
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

                          <p className="text-sm text-[#5E3A4A]">
                            Serviço: {item.services.map((s) => s.name).join(', ')}
                          </p>

                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[#4D2939]">
                            <span>
                              Prazo: <strong>{getReturnOptionLabel(item.returnOption)}</strong>
                            </span>
                            {item.returnDate && (
                              <span className="tabular-nums">
                                Data prevista:{' '}
                                <strong className="text-[#831843]">
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
                            className="min-h-[42px] px-4 py-2 rounded-xl bg-[#ECFDF3] hover:bg-[#DCFCE7] border border-[#BBF7D0] text-[#15803D] text-sm font-semibold inline-flex items-center gap-1.5 transition-colors tabular-nums"
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
                              className="min-h-[42px] px-4 py-2 rounded-xl text-sm font-semibold bg-[#FDF2F6] hover:bg-[#F9E3EC] text-[#831843] border border-[#EBC5D5] inline-flex items-center gap-1.5 transition-colors"
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
                              className="min-h-[42px] px-4 py-2 rounded-xl text-sm font-semibold bg-[#9D2A58] hover:bg-[#831843] text-white inline-flex items-center gap-1.5 transition-colors"
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
          />
        )}

        {/* 4. HISTÓRICO DE ATENDIMENTOS */}
        {activeTab === 'history' && (
          <div className="space-y-5">
            <div className="bg-white border border-[#F1D8E2] rounded-2xl p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="relative">
                  <Search className="w-4 h-4 text-[#9D2A58] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={histSearch}
                    onChange={(e) => setHistSearch(e.target.value)}
                    placeholder="Buscar cliente ou telefone..."
                    className="w-full min-h-[42px] pl-10 pr-3 py-2 text-sm bg-[#FFF9FB] border border-[#EED2DE] rounded-xl text-[#331824] focus:outline-none focus:border-[#9D2A58]"
                  />
                </div>

                <select
                  value={histProfFilter}
                  onChange={(e) => setHistProfFilter(e.target.value as 'all' | Professional)}
                  aria-label="Filtrar por profissional"
                  className="min-h-[42px] px-3 py-2 text-sm bg-[#FFF9FB] border border-[#EED2DE] rounded-xl text-[#331824] focus:outline-none focus:border-[#9D2A58]"
                >
                  <option value="all">Todas as profissionais</option>
                  <option value="lais">Somente Laís</option>
                  <option value="duda">Somente Duda</option>
                </select>

                <select
                  value={histServiceFilter}
                  onChange={(e) => setHistServiceFilter(e.target.value)}
                  aria-label="Filtrar por serviço"
                  className="min-h-[42px] px-3 py-2 text-sm bg-[#FFF9FB] border border-[#EED2DE] rounded-xl text-[#331824] focus:outline-none focus:border-[#9D2A58]"
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

              <div className="pt-2 border-t border-[#F5E4EC] flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex flex-wrap items-center gap-2.5 text-sm font-medium text-[#4D2939]">
                    <span>Consultar há quantos dias?</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={histDaysAgoInput}
                      onChange={(e) => setHistDaysAgoInput(e.target.value.replace(/\D/g, ''))}
                      placeholder="Ex: 1, 5, 15, 30"
                      className="w-36 min-h-[40px] px-3 py-1.5 text-sm font-semibold bg-[#FFF9FB] border border-[#EED2DE] rounded-xl text-[#331824] tabular-nums placeholder:font-normal placeholder:text-[#B18E9C] focus:outline-none focus:border-[#9D2A58]"
                    />
                  </label>

                  {histTargetDate !== null && parsedHistDaysAgo !== null ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs sm:text-sm font-semibold text-[#831843] tabular-nums">
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
                        className="min-h-[36px] px-3 py-1 text-xs font-semibold text-[#6E4959] bg-[#F9ECF2] hover:bg-[#F3DCE6] rounded-lg transition-colors"
                      >
                        Todo período
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs text-[#7A5464]">
                      Exibindo todos os dias (horário de Brasília)
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => void loadHistory()}
                  className="min-h-[40px] px-3.5 py-2 inline-flex items-center gap-1.5 text-xs font-semibold text-[#831843] bg-[#FDF2F6] hover:bg-[#F9E3EC] rounded-xl transition-colors self-start lg:self-auto"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${historyLoading ? 'animate-spin' : ''}`} />
                  <span>Atualizar</span>
                </button>
              </div>
            </div>

            <div className="bg-white border border-[#F1D8E2] rounded-2xl overflow-hidden">
              {historyLoading ? (
                <div className="p-8 text-center text-sm text-[#7A5464]">
                  Carregando histórico...
                </div>
              ) : historyList.length === 0 ? (
                <div className="p-8 text-center space-y-1.5">
                  <p className="text-base font-medium text-[#331824]">
                    Nenhum atendimento encontrado
                  </p>
                  <p className="text-sm text-[#7A5464]">
                    Ajuste os filtros acima para visualizar outros períodos.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-[#F5E4EC]">
                  {historyList.map((item) => {
                    const isDuda = item.professional === 'duda';
                    return (
                      <div
                        key={item.id}
                        className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-[#FFF9FB]"
                      >
                        <div className="space-y-1.5 min-w-0">
                          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                            <span className="text-xs font-bold uppercase tracking-wider text-[#9D2A58]">
                              {isDuda ? 'Duda' : 'Laís'}
                            </span>
                            <span aria-hidden="true" className="text-[#D9B6C5]">
                              ·
                            </span>
                            <h3 className="text-base font-semibold text-[#331824]">
                              {item.clientName}
                            </h3>
                            <span aria-hidden="true" className="text-[#D9B6C5]">
                              ·
                            </span>
                            <span className="text-xs text-[#7A5464] tabular-nums">
                              {formatDateBR(item.serviceDate)}
                            </span>
                          </div>

                          <p className="text-sm text-[#4D2939]">
                            {item.services.map((s) => s.name).join(' · ')}
                            {item.additionals.length > 0 && (
                              <span className="text-xs text-[#831843]">
                                {' '}
                                · Adicionais: {item.additionals.join(', ')}
                              </span>
                            )}
                          </p>

                          <a
                            href={buildWhatsAppLink(item.whatsapp)}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 text-sm font-medium text-[#15803D] hover:underline tabular-nums"
                          >
                            <MessageCircle className="w-4 h-4" />
                            <span>{item.whatsapp}</span>
                          </a>
                        </div>

                        <div className="flex flex-wrap items-center gap-4 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-[#F5E4EC]">
                          <div className="text-left lg:text-right">
                            <span className="block text-xs text-[#7A5464]">Valor pago</span>
                            <span className="text-base font-bold text-[#331824] tabular-nums">
                              {formatBRL(item.totalPaid)}
                            </span>
                            {isDuda && (
                              <span className="block text-xs font-medium text-[#831843] tabular-nums">
                                Comissão 25%: {formatBRL(item.commissionAmount)}
                              </span>
                            )}
                          </div>

                          {confirmDeleteId === item.id ? (
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => void handleDeleteAttendance(item.id)}
                                className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[#9F1239] text-white text-xs font-semibold"
                              >
                                Excluir
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                className="min-h-[38px] px-2.5 py-1.5 rounded-lg bg-[#F9ECF2] text-[#5E3A4A] text-xs font-medium"
                              >
                                Cancelar
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(item.id)}
                              aria-label="Excluir registro"
                              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-[#9D7888] hover:text-[#9F1239] hover:bg-[#FFF1F2] transition-colors"
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
            <div className="bg-white border border-[#F1D8E2] rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1 p-1 bg-[#F9ECF2] rounded-xl">
                <button
                  type="button"
                  onClick={() => setFinanceView('daily')}
                  className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    financeView === 'daily'
                      ? 'bg-white text-[#831843] shadow-sm'
                      : 'text-[#6E4959] hover:text-[#331824]'
                  }`}
                >
                  Comissões da Duda por dia
                </button>
                <button
                  type="button"
                  onClick={() => setFinanceView('period')}
                  className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    financeView === 'period'
                      ? 'bg-white text-[#831843] shadow-sm'
                      : 'text-[#6E4959] hover:text-[#331824]'
                  }`}
                >
                  Resumo por período
                </button>
              </div>

              <button
                type="button"
                onClick={() => void loadFinance()}
                className="min-h-[40px] px-3.5 py-2 inline-flex items-center gap-1.5 text-xs font-semibold text-[#831843] bg-[#FDF2F6] hover:bg-[#F9E3EC] rounded-xl transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${financeLoading ? 'animate-spin' : ''}`} />
                <span>Atualizar</span>
              </button>
            </div>

            {financeView === 'daily' ? (
              <div className="space-y-5">
                <div className="bg-white border border-[#F1D8E2] rounded-2xl p-4 flex flex-wrap items-center gap-3">
                  <Calendar className="w-4 h-4 text-[#9D2A58]" />
                  <span className="text-sm font-medium text-[#4D2939]">
                    Consultar dia específico:
                  </span>
                  <input
                    type="date"
                    value={commissionDate}
                    onChange={(e) => e.target.value && setCommissionDate(e.target.value)}
                    className="min-h-[40px] px-3 py-1.5 text-sm font-semibold bg-[#FFF9FB] border border-[#EED2DE] rounded-xl text-[#331824] tabular-nums focus:outline-none focus:border-[#9D2A58]"
                  />
                  <button
                    type="button"
                    onClick={() => setCommissionDate(getLocalDateISO())}
                    className="min-h-[40px] px-3 py-1.5 text-xs font-semibold text-[#831843] bg-[#FDF2F6] hover:bg-[#F9E3EC] rounded-xl"
                  >
                    Hoje
                  </button>
                </div>

                {selectedCommissionDay && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-white border border-[#F1D8E2] rounded-2xl p-5">
                      <span className="text-xs font-medium text-[#7A5464]">
                        Recebido pela Duda em {formatDateBR(selectedCommissionDay.date)}
                      </span>
                      <p className="mt-1.5 text-2xl sm:text-3xl font-bold text-[#331824] tabular-nums">
                        {formatBRL(selectedCommissionDay.totalProduced)}
                      </p>
                    </div>

                    <div className="bg-[#FDF2F6] border border-[#EBC5D5] rounded-2xl p-5">
                      <span className="text-xs font-medium text-[#831843]">
                        Comissão de 25% a receber
                      </span>
                      <p className="mt-1.5 text-2xl sm:text-3xl font-bold text-[#831843] tabular-nums">
                        {formatBRL(selectedCommissionDay.commissionAmount)}
                      </p>
                    </div>

                    <div className="bg-white border border-[#F1D8E2] rounded-2xl p-5 flex flex-col justify-between gap-2">
                      <span className="text-xs font-medium text-[#7A5464]">
                        Situação do repasse
                      </span>
                      {selectedCommissionDay.count === 0 ? (
                        <span className="text-base font-semibold text-[#7A5464]">
                          Sem atendimentos neste dia
                        </span>
                      ) : (
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`inline-flex items-center gap-1.5 text-lg font-bold ${
                              selectedCommissionDay.payoutStatus === 'paid'
                                ? 'text-[#15803D]'
                                : 'text-[#B45309]'
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
                                ? 'bg-[#FFF9FB] hover:bg-[#FDF2F6] text-[#6E4959] border border-[#EBC5D5]'
                                : 'bg-[#9D2A58] hover:bg-[#831843] text-white'
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

                <div className="bg-white border border-[#F1D8E2] rounded-2xl overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-[#F5E4EC]">
                    <h2 className="text-base font-semibold text-[#331824]">
                      Repasses da Duda por dia
                    </h2>
                  </div>
                  {availableCommissionDays.length === 0 ? (
                    <div className="p-8 text-center text-sm text-[#7A5464]">
                      Nenhum atendimento da Duda registrado até o momento.
                    </div>
                  ) : (
                    <div className="divide-y divide-[#F5E4EC]">
                      {availableCommissionDays.map((day) => {
                        const selected = day.date === commissionDate;
                        const isPaid = day.payoutStatus === 'paid';
                        return (
                          <div
                            key={day.date}
                            className={`p-4 sm:px-5 flex flex-wrap items-center justify-between gap-3 ${
                              selected ? 'bg-[#FDF2F6]' : 'hover:bg-[#FFF9FB]'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => setCommissionDate(day.date)}
                              className="text-left space-y-0.5"
                            >
                              <span className="block text-base font-semibold text-[#331824] tabular-nums">
                                {formatDateBR(day.date)}
                              </span>
                              <span className="block text-xs text-[#7A5464] tabular-nums">
                                {day.count} {day.count === 1 ? 'atendimento' : 'atendimentos'}
                              </span>
                            </button>

                            <div className="flex flex-wrap items-center gap-4 sm:gap-6 tabular-nums">
                              <div className="text-right">
                                <span className="block text-xs text-[#7A5464]">Recebido</span>
                                <span className="text-sm font-bold text-[#331824]">
                                  {formatBRL(day.totalProduced)}
                                </span>
                              </div>
                              <div className="text-right">
                                <span className="block text-xs text-[#831843]">Comissão 25%</span>
                                <span className="text-sm font-bold text-[#831843]">
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
                                    ? 'bg-[#ECFDF3] text-[#15803D] border border-[#BBF7D0]'
                                    : 'bg-[#FFFBEB] text-[#B45309] border border-[#FDE68A] hover:bg-[#FEF3C7]'
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
                <div className="bg-white border border-[#F1D8E2] rounded-2xl p-4">
                  <PeriodFilterBar value={financePeriod} onChange={setFinancePeriod} />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-white border border-[#F1D8E2] rounded-2xl p-5">
                    <span className="text-xs font-medium text-[#7A5464]">
                      Total produzido por Laís ({periodSummary.laisCount})
                    </span>
                    <p className="mt-1.5 text-2xl sm:text-3xl font-bold text-[#331824] tabular-nums">
                      {formatBRL(periodSummary.totalLaisProduced)}
                    </p>
                  </div>

                  <div className="bg-white border border-[#F1D8E2] rounded-2xl p-5">
                    <span className="text-xs font-medium text-[#7A5464]">
                      Recebido nos atendimentos da Duda ({periodSummary.count})
                    </span>
                    <p className="mt-1.5 text-2xl sm:text-3xl font-bold text-[#331824] tabular-nums">
                      {formatBRL(periodSummary.totalReceived)}
                    </p>
                  </div>

                  <div className="bg-[#FDF2F6] border border-[#EBC5D5] rounded-2xl p-5">
                    <span className="text-xs font-medium text-[#831843]">
                      Total de comissão 25% (Duda → Laís)
                    </span>
                    <p className="mt-1.5 text-2xl sm:text-3xl font-bold text-[#831843] tabular-nums">
                      {formatBRL(periodSummary.totalCommissionToReceive)}
                    </p>
                  </div>
                </div>

                <div className="bg-white border border-[#F1D8E2] rounded-2xl overflow-hidden">
                  {financeLoading ? (
                    <div className="p-8 text-center text-sm text-[#7A5464]">
                      Carregando atendimentos da Duda...
                    </div>
                  ) : dudaPeriodAttendances.length === 0 ? (
                    <div className="p-8 text-center text-sm text-[#7A5464]">
                      Nenhum atendimento da Duda encontrado neste período.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-[#F1D8E2] bg-[#FFF9FB] text-xs font-semibold text-[#7A5464]">
                            <th className="py-3 px-4">Data</th>
                            <th className="py-3 px-4">Cliente</th>
                            <th className="py-3 px-4">Serviços</th>
                            <th className="py-3 px-4 text-right">Valor recebido</th>
                            <th className="py-3 px-4 text-right">Comissão Laís (25%)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#F5E4EC] text-sm">
                          {dudaPeriodAttendances.map((item) => (
                            <tr key={item.id} className="hover:bg-[#FFF9FB]">
                              <td className="py-3 px-4 text-[#5E3A4A] tabular-nums whitespace-nowrap">
                                {formatDateBR(item.serviceDate)}
                              </td>
                              <td className="py-3 px-4 font-medium text-[#331824]">
                                {item.clientName}
                              </td>
                              <td className="py-3 px-4 text-[#5E3A4A]">
                                {item.services.map((s) => s.name).join(', ')}
                              </td>
                              <td className="py-3 px-4 text-right font-semibold text-[#331824] tabular-nums whitespace-nowrap">
                                {formatBRL(item.totalPaid)}
                              </td>
                              <td className="py-3 px-4 text-right font-bold text-[#831843] tabular-nums whitespace-nowrap">
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
