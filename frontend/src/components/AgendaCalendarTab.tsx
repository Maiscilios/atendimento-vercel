import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Edit3,
  MessageCircle,
  Plus,
  RefreshCw,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import {
  buildWhatsAppLink,
  formatDateBR,
  getBrazilTodayISO,
  type Professional,
} from '../../../shared/catalog';
import type { AgendaAppointment, AgendaViewMode } from '../../../shared/panelTypes';
import {
  cancelAdminAgendaAppointment,
  cancelDudaAgendaAppointment,
  deleteAdminAgendaAppointment,
  deleteDudaAgendaAppointment,
  fetchAdminAgenda,
  fetchDudaAgenda,
} from '../lib/api';
import { AgendaBookingModal, type AgendaBookingModalState } from './AgendaBookingModal';

export interface AgendaInitialBookingRequest {
  requestId: number;
  clientName: string;
  whatsapp: string;
  professional?: Professional;
}

interface AgendaCalendarTabProps {
  isAdmin: boolean;
  initialDate?: string;
  initialProfessional?: Professional;
  initialBooking?: AgendaInitialBookingRequest | null;
  onInitialBookingConsumed?: () => void;
}

const WEEKDAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTH_NAMES_PT = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

function parseISOParts(iso: string): { year: number; month: number; day: number } {
  const [y, m, d] = iso.split('-').map(Number);
  return {
    year: Number.isFinite(y) ? y : 2026,
    month: Number.isFinite(m) ? m : 1,
    day: Number.isFinite(d) ? d : 1,
  };
}

