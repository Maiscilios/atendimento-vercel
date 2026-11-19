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
  Home,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  RefreshCw,
  Search,
  Users,
  X,
} from 'lucide-react';
import {
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
} from '../../../shared/catalog';
import {
  formatDaysSinceLastVisitBR,
  type DailyCommissionSummary,
  type PanelClientSummary,
} from '../../../shared/panelTypes';
import {
  fetchDudaAttendances,
  fetchDudaClients,
  fetchDudaCommissions,
  fetchDudaDashboard,
} from '../lib/api';
import { AgendaBookingModal, type AgendaBookingModalState } from './AgendaBookingModal';
import { AgendaCalendarTab } from './AgendaCalendarTab';
import { ChangePasswordModal } from './ChangePasswordModal';
import { ClientDetailModal } from './ClientDetailModal';
import { PanelSidebarNav, type SidebarNavItem } from './PanelSidebarNav';

interface DudaPanelProps {
  user: AuthUser;
  onGoHome: () => void;
  onLogout: () => void;
}

type DudaTab = 'home' | 'clients' | 'appointments' | 'agenda' | 'commissions';

const TABS: Array<SidebarNavItem<DudaTab>> = [
  { id: 'home', label: 'Início', icon: LayoutDashboard },
  { id: 'clients', label: 'Minhas clientes', icon: Users },
  { id: 'appointments', label: 'Agendamentos', icon: CalendarClock },
  { id: 'agenda', label: 'Minha agenda', icon: Calendar },
  { id: 'commissions', label: 'Minhas comissões', icon: DollarSign },
];