function formatUTCDateISO(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function shiftISODate(iso: string, deltaDays: number): string {
  const { year, month, day } = parseISOParts(iso);
  return formatUTCDateISO(new Date(Date.UTC(year, month - 1, day + deltaDays)));
}

function shiftISOMonth(iso: string, deltaMonths: number): string {
  const { year, month } = parseISOParts(iso);
  return formatUTCDateISO(new Date(Date.UTC(year, month - 1 + deltaMonths, 1)));
}

function getWeekdayIndex(iso: string): number {
  const { year, month, day } = parseISOParts(iso);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function getWeekDates(anchorISO: string): string[] {
  const weekday = getWeekdayIndex(anchorISO);
  const sunday = shiftISODate(anchorISO, -weekday);
  return Array.from({ length: 7 }, (_, i) => shiftISODate(sunday, i));
}

function getMonthGridDates(anchorISO: string): {
  monthLabel: string;
  cells: Array<{ iso: string; dayNumber: number; inCurrentMonth: boolean }>;
  rangeStart: string;
  rangeEnd: string;
} {
  const { year, month } = parseISOParts(anchorISO);
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const firstWeekday = firstOfMonth.getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
  const gridStartISO = formatUTCDateISO(new Date(Date.UTC(year, month - 1, 1 - firstWeekday)));

  const cells: Array<{ iso: string; dayNumber: number; inCurrentMonth: boolean }> = [];
  for (let i = 0; i < totalCells; i += 1) {
    const iso = shiftISODate(gridStartISO, i);
    const parts = parseISOParts(iso);
    cells.push({
      iso,
      dayNumber: parts.day,
      inCurrentMonth: parts.year === year && parts.month === month,
    });
  }

  return {
    monthLabel: `${MONTH_NAMES_PT[month - 1]} de ${year}`,
    cells,
    rangeStart: cells[0].iso,
    rangeEnd: cells[cells.length - 1].iso,
  };
}

function formatLongDateBR(iso: string): string {
  const { year, month, day } = parseISOParts(iso);
  const weekday = WEEKDAY_SHORT[getWeekdayIndex(iso)];
  return `${weekday}, ${String(day).padStart(2, '0')} de ${MONTH_NAMES_PT[month - 1].toLowerCase()} de ${year}`;
}

export function AgendaCalendarTab({
  isAdmin,
  initialDate,
  initialProfessional,
  initialBooking,
  onInitialBookingConsumed,
}: AgendaCalendarTabProps) {
  const [brazilToday, setBrazilToday] = useState<string>(() => getBrazilTodayISO());
  const [activeProfessional, setActiveProfessional] = useState<Professional>(
    isAdmin ? initialProfessional || 'lais' : 'duda'
  );
  const [viewMode, setViewMode] = useState<AgendaViewMode>('day');
  const [selectedDate, setSelectedDate] = useState<string>(() => initialDate || getBrazilTodayISO());

  const [appointments, setAppointments] = useState<AgendaAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  const [detailAppointment, setDetailAppointment] = useState<AgendaAppointment | null>(null);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const [bookingModal, setBookingModal] = useState<AgendaBookingModalState>({ kind: 'closed' });
  const lastConsumedBookingIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (initialDate) {
      setSelectedDate(initialDate);
    }
  }, [initialDate]);

  useEffect(() => {
    if (isAdmin && initialProfessional) {
      setActiveProfessional(initialProfessional);
    }
  }, [isAdmin, initialProfessional]);

  useEffect(() => {
    if (!initialBooking) return;
    if (lastConsumedBookingIdRef.current === initialBooking.requestId) return;
    lastConsumedBookingIdRef.current = initialBooking.requestId;

    const targetProfessional: Professional = isAdmin
      ? initialBooking.professional || activeProfessional
      : 'duda';
    if (isAdmin && initialBooking.professional) {
      setActiveProfessional(initialBooking.professional);
    }
    setBookingModal({
      kind: 'create',
      professional: targetProfessional,
      initialDate: selectedDate || brazilToday,
      initialClientName: initialBooking.clientName,
      initialWhatsapp: initialBooking.whatsapp,
    });
    onInitialBookingConsumed?.();
  }, [
    initialBooking,
    isAdmin,
    activeProfessional,
    selectedDate,
    brazilToday,
    onInitialBookingConsumed,
  ]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const next = getBrazilTodayISO();
      setBrazilToday((prev) => (prev === next ? prev : next));
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const weekDates = useMemo(() => getWeekDates(selectedDate), [selectedDate]);
  const monthGrid = useMemo(() => getMonthGridDates(selectedDate), [selectedDate]);

  const queryRange = useMemo(() => {
    if (viewMode === 'day') {
      return { startDate: selectedDate, endDate: selectedDate };
    }
    if (viewMode === 'week') {
      return { startDate: weekDates[0], endDate: weekDates[6] };
    }
    return { startDate: monthGrid.rangeStart, endDate: monthGrid.rangeEnd };
  }, [viewMode, selectedDate, weekDates, monthGrid.rangeStart, monthGrid.rangeEnd]);

  const loadAgenda = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (isAdmin) {
        const res = await fetchAdminAgenda({
          professional: activeProfessional,
          startDate: queryRange.startDate,
          endDate: queryRange.endDate,
        });
        setAppointments(res.appointments);
      } else {
        const res = await fetchDudaAgenda(queryRange);
        setAppointments(res.appointments);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar a agenda.');
    } finally {
      setLoading(false);
    }
  }, [isAdmin, activeProfessional, queryRange]);

  useEffect(() => {
    void loadAgenda();
  }, [loadAgenda]);

  const appointmentsByDate = useMemo(() => {
    const map = new Map<string, AgendaAppointment[]>();
    for (const appt of appointments) {
      const list = map.get(appt.appointmentDate);
      if (list) list.push(appt);
      else map.set(appt.appointmentDate, [appt]);
    }
    return map;
  }, [appointments]);

  const selectedDayAppointments = useMemo(
    () => appointmentsByDate.get(selectedDate) ?? [],
    [appointmentsByDate, selectedDate]
  );

  function handleNavigate(direction: -1 | 1) {
    if (viewMode === 'day') {
      setSelectedDate((d) => shiftISODate(d, direction));
    } else if (viewMode === 'week') {
      setSelectedDate((d) => shiftISODate(d, direction * 7));
    } else {
      setSelectedDate((d) => shiftISOMonth(d, direction));
    }
  }

  async function handleCancelAppointment(id: string) {
    setActionLoading(true);
    setError('');
    try {
      const updated = isAdmin
        ? await cancelAdminAgendaAppointment(id)
        : await cancelDudaAgendaAppointment(id);
      setDetailAppointment(null);
      setConfirmCancelId(null);
      setFeedback(
        `Agendamento de ${updated.clientName} (${formatDateBR(updated.appointmentDate)} às ${updated.appointmentTime}) cancelado.`
      );
      await loadAgenda();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao cancelar agendamento.');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDeleteAppointment(id: string) {
    setActionLoading(true);
    setError('');
    try {
      if (isAdmin) await deleteAdminAgendaAppointment(id);
      else await deleteDudaAgendaAppointment(id);
      setDetailAppointment(null);
      setConfirmDeleteId(null);
      setFeedback('Agendamento removido da agenda.');
      await loadAgenda();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir agendamento.');
    } finally {
      setActionLoading(false);
    }
  }

  const headerPeriodLabel = useMemo(() => {
    if (viewMode === 'day') return formatLongDateBR(selectedDate);
    if (viewMode === 'week') {
      return `${formatDateBR(weekDates[0])} até ${formatDateBR(weekDates[6])}`;
    }
    return monthGrid.monthLabel;
  }, [viewMode, selectedDate, weekDates, monthGrid.monthLabel]);

  const viewingProfName = activeProfessional === 'lais' ? 'Laís' : 'Duda';

  return (
    <div className="space-y-5">
      <div className="bg-surface border border-border rounded-2xl p-4 space-y-4">
        {isAdmin && (
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-border">
            <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
              Agenda exibida:
            </span>
            <div className="flex items-center gap-1 p-1 bg-brand-soft rounded-xl">
              <button
                type="button"
                onClick={() => setActiveProfessional('lais')}
                className={`min-h-[38px] px-4 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-colors ${
                  activeProfessional === 'lais'
                    ? 'tab-active'
                    : 'tab-idle'
                }`} aria-pressed={activeProfessional === 'lais'}
              >
                Agenda da Laís
              </button>
              <button
                type="button"
                onClick={() => setActiveProfessional('duda')}
                className={`min-h-[38px] px-4 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-colors ${
                  activeProfessional === 'duda'
                    ? 'tab-active'
                    : 'tab-idle'
                }`} aria-pressed={activeProfessional === 'duda'}
              >
                Agenda da Duda
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 p-1 bg-brand-soft rounded-xl">
              {(
                [
                  { id: 'day', label: 'Dia' },
                  { id: 'week', label: 'Semana' },
                  { id: 'month', label: 'Mês' },
                ] as const
              ).map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setViewMode(mode.id)}
                  className={`min-h-[40px] px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                    viewMode === mode.id
                      ? 'tab-active'
                      : 'tab-idle'
                  }`} aria-pressed={viewMode === mode.id}
                >
                  {mode.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleNavigate(-1)}
                aria-label="Período anterior"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-border bg-background btn-ghost"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setSelectedDate(brazilToday)}
                className="min-h-[44px] px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-xl transition-colors btn-secondary"
              >
                Hoje
              </button>
              <button
                type="button"
                onClick={() => handleNavigate(1)}
                aria-label="Próximo período"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-border bg-background btn-ghost"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
              aria-label="Selecionar data na agenda"
              className="min-h-[44px] px-3 py-2 font-semibold border rounded-xl tabular-nums field-control text-base"
            />
            <button
              type="button"
              onClick={() => void loadAgenda()}
              aria-label="Atualizar agenda"
              className="min-h-[44px] px-3.5 py-2 inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold rounded-xl transition-colors btn-secondary"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Atualizar</span>
            </button>
            <button
              type="button"
              onClick={() =>
                setBookingModal({
                  kind: 'create',
                  professional: activeProfessional,
                  initialDate: selectedDate,
                })
              }
              className="min-h-[44px] px-4 py-2 inline-flex items-center gap-2 text-sm font-semibold rounded-xl transition-colors shadow-sm btn-primary"
            >
              <Plus className="w-4 h-4" />
              <span>Novo agendamento</span>
            </button>
          </div>
        </div>

        <div className="pt-2 border-t border-border flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-brand-strong">
            <Calendar className="w-4 h-4 shrink-0" />
            <h2 className="text-base sm:text-lg font-semibold capitalize">{headerPeriodLabel}</h2>
          </div>
          <span className="text-xs text-text-secondary tabular-nums">
            Agenda da {viewingProfName} · {appointments.length}{' '}
            {appointments.length === 1 ? 'agendamento confirmado' : 'agendamentos confirmados'}
          </span>
        </div>
      </div>

      {feedback && (
        <div className="p-3.5 rounded-xl bg-success-soft border border-success-border text-sm text-success flex items-center justify-between gap-3">
          <span>{feedback}</span>
          <button
            type="button"
            onClick={() => setFeedback('')}
            aria-label="Fechar aviso"
            className="text-success hover:opacity-75"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-xl bg-error-soft border border-error-border text-sm text-error">
          {error}
        </div>
      )}

      {/* VIEW: DAY */}
      {viewMode === 'day' && (
        <section className="bg-surface border border-border rounded-2xl overflow-hidden">
          <div className="px-4 sm:px-5 py-3.5 border-b border-border flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold text-text-primary">
                Confirmados em {formatDateBR(selectedDate)}
                {selectedDate === brazilToday && (
                  <span className="ml-2 text-xs font-semibold text-brand-strong">(Hoje)</span>
                )}
              </h3>
              <p className="text-xs text-text-secondary">
                Apenas agendamentos confirmados aparecem no calendário da {viewingProfName}
              </p>
            </div>
            <span className="text-xs font-medium text-text-secondary tabular-nums">
              {selectedDayAppointments.length}{' '}
              {selectedDayAppointments.length === 1 ? 'horário marcado' : 'horários marcados'}
            </span>
          </div>

          {loading ? (
            <div className="p-8 text-center text-sm text-text-secondary">Carregando agenda...</div>
          ) : selectedDayAppointments.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <p className="text-base font-medium text-text-primary">
                Nenhum agendamento confirmado em {formatDateBR(selectedDate)}
              </p>
              <p className="text-sm text-text-secondary">
                Adicione um horário manualmente ou confirme uma solicitação na aba “Agendamentos”.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {selectedDayAppointments.map((appt) => (
                <div
                  key={appt.id}
                  className="p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-background transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => setDetailAppointment(appt)}
                    className="flex-1 text-left flex items-start sm:items-center gap-3.5 min-w-0"
                  >
                    <span className="min-w-[62px] text-lg font-bold text-brand-strong tabular-nums pt-0.5 sm:pt-0">
                      {appt.appointmentTime}
                    </span>
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-base font-semibold text-text-primary truncate">
                          {appt.clientName}
                        </span>
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-success">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Confirmado</span>
                        </span>
                      </div>
                      <p className="text-sm text-text-secondary">{appt.procedureName}</p>
                      {appt.notes && (
                        <p className="text-xs text-text-secondary truncate">Obs.: {appt.notes}</p>
                      )}
                    </div>
                  </button>

                  <div className="flex items-center gap-2 shrink-0 pl-[74px] sm:pl-0">
                    <a
                      href={buildWhatsAppLink(
                        appt.whatsapp,
                        `Olá ${appt.clientName}! Aqui é a ${viewingProfName} do estúdio MAIS CÍLIOS confirmando seu atendimento em ${formatDateBR(appt.appointmentDate)} às ${appt.appointmentTime} (${appt.procedureName}).`
                      )}
                      target="_blank"
                      rel="noreferrer"
                      className="min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 tabular-nums btn-success-soft"
                    >
                      <MessageCircle className="w-4 h-4" />
                      <span>WhatsApp</span>
                    </a>
                    <button
                      type="button"
                      onClick={() => setDetailAppointment(appt)}
                      className="min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-semibold btn-secondary"
                    >
                      Detalhes
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* VIEW: WEEK */}
      {viewMode === 'week' && (
        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-7 gap-3">
          {weekDates.map((dayISO, index) => {
            const dayList = appointmentsByDate.get(dayISO) ?? [];
            const isToday = dayISO === brazilToday;
            const isSelected = dayISO === selectedDate;

            return (
              <div
                key={dayISO}
                className={`bg-surface rounded-2xl border flex flex-col overflow-hidden ${
                  isToday
                    ? 'border-brand ring-1 ring-brand-strong/20'
                    : isSelected
                      ? 'border-brand'
                      : 'border-border'
                }`}
              >
                <div
                  className={`px-3.5 py-3 border-b flex items-center justify-between gap-2 ${
                    isToday ? 'bg-brand-soft border-border' : 'bg-background border-border'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedDate(dayISO);
                      setViewMode('day');
                    }}
                    className="text-left"
                  >
                    <span className="block text-xs font-semibold uppercase tracking-wider text-text-secondary">
                      {WEEKDAY_SHORT[index]}
                      {isToday ? ' · Hoje' : ''}
                    </span>
                    <span className="text-base font-bold text-text-primary tabular-nums">
                      {formatDateBR(dayISO).slice(0, 5)}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setBookingModal({
                        kind: 'create',
                        professional: activeProfessional,
                        initialDate: dayISO,
                      })
                    }
                    aria-label={`Novo agendamento em ${formatDateBR(dayISO)}`}
                    className="min-h-[36px] min-w-[36px] rounded-lg bg-surface hover:bg-brand-selected border border-border text-brand-strong flex items-center justify-center transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-2.5 space-y-2 flex-1">
                  {dayList.length === 0 ? (
                    <p className="py-4 text-center text-xs text-text-secondary">
                      Sem agendamentos
                    </p>
                  ) : (
                    dayList.map((appt) => (
                      <button
                        key={appt.id}
                        type="button"
                        onClick={() => setDetailAppointment(appt)}
                        className="w-full text-left p-2.5 rounded-xl transition-colors space-y-0.5 btn-secondary"
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-bold text-brand-strong tabular-nums">
                            {appt.appointmentTime}
                          </span>
                          <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0" />
                        </div>
                        <p className="text-sm font-semibold text-text-primary truncate">
                          {appt.clientName}
                        </p>
                        <p className="text-xs text-text-secondary truncate">{appt.procedureName}</p>
                      </button>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </section>
      )}

      {/* VIEW: MONTH */}
      {viewMode === 'month' && (
        <div className="space-y-5">
          <section className="bg-surface border border-border rounded-2xl overflow-hidden">
            <div className="grid grid-cols-7 border-b border-border bg-background">
              {WEEKDAY_SHORT.map((dayName) => (
                <div
                  key={dayName}
                  className="py-2.5 text-center text-xs font-semibold uppercase tracking-wider text-text-secondary"
                >
                  {dayName}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7">
              {monthGrid.cells.map((cell) => {
                const dayList = appointmentsByDate.get(cell.iso) ?? [];
                const isToday = cell.iso === brazilToday;
                const isSelected = cell.iso === selectedDate;

                return (
                  <button
                    key={cell.iso}
                    type="button"
                    onClick={() => setSelectedDate(cell.iso)}
                    className={`min-h-[76px] sm:min-h-[104px] p-1.5 sm:p-2 border-b border-r border-border text-left flex flex-col justify-between transition-colors ${
                      isSelected
                        ? 'bg-brand-selected'
                        : cell.inCurrentMonth
                          ? 'bg-surface hover:bg-background'
                          : 'bg-background text-text-secondary'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 w-full">
                      <span
                        className={`w-7 h-7 rounded-full inline-flex items-center justify-center text-xs sm:text-sm font-semibold tabular-nums ${
                          isToday
                            ? 'bg-brand-strong text-surface'
                            : isSelected
                              ? 'bg-brand-selected text-brand-strong ring-1 ring-brand'
                              : cell.inCurrentMonth
                                ? 'text-text-primary'
                                : 'text-text-secondary'
                        }`}
                      >
                        {cell.dayNumber}
                      </span>

                      {dayList.length > 0 && (
                        <span className="text-[11px] font-bold text-brand-strong tabular-nums">
                          {dayList.length}
                        </span>
                      )}
                    </div>

                    <div className="mt-1 space-y-1 w-full overflow-hidden">
                      {dayList.slice(0, 2).map((appt) => (
                        <div
                          key={appt.id}
                          className="hidden sm:block px-1.5 py-0.5 rounded bg-surface border border-border text-[11px] text-text-primary truncate tabular-nums"
                        >
                          <strong className="text-brand-strong">{appt.appointmentTime}</strong>{' '}
                          {appt.clientName}
                        </div>
                      ))}
                      {dayList.length > 2 && (
                        <div className="hidden sm:block text-[10px] font-semibold text-brand-strong pl-1">
                          +{dayList.length - 2} mais
                        </div>
                      )}
                      {dayList.length > 0 && (
                        <div className="sm:hidden text-[10px] font-semibold text-brand-strong tabular-nums">
                          {dayList[0].appointmentTime}
                          {dayList.length > 1 ? ` +${dayList.length - 1}` : ''}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="bg-surface border border-border rounded-2xl overflow-hidden">
            <div className="px-4 sm:px-5 py-3.5 border-b border-border flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-text-primary">
                  Dia selecionado: {formatLongDateBR(selectedDate)}
                </h3>
                <p className="text-xs text-text-secondary tabular-nums">
                  {selectedDayAppointments.length}{' '}
                  {selectedDayAppointments.length === 1
                    ? 'agendamento confirmado'
                    : 'agendamentos confirmados'}
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setBookingModal({
                    kind: 'create',
                    professional: activeProfessional,
                    initialDate: selectedDate,
                  })
                }
                className="min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 btn-primary"
              >
                <Plus className="w-4 h-4" />
                <span>Agendar neste dia</span>
              </button>
            </div>

            {selectedDayAppointments.length === 0 ? (
              <div className="p-6 text-center text-sm text-text-secondary">
                Nenhum agendamento confirmado para {formatDateBR(selectedDate)}.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {selectedDayAppointments.map((appt) => (
                  <div
                    key={appt.id}
                    className="p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-background"
                  >
                    <button
                      type="button"
                      onClick={() => setDetailAppointment(appt)}
                      className="text-left flex items-center gap-3.5 min-w-0 flex-1"
                    >
                      <span className="text-base font-bold text-brand-strong tabular-nums">
                        {appt.appointmentTime}
                      </span>
                      <div className="min-w-0">
                        <p className="text-base font-semibold text-text-primary truncate">
                          {appt.clientName}
                        </p>
                        <p className="text-sm text-text-secondary truncate">{appt.procedureName}</p>
                      </div>
                    </button>

                    <div className="flex items-center gap-2 shrink-0">
                      <a
                        href={buildWhatsAppLink(appt.whatsapp)}
                        target="_blank"
                        rel="noreferrer"
                        className="min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 btn-success-soft"
                      >
                        <MessageCircle className="w-4 h-4" />
                        <span>WhatsApp</span>
                      </a>
                      <button
                        type="button"
                        onClick={() => setDetailAppointment(appt)}
                        className="min-h-[40px] px-3 py-1.5 rounded-xl text-xs sm:text-sm font-semibold btn-secondary"
                      >
                        Gerenciar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* DETAIL MODAL */}
      {detailAppointment && (
        <div
          className="fixed inset-0 z-50 bg-overlay/45 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
          role="dialog"
          aria-labelledby="agenda-detail-title"
          aria-modal="true"
        >
          <div className="w-full sm:max-w-lg bg-surface rounded-t-3xl sm:rounded-3xl border border-border shadow-dialog overflow-hidden max-h-[92vh] flex flex-col">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between bg-background">
              <div>
                <span className="text-xs font-semibold text-success inline-flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Agendamento confirmado</span>
                </span>
                <h3 id="agenda-detail-title" className="font-display text-2xl font-bold text-brand-strong">
                  {detailAppointment.clientName}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDetailAppointment(null);
                  setConfirmCancelId(null);
                  setConfirmDeleteId(null);
                }}
                aria-label="Fechar detalhes"
                className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center btn-ghost"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3.5 rounded-2xl bg-background border border-border">
                  <span className="text-xs text-text-secondary">Data</span>
                  <p className="mt-0.5 text-base font-bold text-text-primary tabular-nums">
                    {formatDateBR(detailAppointment.appointmentDate)}
                  </p>
                </div>
                <div className="p-3.5 rounded-2xl bg-background border border-border">
                  <span className="text-xs text-text-secondary">Horário</span>
                  <p className="mt-0.5 text-base font-bold text-brand-strong tabular-nums inline-flex items-center gap-1.5">
                    <Clock className="w-4 h-4" />
                    <span>{detailAppointment.appointmentTime}</span>
                  </p>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-background border border-border space-y-1">
                <span className="text-xs text-text-secondary">Serviço(s)</span>
                <p className="text-base font-semibold text-text-primary">
                  {detailAppointment.procedureName}
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-background border border-border space-y-1">
                <span className="text-xs text-text-secondary">WhatsApp da cliente</span>
                <p className="text-sm font-medium text-text-primary tabular-nums">
                  {detailAppointment.whatsapp}
                </p>
                <a
                  href={buildWhatsAppLink(
                    detailAppointment.whatsapp,
                    `Olá ${detailAppointment.clientName}! Aqui é a ${viewingProfName} do estúdio MAIS CÍLIOS confirmando seu horário em ${formatDateBR(detailAppointment.appointmentDate)} às ${detailAppointment.appointmentTime} (${detailAppointment.procedureName}).`
                  )}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 w-full min-h-[44px] px-4 py-2.5 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors btn-success"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Abrir conversa no WhatsApp</span>
                </a>
              </div>

              {detailAppointment.notes && (
                <div className="p-3.5 rounded-2xl bg-background border border-border space-y-1">
                  <span className="text-xs text-text-secondary">Observações</span>
                  <p className="text-sm text-text-primary whitespace-pre-line">
                    {detailAppointment.notes}
                  </p>
                </div>
              )}

              <div className="pt-2 border-t border-border space-y-2.5">
                <button
                  type="button"
                  onClick={() => {
                    const appt = detailAppointment;
                    setDetailAppointment(null);
                    setBookingModal({ kind: 'edit', appointment: appt });
                  }}
                  className="w-full min-h-[44px] px-4 py-2.5 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors btn-primary"
                >
                  <Edit3 className="w-4 h-4" />
                  <span>Editar ou remarcar horário</span>
                </button>

                {confirmCancelId === detailAppointment.id ? (
                  <div className="p-3 rounded-xl bg-error-soft border border-error-border space-y-2">
                    <p className="text-xs font-medium text-error">
                      Cancelar este agendamento? O horário voltará a ficar livre.
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={actionLoading}
                        onClick={() => void handleCancelAppointment(detailAppointment.id)}
                        className="flex-1 min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-semibold btn-danger-solid"
                      >
                        {actionLoading ? 'Cancelando...' : 'Confirmar cancelamento'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmCancelId(null)}
                        className="min-h-[40px] px-3 py-1.5 rounded-lg bg-surface border border-border text-xs font-semibold text-text-secondary"
                      >
                        Voltar
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmDeleteId(null);
                      setConfirmCancelId(detailAppointment.id);
                    }}
                    className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-background border border-border text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors btn-danger"
                  >
                    <XCircle className="w-4 h-4" />
                    <span>Cancelar agendamento</span>
                  </button>
                )}

                {confirmDeleteId === detailAppointment.id ? (
                  <div className="p-3 rounded-xl bg-error-soft border border-error-border flex items-center justify-between gap-2">
                    <span className="text-xs text-error">Excluir permanentemente?</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={actionLoading}
                        onClick={() => void handleDeleteAppointment(detailAppointment.id)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold btn-danger-solid"
                      >
                        Excluir
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-3 py-1.5 rounded-lg bg-surface border border-border text-xs font-semibold text-text-secondary"
                      >
                        Voltar
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmCancelId(null);
                      setConfirmDeleteId(detailAppointment.id);
                    }}
                    className="w-full min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-medium text-text-secondary hover:text-error inline-flex items-center justify-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Excluir registro</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <AgendaBookingModal
        state={bookingModal}
        isAdmin={isAdmin}
        onClose={() => setBookingModal({ kind: 'closed' })}
        onSaved={({ appointment, message }) => {
          setBookingModal({ kind: 'closed' });
          setSelectedDate(appointment.appointmentDate);
          setFeedback(message);
          void loadAgenda();
        }}
      />
    </div>
  );
}