export function DudaPanel({ user, onGoHome, onLogout }: DudaPanelProps) {
  const [activeTab, setActiveTab] = useState<DudaTab>('home');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [error, setError] = useState('');

  // Tab 1: Início
  const [homeDate, setHomeDate] = useState<string>(() => getLocalDateISO());
  const [homeLoading, setHomeLoading] = useState(true);
  const [dayTotalProduced, setDayTotalProduced] = useState(0);
  const [dayCommissionToLais, setDayCommissionToLais] = useState(0);
  const [dayAttendances, setDayAttendances] = useState<AttendanceRecord[]>([]);

  // Tab 2: Minhas clientes
  const [clientSearch, setClientSearch] = useState('');
  const [clients, setClients] = useState<PanelClientSummary[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [selectedClient, setSelectedClient] = useState<PanelClientSummary | null>(null);
  const [brazilToday, setBrazilToday] = useState<string>(() => getBrazilTodayISO());

  // Tab 3: Agendamentos & Minha agenda
  const [statusFilter, setStatusFilter] = useState<'all' | 'waiting' | 'confirmed'>('all');
  const [appointments, setAppointments] = useState<AttendanceRecord[]>([]);
  const [appointmentsLoading, setAppointmentsLoading] = useState(false);
  const [agendaBookingState, setAgendaBookingState] = useState<AgendaBookingModalState>({
    kind: 'closed',
  });
  const [agendaFeedback, setAgendaFeedback] = useState('');
  const [agendaFocusDate, setAgendaFocusDate] = useState<string | undefined>(undefined);

  // Tab 4: Minhas comissões (consulta dia a dia, sem saldo geral acumulado)
  const [commissionDate, setCommissionDate] = useState<string>(() => getLocalDateISO());
  const [selectedCommissionDay, setSelectedCommissionDay] =
    useState<DailyCommissionSummary | null>(null);
  const [availableCommissionDays, setAvailableCommissionDays] = useState<DailyCommissionSummary[]>(
    []
  );
  const [commissionsLoading, setCommissionsLoading] = useState(false);

  const loadHome = useCallback(async () => {
    setHomeLoading(true);
    setError('');
    try {
      const data = await fetchDudaDashboard(homeDate);
      setDayTotalProduced(data.dayTotalProduced);
      setDayCommissionToLais(data.dayCommissionToLais);
      setDayAttendances(data.dayAttendances);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar o resumo do dia.');
    } finally {
      setHomeLoading(false);
    }
  }, [homeDate]);

  const loadClients = useCallback(async () => {
    setClientsLoading(true);
    setError('');
    try {
      const data = await fetchDudaClients(clientSearch);
      setClients(data.clients);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar clientes.');
    } finally {
      setClientsLoading(false);
    }
  }, [clientSearch]);

  const loadAppointments = useCallback(async () => {
    setAppointmentsLoading(true);
    setError('');
    try {
      const data = await fetchDudaAttendances({
        returnStatus: statusFilter !== 'all' ? statusFilter : undefined,
        onlyReturns: true,
      });
      setAppointments(data.attendances);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar agendamentos.');
    } finally {
      setAppointmentsLoading(false);
    }
  }, [statusFilter]);

  const loadCommissions = useCallback(async () => {
    setCommissionsLoading(true);
    setError('');
    try {
      const data = await fetchDudaCommissions(commissionDate);
      setSelectedCommissionDay(data.selectedDay);
      setAvailableCommissionDays(data.availableDays);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar comissões.');
    } finally {
      setCommissionsLoading(false);
    }
  }, [commissionDate]);

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
    else if (activeTab === 'commissions') void loadCommissions();
  }, [activeTab, loadHome, loadClients, loadAppointments, loadCommissions]);

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
              · Painel da {user.displayName}
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
              <span className="hidden md:inline">Senha</span>
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
          subtitle={`Painel da ${user.displayName}`}
        />

        <main className="flex-1 min-w-0 w-full space-y-6">
          <div>
            <h1 className="font-display text-3xl font-bold text-[#831843]">
              Painel da Duda
            </h1>
            <p className="text-sm text-[#7A5464]">
              Seus atendimentos, clientes, agendamentos e repasse diário de 25%
            </p>
          </div>

          {error && (
            <div className="p-3.5 rounded-xl bg-[#FFF1F2] border border-[#FECDD3] text-sm text-[#9F1239]">
              {error}
            </div>
          )}

        {/* 1. INÍCIO */}
        {activeTab === 'home' && (
          <div className="space-y-5">
            <div className="bg-white border border-[#F1D8E2] rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-white border border-[#F1D8E2] rounded-2xl p-5">
                <span className="text-xs font-medium text-[#7A5464]">
                  Total produzido em {formatDateBR(homeDate)} ({dayAttendances.length}{' '}
                  {dayAttendances.length === 1 ? 'atendimento' : 'atendimentos'})
                </span>
                <p className="mt-1.5 text-3xl font-bold text-[#331824] tabular-nums">
                  {formatBRL(dayTotalProduced)}
                </p>
              </div>

              <div className="bg-[#FDF2F6] border border-[#EBC5D5] rounded-2xl p-5">
                <span className="text-xs font-medium text-[#831843]">
                  Comissão de 25% que deve repassar à Laís
                </span>
                <p className="mt-1.5 text-3xl font-bold text-[#831843] tabular-nums">
                  {formatBRL(dayCommissionToLais)}
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
                    Nenhum atendimento seu registrado em {formatDateBR(homeDate)}
                  </p>
                  <p className="text-sm text-[#7A5464]">
                    Selecione outra data no calendário acima.
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
                        <h3 className="text-base font-semibold text-[#331824]">
                          {item.clientName}
                        </h3>
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
                        <div>
                          <span className="block text-xs text-[#831843]">Comissão (25%)</span>
                          <span className="text-base font-bold text-[#831843] tabular-nums">
                            {formatBRL(item.commissionAmount)}
                          </span>
                        </div>
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
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-[#9D2A58] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                  placeholder="Buscar cliente por nome ou WhatsApp..."
                  className="w-full min-h-[44px] pl-10 pr-4 py-2 text-sm bg-[#FFF9FB] border border-[#EED2DE] rounded-xl text-[#331824] focus:outline-none focus:border-[#9D2A58]"
                />
              </div>
              <span className="text-xs font-medium text-[#7A5464] tabular-nums">
                {clients.length} {clients.length === 1 ? 'cliente' : 'clientes'}
              </span>
            </div>

            <div className="bg-white border border-[#F1D8E2] rounded-2xl overflow-hidden">
              {clientsLoading ? (
                <div className="p-8 text-center text-sm text-[#7A5464]">
                  Carregando suas clientes...
                </div>
              ) : clients.length === 0 ? (
                <div className="p-8 text-center space-y-1.5">
                  <p className="text-base font-medium text-[#331824]">
                    Nenhuma cliente encontrada
                  </p>
                  <p className="text-sm text-[#7A5464]">
                    Suas clientes aparecerão aqui automaticamente conforme os atendimentos forem confirmados.
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
                    onClick={() => setStatusFilter(opt.id)}
                    className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                      statusFilter === opt.id
                        ? 'bg-white text-[#831843] shadow-sm'
                        : 'text-[#6E4959] hover:text-[#331824]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
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
                    Quando suas clientes selecionarem preferência de retorno no formulário, elas aparecerão aqui.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-[#F5E4EC]">
                  {appointments.map((item) => {
                    const isConfirmed = item.returnStatus === 'confirmed';
                    const message = item.returnDate
                      ? `Olá ${item.clientName}! Aqui é a Duda do estúdio MAIS CÍLIOS. Vi sua preferência de manutenção para ${formatDateBR(item.returnDate)} (${item.preferredTimes.join(', ')}). Vamos confirmar seu horário?`
                      : `Olá ${item.clientName}! Aqui é a Duda do estúdio MAIS CÍLIOS. Vamos combinar a data da sua próxima manutenção?`;

                    return (
                      <div
                        key={item.id}
                        className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-[#FFF9FB]"
                      >
                        <div className="space-y-1.5 min-w-0">
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
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

        {/* MINHA AGENDA (EXCLUSIVA DA DUDA) */}
        {activeTab === 'agenda' && (
          <AgendaCalendarTab isAdmin={false} initialDate={agendaFocusDate} />
        )}

        {/* 4. MINHAS COMISSÕES (POR DIA SEPARADAMENTE — SEM SALDO GERAL ACUMULADO) */}
        {activeTab === 'commissions' && (
          <div className="space-y-5">
            <div className="bg-white border border-[#F1D8E2] rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2.5">
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

              <button
                type="button"
                onClick={() => void loadCommissions()}
                className="min-h-[40px] px-3.5 py-2 inline-flex items-center gap-1.5 text-xs font-semibold text-[#831843] bg-[#FDF2F6] hover:bg-[#F9E3EC] rounded-xl transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${commissionsLoading ? 'animate-spin' : ''}`} />
                <span>Atualizar</span>
              </button>
            </div>

            {selectedCommissionDay && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white border border-[#F1D8E2] rounded-2xl p-5">
                  <span className="text-xs font-medium text-[#7A5464]">
                    Total produzido em {formatDateBR(selectedCommissionDay.date)}
                  </span>
                  <p className="mt-1.5 text-2xl sm:text-3xl font-bold text-[#331824] tabular-nums">
                    {formatBRL(selectedCommissionDay.totalProduced)}
                  </p>
                </div>

                <div className="bg-[#FDF2F6] border border-[#EBC5D5] rounded-2xl p-5">
                  <span className="text-xs font-medium text-[#831843]">
                    Comissão de 25% do dia
                  </span>
                  <p className="mt-1.5 text-2xl sm:text-3xl font-bold text-[#831843] tabular-nums">
                    {formatBRL(selectedCommissionDay.commissionAmount)}
                  </p>
                </div>

                <div className="bg-white border border-[#F1D8E2] rounded-2xl p-5 flex flex-col justify-between">
                  <span className="text-xs font-medium text-[#7A5464]">
                    Situação do repasse
                  </span>
                  <div className="mt-1.5 flex items-center gap-2">
                    {selectedCommissionDay.count === 0 ? (
                      <span className="text-lg font-semibold text-[#7A5464]">
                        Sem movimento
                      </span>
                    ) : selectedCommissionDay.payoutStatus === 'paid' ? (
                      <span className="inline-flex items-center gap-1.5 text-xl font-bold text-[#15803D]">
                        <CheckCircle2 className="w-5 h-5" />
                        <span>Repassado</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xl font-bold text-[#B45309]">
                        <Clock className="w-5 h-5" />
                        <span>Pendente</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Detalhamento do dia selecionado */}
            <div className="bg-white border border-[#F1D8E2] rounded-2xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-[#F5E4EC] flex items-center justify-between">
                <h2 className="text-base font-semibold text-[#331824]">
                  Atendimentos de {formatDateBR(commissionDate)}
                </h2>
                <span className="text-xs text-[#7A5464] tabular-nums">
                  {selectedCommissionDay?.count ?? 0}{' '}
                  {selectedCommissionDay?.count === 1 ? 'atendimento' : 'atendimentos'}
                </span>
              </div>

              {commissionsLoading ? (
                <div className="p-8 text-center text-sm text-[#7A5464]">
                  Carregando dados do dia...
                </div>
              ) : !selectedCommissionDay || selectedCommissionDay.attendances.length === 0 ? (
                <div className="p-8 text-center text-sm text-[#7A5464]">
                  Nenhum atendimento registrado nesta data.
                </div>
              ) : (
                <div className="divide-y divide-[#F5E4EC]">
                  {selectedCommissionDay.attendances.map((item) => (
                    <div
                      key={item.id}
                      className="p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div>
                        <p className="font-semibold text-[#331824]">{item.clientName}</p>
                        <p className="text-sm text-[#5E3A4A]">
                          {item.services.map((s) => s.name).join(' · ')}
                        </p>
                      </div>
                      <div className="flex items-center gap-6 sm:text-right tabular-nums">
                        <div>
                          <span className="block text-xs text-[#7A5464]">Recebido</span>
                          <span className="font-bold text-[#331824]">
                            {formatBRL(item.totalPaid)}
                          </span>
                        </div>
                        <div>
                          <span className="block text-xs text-[#831843]">Comissão (25%)</span>
                          <span className="font-bold text-[#831843]">
                            {formatBRL(item.commissionAmount)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Dias anteriores para consulta rápida */}
            <div className="bg-white border border-[#F1D8E2] rounded-2xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-[#F5E4EC]">
                <h2 className="text-base font-semibold text-[#331824]">
                  Consulta por dia (inclusive dias anteriores)
                </h2>
              </div>
              {availableCommissionDays.length === 0 ? (
                <div className="p-8 text-center text-sm text-[#7A5464]">
                  Ainda não há dias com atendimentos registrados.
                </div>
              ) : (
                <div className="divide-y divide-[#F5E4EC]">
                  {availableCommissionDays.map((day) => {
                    const selected = day.date === commissionDate;
                    const isPaid = day.payoutStatus === 'paid';
                    return (
                      <button
                        key={day.date}
                        type="button"
                        onClick={() => setCommissionDate(day.date)}
                        className={`w-full text-left p-4 sm:px-5 flex flex-wrap items-center justify-between gap-3 transition-colors ${
                          selected ? 'bg-[#FDF2F6]' : 'hover:bg-[#FFF9FB]'
                        }`}
                      >
                        <div className="space-y-0.5">
                          <span className="text-base font-semibold text-[#331824] tabular-nums">
                            {formatDateBR(day.date)}
                          </span>
                          <span className="block text-xs text-[#7A5464] tabular-nums">
                            {day.count} {day.count === 1 ? 'atendimento' : 'atendimentos'}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-6 tabular-nums">
                          <div className="text-right">
                            <span className="block text-xs text-[#7A5464]">Produzido</span>
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
                          <span
                            className={`text-xs font-semibold inline-flex items-center gap-1 ${
                              isPaid ? 'text-[#15803D]' : 'text-[#B45309]'
                            }`}
                          >
                            {isPaid ? (
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            ) : (
                              <Clock className="w-3.5 h-3.5" />
                            )}
                            <span>{isPaid ? 'Repassado' : 'Pendente'}</span>
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
        </main>
      </div>

      <ClientDetailModal
        client={selectedClient}
        onClose={() => setSelectedClient(null)}
      />

      <ChangePasswordModal
        isOpen={passwordModalOpen}
        onClose={() => setPasswordModalOpen(false)}
        userName={user.displayName}
      />

      <AgendaBookingModal
        state={agendaBookingState}
        isAdmin={false}
        onClose={() => setAgendaBookingState({ kind: 'closed' })}
        onSaved={({ appointment, updatedAttendance, message }) => {
          setAgendaBookingState({ kind: 'closed' });
          setAgendaFocusDate(appointment.appointmentDate);
          setAgendaFeedback(message);
          if (updatedAttendance) {
            setAppointments((prev) => {
              const next = prev.map((item) =>
                item.id === updatedAttendance.id ? updatedAttendance : item
              );
              return statusFilter === 'waiting'
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
