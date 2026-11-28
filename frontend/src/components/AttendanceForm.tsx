import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Calendar,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  X,
} from 'lucide-react';
import {
  DUDA_ADDITIONALS,
  DUDA_RETURN_OPTIONS,
  DUDA_SERVICES,
  LAIS_LASH_TYPE_SERVICE_IDS,
  LAIS_RETURN_OPTIONS,
  LAIS_SERVICES,
  RETURN_HOUR_OPTIONS_BY_PERIOD,
  RETURN_PERIOD_OPTIONS,
  addDaysToISO,
  calculateReturnDateISO,
  findStudioServiceById,
  formatBRL,
  formatBrazilPhone,
  formatBrazilTimeBR,
  formatDateBR,
  formatPreferredScheduleSummary,
  getBrazilTodayISO,
  getLocalDateISO,
  getReturnOptionLabel,
  getServicesCatalog,
  normalizeWhatsAppDigits,
  parseCurrencyInput,
  type ExtraReturnService,
  type LashAttendanceType,
  type Professional,
  type ReturnOption,
  type ReturnPeriod,
} from '../../../shared/catalog';
import {
  lookupClientsByWhatsapp,
  submitAttendance,
  type PublicRecognizedClient,
  type SubmissionConfirmation,
} from '../lib/api';

interface AttendanceFormProps {
  professional: Professional;
  onBack: () => void;
}

type FormStep = 1 | 2 | 3 | 4;

const STEP_TITLES: Record<FormStep, string> = {
  1: 'Dados da cliente',
  2: 'Atendimento realizado',
  3: 'Próximo retorno',
  4: 'Confirmar atendimento',
};

const PROGRESS_WIDTH_CLASS: Record<FormStep, string> = {
  1: 'w-1/4',
  2: 'w-2/4',
  3: 'w-3/4',
  4: 'w-full',
};

function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const CALENDAR_WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const CALENDAR_MONTHS = [
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

function parseISOYearMonth(iso: string): { year: number; month: number } {
  const [y, m] = iso.split('-').map(Number);
  return {
    year: Number.isFinite(y) ? y : 2026,
    month: Number.isFinite(m) ? m : 1,
  };
}

function toISODate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

interface ReturnDateCalendarProps {
  value: string;
  minDate: string;
  onSelect: (isoDate: string) => void;
}

function ReturnDateCalendar({
  value,
  minDate,
  onSelect,
}: ReturnDateCalendarProps) {
  const initialYM = parseISOYearMonth(value || minDate);
  const minYM = parseISOYearMonth(minDate);
  const [viewYear, setViewYear] = useState(initialYM.year);
  const [viewMonth, setViewMonth] = useState(initialYM.month);

  const canGoPrev =
    viewYear > minYM.year || (viewYear === minYM.year && viewMonth > minYM.month);

  function goPrevMonth() {
    if (!canGoPrev) return;
    if (viewMonth === 1) {
      setViewYear((y) => y - 1);
      setViewMonth(12);
    } else {
      setViewMonth((m) => m - 1);
    }
  }

  function goNextMonth() {
    if (viewMonth === 12) {
      setViewYear((y) => y + 1);
      setViewMonth(1);
    } else {
      setViewMonth((m) => m + 1);
    }
  }

  const firstDayWeekday = new Date(viewYear, viewMonth - 1, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
  const cells: Array<{ day: number; iso: string } | null> = [];
  for (let i = 0; i < firstDayWeekday; i += 1) {
    cells.push(null);
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({ day, iso: toISODate(viewYear, viewMonth, day) });
  }

  return (
    <div className="rounded-2xl bg-surface border border-brand/35 p-3.5 sm:p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={goPrevMonth}
          disabled={!canGoPrev}
          aria-label="Mês anterior"
          className="min-h-[38px] min-w-[38px] rounded-xl border border-border flex items-center justify-center btn-ghost disabled:opacity-35 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm sm:text-base font-semibold text-brand-strong">
          {CALENDAR_MONTHS[viewMonth - 1]} de {viewYear}
        </span>
        <button
          type="button"
          onClick={goNextMonth}
          aria-label="Próximo mês"
          className="min-h-[38px] min-w-[38px] rounded-xl border border-border flex items-center justify-center btn-ghost"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {CALENDAR_WEEKDAYS.map((weekday) => (
          <div
            key={weekday}
            className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary py-1"
          >
            {weekday}
          </div>
        ))}
        {cells.map((cell, idx) => {
          if (!cell) {
            return <div key={`empty-${idx}`} className="h-10" />;
          }
          const isPast = cell.iso < minDate;
          const isSelected = cell.iso === value;
          const isToday = cell.iso === minDate;
          return (
            <button
              key={cell.iso}
              type="button"
              disabled={isPast}
              onClick={() => onSelect(cell.iso)}
              aria-pressed={isSelected}
              aria-label={`Selecionar ${formatDateBR(cell.iso)}`}
              className={`h-10 rounded-xl text-sm tabular-nums transition-colors ${
                isPast
                  ? 'text-text-secondary/35 cursor-not-allowed'
                  : isSelected
                    ? 'bg-brand-strong text-surface font-bold shadow-sm'
                    : isToday
                      ? 'bg-brand-soft/80 border border-brand/50 text-brand-strong font-semibold hover:bg-brand/20'
                      : 'bg-background border border-border/70 text-text-primary font-medium hover:border-brand/60 hover:bg-brand-soft/50'
              }`}
            >
              {cell.day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function AttendanceForm({ professional, onBack }: AttendanceFormProps) {
  const isDuda = professional === 'duda';
  const servicesCatalog = getServicesCatalog(professional);
  const returnOptions = isDuda ? DUDA_RETURN_OPTIONS : LAIS_RETURN_OPTIONS;
  const professionalName = isDuda ? 'Duda' : 'Laís';

  const [step, setStep] = useState<FormStep>(1);
  const [clientName, setClientName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [recognizedWhatsappDigits, setRecognizedWhatsappDigits] = useState('');
  const [lookupStatus, setLookupStatus] = useState<
    'idle' | 'loading' | 'found' | 'not_found' | 'error'
  >('idle');
  const [lookupError, setLookupError] = useState('');
  const [matchedClients, setMatchedClients] = useState<PublicRecognizedClient[]>(
    [],
  );
  const [disambiguatedClientId, setDisambiguatedClientId] = useState<
    string | null
  >(null);
  const [forceNewNameSamePhone, setForceNewNameSamePhone] = useState(false);

  const [totalPaidInput, setTotalPaidInput] = useState('');
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [serviceAttendanceTypes, setServiceAttendanceTypes] = useState<
    Record<string, LashAttendanceType>
  >({});
  const [hasAdditionals, setHasAdditionals] = useState<'yes' | 'no' | null>(null);
  const [selectedAdditionals, setSelectedAdditionals] = useState<string[]>([]);
  const [wantsToScheduleReturn, setWantsToScheduleReturn] = useState<
    'yes' | 'no' | null
  >(null);
  const [returnOption, setReturnOption] = useState<ReturnOption | null>(null);
  const [specificReturnDate, setSpecificReturnDate] = useState('');
  const [preferredPeriod, setPreferredPeriod] = useState<ReturnPeriod | null>(
    null,
  );
  const [selectedPreferredHours, setSelectedPreferredHours] = useState<
    string[]
  >([]);
  const [showExtraProceduresPicker, setShowExtraProceduresPicker] =
    useState(false);
  const [extraReturnServiceIds, setExtraReturnServiceIds] = useState<string[]>(
    [],
  );
  const [serviceDate] = useState<string>(() => getLocalDateISO());
  const brazilToday = useMemo(() => getBrazilTodayISO(), []);

  const [idempotencyKey, setIdempotencyKey] = useState<string>(() =>
    generateIdempotencyKey(),
  );
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const whatsappInputRef = useRef<HTMLInputElement | null>(null);
  const clientNameInputRef = useRef<HTMLInputElement | null>(null);
  const lookupAbortRef = useRef<AbortController | null>(null);
  const totalEditRef = useRef<HTMLInputElement | null>(null);
  const whatsappEditRef = useRef<HTMLInputElement | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [confirmation, setConfirmation] = useState<SubmissionConfirmation | null>(
    null,
  );

  const normalizedWhatsappDigits = useMemo(
    () => normalizeWhatsAppDigits(whatsapp),
    [whatsapp],
  );

  async function runWhatsappLookup(digits: string): Promise<boolean> {
    if (digits.length < 10 || digits.length > 11) return false;
    lookupAbortRef.current?.abort();
    const controller = new AbortController();
    lookupAbortRef.current = controller;

    setLookupStatus('loading');
    setLookupError('');
    setErrorMessage('');

    try {
      const clients = await lookupClientsByWhatsapp(digits, controller.signal);
      if (controller.signal.aborted) return false;

      setMatchedClients(clients);
      setDisambiguatedClientId(null);
      if (clients.length > 0) {
        setLookupStatus('found');
        setForceNewNameSamePhone(false);
      } else {
        setLookupStatus('not_found');
        setSelectedClientId(null);
        setRecognizedWhatsappDigits('');
      }
      return true;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return false;
      }
      setMatchedClients([]);
      setSelectedClientId(null);
      setDisambiguatedClientId(null);
      setLookupStatus('error');
      setLookupError(
        err instanceof Error
          ? err.message
          : 'Não foi possível consultar seu cadastro. Tente novamente.',
      );
      return false;
    }
  }

  useEffect(() => {
    if (step !== 1 || confirmation) return;

    if (normalizedWhatsappDigits.length < 10) {
      lookupAbortRef.current?.abort();
      setLookupStatus('idle');
      setLookupError('');
      setMatchedClients([]);
      setSelectedClientId(null);
      setDisambiguatedClientId(null);
      setRecognizedWhatsappDigits('');
      setForceNewNameSamePhone(false);
      return;
    }

    if (
      selectedClientId &&
      recognizedWhatsappDigits === normalizedWhatsappDigits
    ) {
      return;
    }

    const delayMs = normalizedWhatsappDigits.length === 11 ? 250 : 750;
    const timer = window.setTimeout(() => {
      void runWhatsappLookup(normalizedWhatsappDigits);
    }, delayMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    step,
    confirmation,
    normalizedWhatsappDigits,
    selectedClientId,
    recognizedWhatsappDigits,
  ]);

  const selectedServices = useMemo(
    () =>
      servicesCatalog
        .filter((service) => selectedServiceIds.includes(service.id))
        .map((service) => {
          if (
            !isDuda &&
            LAIS_LASH_TYPE_SERVICE_IDS.includes(service.id) &&
            serviceAttendanceTypes[service.id]
          ) {
            return {
              ...service,
              name: `${service.name} — ${serviceAttendanceTypes[service.id]}`,
            };
          }
          return service;
        }),
    [servicesCatalog, selectedServiceIds, isDuda, serviceAttendanceTypes],
  );

  const selectedLashServicesNeedingType = useMemo(
    () =>
      isDuda
        ? []
        : servicesCatalog.filter(
            (service) =>
              selectedServiceIds.includes(service.id) &&
              LAIS_LASH_TYPE_SERVICE_IDS.includes(service.id),
          ),
    [isDuda, servicesCatalog, selectedServiceIds],
  );

  const selectedReturnMeta = useMemo(
    () => returnOptions.find((opt) => opt.value === returnOption) ?? null,
    [returnOptions, returnOption],
  );

  const calculatedReturnDate = useMemo(() => {
    if (!selectedReturnMeta || selectedReturnMeta.days === null) return null;
    return calculateReturnDateISO(serviceDate, selectedReturnMeta.days);
  }, [selectedReturnMeta, serviceDate]);

  const wasAdjustedFromSunday = useMemo(() => {
    if (!selectedReturnMeta || selectedReturnMeta.days === null) return false;
    return (
      calculateReturnDateISO(serviceDate, selectedReturnMeta.days) !==
      addDaysToISO(serviceDate, selectedReturnMeta.days)
    );
  }, [selectedReturnMeta, serviceDate]);

  const effectiveReturnDate = useMemo(() => {
    if (returnOption === 'specific_date') {
      return specificReturnDate || null;
    }
    return calculatedReturnDate;
  }, [returnOption, specificReturnDate, calculatedReturnDate]);

  const preferredTimesPayload = useMemo(() => {
    if (!effectiveReturnDate) return [];
    return [
      ...(preferredPeriod ? [preferredPeriod] : []),
      ...selectedPreferredHours.slice(0, 3),
    ];
  }, [effectiveReturnDate, preferredPeriod, selectedPreferredHours]);

  const preferredTimesSummary = useMemo(
    () => formatPreferredScheduleSummary(preferredTimesPayload),
    [preferredTimesPayload],
  );

  const availableHourSlots = useMemo(
    () => RETURN_HOUR_OPTIONS_BY_PERIOD[preferredPeriod ?? 'Qualquer período'],
    [preferredPeriod],
  );

  const selectedExtraReturnServices = useMemo<ExtraReturnService[]>(
    () =>
      extraReturnServiceIds
        .map((id) => findStudioServiceById(id))
        .filter((item): item is ExtraReturnService => item !== null),
    [extraReturnServiceIds],
  );

  const hasJointReturnBooking = useMemo(
    () =>
      wantsToScheduleReturn === 'yes' &&
      selectedExtraReturnServices.some(
        (svc) => svc.professional !== professional,
      ),
    [wantsToScheduleReturn, selectedExtraReturnServices, professional],
  );

  function toggleExtraReturnService(serviceId: string) {
    setErrorMessage('');
    setExtraReturnServiceIds((prev) =>
      prev.includes(serviceId)
        ? prev.filter((id) => id !== serviceId)
        : [...prev, serviceId],
    );
  }

  function toggleService(serviceId: string) {
    setErrorMessage('');
    setSelectedServiceIds((prev) => {
      if (prev.includes(serviceId)) {
        setServiceAttendanceTypes((types) => {
          if (!(serviceId in types)) return types;
          const next = { ...types };
          delete next[serviceId];
          return next;
        });
        return prev.filter((id) => id !== serviceId);
      }
      return [...prev, serviceId];
    });
  }

  function handleSelectAttendanceType(
    serviceId: string,
    type: LashAttendanceType,
  ) {
    setErrorMessage('');
    setServiceAttendanceTypes((prev) => ({
      ...prev,
      [serviceId]: type,
    }));
  }

  function handleSelectHasAdditionals(answer: 'yes' | 'no') {
    setErrorMessage('');
    setHasAdditionals(answer);
    if (answer === 'no') {
      setSelectedAdditionals([]);
    }
  }

  function toggleAdditional(label: string) {
    setErrorMessage('');
    setSelectedAdditionals((prev) =>
      prev.includes(label)
        ? prev.filter((item) => item !== label)
        : [...prev, label],
    );
  }

  function handleSelectWantsReturn(answer: 'yes' | 'no') {
    setErrorMessage('');
    setWantsToScheduleReturn(answer);
    if (answer === 'no') {
      setReturnOption('no_schedule');
      setSpecificReturnDate('');
      setPreferredPeriod(null);
      setSelectedPreferredHours([]);
      setShowExtraProceduresPicker(false);
      setExtraReturnServiceIds([]);
    } else if (returnOption === 'no_schedule') {
      setReturnOption(null);
    }
  }

  function handleSelectReturnOption(option: ReturnOption) {
    setErrorMessage('');
    setReturnOption(option);
    if (option === 'to_arrange' || option === 'no_schedule') {
      setSpecificReturnDate('');
      setPreferredPeriod(null);
      setSelectedPreferredHours([]);
    }
  }

  function handleSelectSpecificDate(isoDate: string) {
    setErrorMessage('');
    setSpecificReturnDate(isoDate);
  }

  function handleSelectPreferredPeriod(period: ReturnPeriod) {
    setErrorMessage('');
    setPreferredPeriod(period);
  }

  function togglePreferredHour(hour: string) {
    setErrorMessage('');
    setSelectedPreferredHours((prev) => {
      if (prev.includes(hour)) {
        return prev.filter((item) => item !== hour);
      }
      if (prev.length >= 3) {
        return prev;
      }
      return [...prev, hour];
    });
  }

  function handleWhatsappStep1Change(rawValue: string) {
    setWhatsapp(formatBrazilPhone(rawValue));
    setErrorMessage('');
    setSelectedClientId(null);
    setDisambiguatedClientId(null);
    setRecognizedWhatsappDigits('');
    setForceNewNameSamePhone(false);
    setMatchedClients([]);
    setLookupStatus('idle');
    setLookupError('');
  }

  function handleConfirmRecognizedClient(client: PublicRecognizedClient) {
    setClientName(client.name);
    setSelectedClientId(client.id);
    setRecognizedWhatsappDigits(normalizedWhatsappDigits);
    setErrorMessage('');
    goToStep(2);
  }

  function handleRejectRecognizedClient() {
    lookupAbortRef.current?.abort();
    setSelectedClientId(null);
    setDisambiguatedClientId(null);
    setRecognizedWhatsappDigits('');
    setMatchedClients([]);
    setForceNewNameSamePhone(false);
    setLookupStatus('idle');
    setLookupError('');
    setClientName('');
    setErrorMessage('');
    window.setTimeout(() => {
      whatsappInputRef.current?.focus();
      whatsappInputRef.current?.select();
    }, 0);
  }

  function handleUseSamePhoneNewPerson() {
    setSelectedClientId(null);
    setDisambiguatedClientId(null);
    setRecognizedWhatsappDigits('');
    setForceNewNameSamePhone(true);
    setClientName('');
    setErrorMessage('');
    window.setTimeout(() => {
      clientNameInputRef.current?.focus();
    }, 0);
  }

  function resetForm() {
    lookupAbortRef.current?.abort();
    setStep(1);
    setClientName('');
    setWhatsapp('');
    setSelectedClientId(null);
    setRecognizedWhatsappDigits('');
    setLookupStatus('idle');
    setLookupError('');
    setMatchedClients([]);
    setDisambiguatedClientId(null);
    setForceNewNameSamePhone(false);
    setTotalPaidInput('');
    setSelectedServiceIds([]);
    setServiceAttendanceTypes({});
    setHasAdditionals(null);
    setSelectedAdditionals([]);
    setWantsToScheduleReturn(null);
    setReturnOption(null);
    setSpecificReturnDate('');
    setPreferredPeriod(null);
    setSelectedPreferredHours([]);
    setShowExtraProceduresPicker(false);
    setExtraReturnServiceIds([]);
    setErrorMessage('');
    setConfirmation(null);
    setIdempotencyKey(generateIdempotencyKey());
    submittingRef.current = false;
  }

  function goToStep(nextStep: FormStep) {
    setErrorMessage('');
    setStep(nextStep);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleHeaderBack() {
    if (step > 1) {
      goToStep((step - 1) as FormStep);
    } else {
      onBack();
    }
  }

  function validateStep1(): boolean {
    if (normalizedWhatsappDigits.length < 10 || normalizedWhatsappDigits.length > 11) {
      setErrorMessage(
        'Por favor, informe um número de WhatsApp válido com DDD.',
      );
      return false;
    }
    if (lookupStatus === 'error') {
      setErrorMessage(
        'Não foi possível verificar o WhatsApp no banco de dados. Toque em "Tentar novamente".',
      );
      return false;
    }
    if (
      lookupStatus === 'found' &&
      !forceNewNameSamePhone &&
      !selectedClientId
    ) {
      setErrorMessage(
        'Confirme seu cadastro acima ou toque em "Não sou" para continuar.',
      );
      return false;
    }
    if (clientName.trim().length < 2) {
      setErrorMessage('Por favor, informe seu nome completo.');
      return false;
    }
    return true;
  }

  function validateStep2(): boolean {
    if (selectedServiceIds.length === 0) {
      setErrorMessage('Por favor, selecione pelo menos um serviço realizado.');
      return false;
    }
    for (const lashService of selectedLashServicesNeedingType) {
      if (!serviceAttendanceTypes[lashService.id]) {
        setErrorMessage(
          `Selecione Aplicação ou Manutenção para ${lashService.name}.`,
        );
        return false;
      }
    }
    if (isDuda && hasAdditionals === null) {
      setErrorMessage('Por favor, informe se teve algum adicional.');
      return false;
    }
    if (isDuda && hasAdditionals === 'yes' && selectedAdditionals.length === 0) {
      setErrorMessage(
        'Por favor, selecione o adicional ou marque "Não".',
      );
      return false;
    }
    const totalPaid = parseCurrencyInput(totalPaidInput);
    if (totalPaid <= 0) {
      setErrorMessage(
        'Por favor, informe o valor total pago, incluindo sinal e adicionais.',
      );
      return false;
    }
    return true;
  }

  function validateStep3(): boolean {
    if (wantsToScheduleReturn === null) {
      setErrorMessage(
        isDuda
          ? 'Por favor, informe se deseja agendar sua próxima manutenção.'
          : 'Por favor, informe se deseja agendar o seu retorno.',
      );
      return false;
    }
    if (
      wantsToScheduleReturn === 'yes' &&
      (!returnOption || returnOption === 'no_schedule')
    ) {
      setErrorMessage(
        'Por favor, selecione uma opção para o próximo retorno.',
      );
      return false;
    }
    if (
      wantsToScheduleReturn === 'yes' &&
      returnOption === 'specific_date' &&
      (!specificReturnDate || specificReturnDate < brazilToday)
    ) {
      setErrorMessage(
        'Por favor, selecione no calendário uma data futura para o seu retorno.',
      );
      return false;
    }
    if (wantsToScheduleReturn === 'yes' && effectiveReturnDate && !preferredPeriod) {
      setErrorMessage(
        'Por favor, selecione o período de preferência (ou toque em "Qualquer período").',
      );
      return false;
    }
    return true;
  }

  async function handleNextFromStep() {
    if (step === 1) {
      if (
        normalizedWhatsappDigits.length < 10 ||
        normalizedWhatsappDigits.length > 11
      ) {
        setErrorMessage(
          'Por favor, informe um número de WhatsApp válido com DDD.',
        );
        return;
      }
      if (lookupStatus === 'idle' || lookupStatus === 'loading') {
        await runWhatsappLookup(normalizedWhatsappDigits);
        return;
      }
      if (validateStep1()) goToStep(2);
      return;
    }
    if (step === 2) {
      if (validateStep2()) goToStep(3);
      return;
    }
    if (step === 3) {
      if (validateStep3()) goToStep(4);
    }
  }

  async function handleFormSubmit(e: FormEvent) {
    e.preventDefault();

    if (step < 4) {
      handleNextFromStep();
      return;
    }

    if (submittingRef.current || submitting) {
      return;
    }

    setErrorMessage('');

    if (!validateStep1() || !validateStep2() || !validateStep3() || !returnOption) {
      return;
    }

    const totalPaid = parseCurrencyInput(totalPaidInput);
    submittingRef.current = true;
    setSubmitting(true);

    try {
      const effectiveClientId =
        selectedClientId && recognizedWhatsappDigits === normalizedWhatsappDigits
          ? selectedClientId
          : null;
      const result = await submitAttendance({
        clientId: effectiveClientId,
        professional,
        clientName: clientName.trim(),
        whatsapp,
        totalPaid,
        serviceIds: selectedServiceIds,
        serviceAttendanceTypes: !isDuda ? serviceAttendanceTypes : undefined,
        additionals: isDuda ? selectedAdditionals : [],
        extraReturnServiceIds:
          returnOption === 'no_schedule' ? [] : extraReturnServiceIds,
        returnOption,
        returnDate:
          returnOption === 'specific_date' ? specificReturnDate : undefined,
        preferredTimes: preferredTimesPayload,
        serviceDate,
        idempotencyKey,
      });
      setConfirmation(result);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      submittingRef.current = false;
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Não foi possível confirmar seu atendimento.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (confirmation) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="border-b border-border bg-surface">
          <div className="max-w-2xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
            <span className="font-display text-2xl font-bold text-brand-strong whitespace-nowrap">
              MAIS CÍLIOS
            </span>
            <button
              type="button"
              onClick={onBack}
              className="min-h-[44px] px-3 text-sm font-medium rounded-xl transition-colors btn-ghost whitespace-nowrap"
            >
              Início
            </button>
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
          <div className="w-full max-w-lg bg-surface border border-border rounded-3xl p-7 sm:p-9 text-center shadow-card">
            <div className="w-14 h-14 mx-auto rounded-full bg-success-soft border border-success-border flex items-center justify-center text-success">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <h1 className="mt-4 font-display text-3xl font-semibold text-brand-strong [text-wrap:balance]">
              Atendimento confirmado!
            </h1>
            <p className="mt-2 text-sm sm:text-base text-text-secondary">
              Obrigada,{' '}
              <strong className="font-semibold text-text-primary">
                {confirmation.clientName}
              </strong>
              . Suas informações com{' '}
              <strong className="font-semibold text-text-primary">
                {professionalName}
              </strong>{' '}
              foram registradas com sucesso.
            </p>

            <div className="mt-6 p-4 rounded-2xl bg-background border border-border text-left space-y-2.5 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-text-secondary">Data e hora do registro</span>
                <span className="font-medium text-text-primary tabular-nums">
                  {formatDateBR(confirmation.serviceDate)}
                  {confirmation.createdAt
                    ? ` às ${formatBrazilTimeBR(confirmation.createdAt)}`
                    : ''}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-text-secondary">Próxima manutenção</span>
                <span className="font-medium text-text-primary">
                  {getReturnOptionLabel(
                    confirmation.returnOption,
                    confirmation.professional,
                  )}
                </span>
              </div>
              {confirmation.returnDate && (
                <div className="flex justify-between gap-3">
                  <span className="text-text-secondary">
                    {confirmation.returnOption === 'specific_date'
                      ? 'Data escolhida'
                      : 'Data prevista'}
                  </span>
                  <span className="font-semibold text-brand-strong tabular-nums">
                    {formatDateBR(confirmation.returnDate)}
                  </span>
                </div>
              )}
              {confirmation.preferredTimes.length > 0 && (
                <div className="flex justify-between gap-3">
                  <span className="text-text-secondary">
                    Período e horários
                  </span>
                  <span className="font-medium text-text-primary text-right tabular-nums">
                    {formatPreferredScheduleSummary(confirmation.preferredTimes) ??
                      confirmation.preferredTimes.join(' · ')}
                  </span>
                </div>
              )}
              {confirmation.extraReturnServices &&
                confirmation.extraReturnServices.length > 0 && (
                  <div className="flex flex-col gap-1 pt-1 border-t border-border">
                    <span className="text-text-secondary">
                      Outros procedimentos no retorno
                    </span>
                    <span className="font-medium text-text-primary">
                      {confirmation.extraReturnServices
                        .map(
                          (svc) =>
                            `${svc.name} (${svc.professional === 'lais' ? 'Laís' : 'Duda'})`,
                        )
                        .join(' · ')}
                    </span>
                  </div>
                )}
            </div>

            {confirmation.returnOption !== 'no_schedule' && (
              <p className="mt-4 text-xs sm:text-sm text-text-secondary">
                {confirmation.extraReturnServices?.some(
                  (svc) => svc.professional !== confirmation.professional,
                )
                  ? 'Laís e Duda receberão sua solicitação conjunta com a data desejada para que cada uma combine e confirme seu próprio horário com você pelo WhatsApp.'
                  : `${professionalName} verificará a disponibilidade na agenda e confirmará o horário com você pelo WhatsApp.`}
              </p>
            )}

            <div className="mt-7 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={resetForm}
                className="min-h-[50px] px-5 py-3 rounded-2xl text-sm sm:text-base font-semibold transition-colors btn-primary"
              >
                Novo atendimento
              </button>
              <button
                type="button"
                onClick={onBack}
                className="min-h-[50px] px-5 py-3 rounded-2xl text-sm sm:text-base font-semibold transition-colors btn-secondary"
              >
                Voltar à tela inicial
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-10 flex flex-col">
      <header className="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur-sm">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={handleHeaderBack}
            className="min-h-[44px] px-2.5 -ml-2 inline-flex items-center gap-1.5 text-sm font-medium rounded-xl transition-colors btn-ghost whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Voltar</span>
          </button>
          <span className="font-display text-xl font-bold text-brand-strong whitespace-nowrap shrink-0">
            MAIS CÍLIOS
          </span>
          <div className="w-16" aria-hidden="true" />
        </div>
      </header>

      <main className="flex-1 w-full max-w-2xl mx-auto px-4 sm:px-6 pt-5 sm:pt-8">
        <div className="bg-surface border border-border rounded-3xl p-5 sm:p-8 shadow-card">
          {/* Barra discreta de progresso */}
          <div className="pb-5 border-b border-border">
            <div className="flex items-center justify-between gap-3 text-xs sm:text-sm">
              <span className="font-semibold text-brand-strong">
                Etapa {step} de 4 · {STEP_TITLES[step]}
              </span>
              <span className="text-text-secondary tabular-nums whitespace-nowrap">
                {professionalName} · {formatDateBR(serviceDate)}
              </span>
            </div>
            <div
              className="mt-2.5 h-1.5 w-full rounded-full bg-brand-soft overflow-hidden"
              role="progressbar"
              aria-valuenow={step}
              aria-valuemin={1}
              aria-valuemax={4}
              aria-label={`Etapa ${step} de 4: ${STEP_TITLES[step]}`}
            >
              <div
                className={`h-full rounded-full bg-brand transition-all duration-200 ${PROGRESS_WIDTH_CLASS[step]}`}
              />
            </div>
          </div>

          <form onSubmit={handleFormSubmit} className="mt-6 space-y-6" noValidate>
            {/* ETAPA 1 — Dados da cliente */}
            {step === 1 && (
              <section className="space-y-5">
                <div>
                  <h1 className="font-display text-3xl sm:text-4xl font-semibold text-brand-strong [text-wrap:balance]">
                    Dados da cliente
                  </h1>
                  <p className="mt-1 text-sm sm:text-base text-text-secondary">
                    Atendimento com{' '}
                    <strong className="font-semibold text-text-primary">
                      {professionalName}
                    </strong>
                    . Informe seu WhatsApp para começar.
                  </p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label
                      className="block text-sm font-medium text-text-secondary mb-1.5"
                      htmlFor="attendanceform-field-2"
                    >
                      WhatsApp{' '}
                      <span className="font-semibold text-red-600">
                        (obrigatório)
                      </span>
                    </label>
                    <div className="relative">
                      <input
                        id="attendanceform-field-2"
                        ref={whatsappInputRef}
                        type="tel"
                        inputMode="numeric"
                        autoComplete="tel"
                        required
                        value={whatsapp}
                        onChange={(e) =>
                          handleWhatsappStep1Change(e.target.value)
                        }
                        placeholder="(00) 00000-0000"
                        className="w-full min-h-[50px] px-4 py-2.5 pr-11 border rounded-2xl tabular-nums field-control text-base"
                      />
                      {lookupStatus === 'loading' && (
                        <Loader2
                          className="w-5 h-5 text-brand-strong animate-spin absolute right-3.5 top-1/2 -translate-y-1/2"
                          aria-hidden="true"
                        />
                      )}
                    </div>
                    {lookupStatus === 'loading' && (
                      <p className="mt-1.5 text-xs sm:text-sm text-text-secondary">
                        Buscando seu cadastro...
                      </p>
                    )}
                  </div>

                  {/* Cliente única encontrada */}
                  {lookupStatus === 'found' &&
                    !forceNewNameSamePhone &&
                    matchedClients.length === 1 && (
                      <div className="p-5 sm:p-6 rounded-2xl bg-brand-soft border-2 border-brand/45 shadow-sm text-center space-y-4">
                        <div className="space-y-1.5">
                          <h2 className="font-display text-2xl sm:text-3xl font-semibold text-brand-strong [text-wrap:balance]">
                            Bem-vinda de volta, {matchedClients[0].name}! 🩷
                          </h2>
                          <p className="text-sm sm:text-base text-text-secondary">
                            Que bom ter você aqui novamente!
                          </p>
                        </div>

                        <div className="space-y-2.5 pt-1">
                          <button
                            type="button"
                            onClick={() =>
                              handleConfirmRecognizedClient(matchedClients[0])
                            }
                            className="w-full min-h-[52px] px-6 py-3 rounded-2xl text-base font-semibold transition-colors shadow-sm btn-primary inline-flex items-center justify-center gap-2"
                          >
                            <span>Continuar</span>
                            <ArrowRight className="w-5 h-5" />
                          </button>

                          <div className="flex flex-col items-center gap-1 pt-0.5">
                            <button
                              type="button"
                              onClick={handleRejectRecognizedClient}
                              className="text-xs sm:text-sm font-medium text-text-secondary hover:text-brand-strong underline-offset-4 hover:underline transition-colors py-1"
                            >
                              Não sou {matchedClients[0].name}
                            </button>
                            <button
                              type="button"
                              onClick={handleUseSamePhoneNewPerson}
                              className="text-xs text-text-secondary/80 hover:text-brand-strong underline-offset-4 hover:underline transition-colors py-0.5"
                            >
                              Compartilho este WhatsApp com outra pessoa
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                  {/* Mais de uma cliente cadastrada com o mesmo WhatsApp */}
                  {lookupStatus === 'found' &&
                    !forceNewNameSamePhone &&
                    matchedClients.length >= 2 && (
                      <div className="p-5 sm:p-6 rounded-2xl bg-brand-soft border-2 border-brand/45 shadow-sm text-center space-y-4">
                        <div className="space-y-1.5">
                          <h2 className="font-display text-2xl sm:text-3xl font-semibold text-brand-strong [text-wrap:balance]">
                            Bem-vinda de volta! 🩷
                          </h2>
                          <p className="text-sm sm:text-base text-text-secondary">
                            Encontramos mais de um cadastro neste WhatsApp. Quem
                            está sendo atendida hoje?
                          </p>
                        </div>

                        <div className="space-y-2 text-left">
                          {matchedClients.map((client) => {
                            const selected =
                              disambiguatedClientId === client.id;
                            return (
                              <button
                                key={client.id}
                                type="button"
                                onClick={() => {
                                  setDisambiguatedClientId(client.id);
                                  setErrorMessage('');
                                }}
                                aria-pressed={selected}
                                className={`w-full min-h-[50px] px-4 py-3 rounded-2xl border text-base font-semibold flex items-center justify-between gap-3 transition-colors ${
                                  selected ? 'choice-selected' : 'choice-idle'
                                }`}
                              >
                                <span>{client.name}</span>
                                <span
                                  className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                                    selected
                                      ? 'border-brand-strong bg-surface'
                                      : 'border-placeholder bg-surface'
                                  }`}
                                >
                                  {selected && (
                                    <span className="w-2 h-2 rounded-full bg-brand-strong" />
                                  )}
                                </span>
                              </button>
                            );
                          })}
                        </div>

                        {(() => {
                          const chosen = matchedClients.find(
                            (c) => c.id === disambiguatedClientId,
                          );
                          return (
                            <div className="space-y-2.5 pt-1">
                              {chosen && (
                                <p className="text-sm font-medium text-brand-strong">
                                  Que bom ter você aqui novamente, {chosen.name}! 🩷
                                </p>
                              )}
                              <button
                                type="button"
                                disabled={!chosen}
                                onClick={() =>
                                  chosen && handleConfirmRecognizedClient(chosen)
                                }
                                className="w-full min-h-[52px] px-6 py-3 rounded-2xl text-base font-semibold transition-colors shadow-sm btn-primary disabled:opacity-50 inline-flex items-center justify-center gap-2"
                              >
                                <span>Continuar</span>
                                <ArrowRight className="w-5 h-5" />
                              </button>

                              <div className="flex flex-col items-center gap-1 pt-0.5">
                                <button
                                  type="button"
                                  onClick={handleUseSamePhoneNewPerson}
                                  className="text-xs sm:text-sm font-medium text-text-secondary hover:text-brand-strong underline-offset-4 hover:underline transition-colors py-1"
                                >
                                  Não está na lista? Cadastrar novo nome
                                </button>
                                <button
                                  type="button"
                                  onClick={handleRejectRecognizedClient}
                                  className="text-xs text-text-secondary/80 hover:text-brand-strong underline-offset-4 hover:underline transition-colors py-0.5"
                                >
                                  Corrigir número de WhatsApp
                                </button>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}

                  {/* Falha ao consultar banco de dados */}
                  {lookupStatus === 'error' && (
                    <div className="p-4 sm:p-5 rounded-2xl bg-error-soft border border-error-border text-center space-y-3">
                      <p className="text-sm font-medium text-error">
                        {lookupError ||
                          'Não foi possível consultar seu cadastro no banco de dados.'}
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          void runWhatsappLookup(normalizedWhatsappDigits)
                        }
                        className="min-h-[44px] px-5 py-2.5 rounded-2xl text-sm font-semibold btn-secondary inline-flex items-center justify-center gap-2"
                      >
                        <RefreshCw className="w-4 h-4" />
                        <span>Tentar novamente</span>
                      </button>
                    </div>
                  )}

                  {/* Cliente nova ou outro nome no mesmo WhatsApp */}
                  {(lookupStatus === 'not_found' || forceNewNameSamePhone) && (
                    <div className="p-4 sm:p-5 rounded-2xl bg-brand-soft/60 border border-border space-y-3">
                      <p className="text-xs sm:text-sm font-medium text-brand-strong">
                        {forceNewNameSamePhone
                          ? 'Informe seu nome completo para criar um cadastro separado neste WhatsApp.'
                          : 'Ainda não encontramos seu cadastro. Informe seu nome completo para continuar.'}
                      </p>
                      <div>
                        <label
                          className="block text-sm font-medium text-text-secondary mb-1.5"
                          htmlFor="attendanceform-field-1"
                        >
                          Nome completo{' '}
                          <span className="font-semibold text-red-600">
                            (obrigatório)
                          </span>
                        </label>
                        <input
                          id="attendanceform-field-1"
                          ref={clientNameInputRef}
                          type="text"
                          required
                          autoComplete="name"
                          value={clientName}
                          onChange={(e) => {
                            setClientName(e.target.value);
                            setErrorMessage('');
                          }}
                          placeholder="Digite seu nome completo"
                          className="w-full min-h-[50px] px-4 py-2.5 border rounded-2xl field-control text-base"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* ETAPA 2 — Atendimento realizado */}
            {step === 2 && (
              <section className="space-y-5">
                <div>
                  <h1 className="font-display text-3xl sm:text-4xl font-semibold text-brand-strong [text-wrap:balance]">
                    Atendimento realizado
                  </h1>
                  <p className="mt-1 text-sm sm:text-base text-text-secondary leading-relaxed">
                    {isDuda
                      ? `Selecione um ou mais serviços realizados com ${professionalName}.`
                      : 'Quais procedimentos você realizou?'}
                  </p>
                </div>

                <div className="space-y-3">
                  <p className="text-xs sm:text-sm text-text-secondary leading-relaxed">
                    Os valores exibidos ao lado são apenas informativos.
                  </p>

                  <div
                    className={
                      isDuda
                        ? 'grid grid-cols-1 sm:grid-cols-2 gap-2.5'
                        : 'space-y-2.5'
                    }
                  >
                    {servicesCatalog.map((service) => {
                      const selected = selectedServiceIds.includes(service.id);
                      const needsType =
                        !isDuda &&
                        LAIS_LASH_TYPE_SERVICE_IDS.includes(service.id);
                      const chosenType =
                        serviceAttendanceTypes[service.id] ?? null;

                      return (
                        <div key={service.id} className="space-y-2">
                          <button
                            type="button"
                            onClick={() => toggleService(service.id)}
                            aria-pressed={selected}
                            className={`w-full min-h-[52px] px-4 py-3 rounded-2xl border text-left flex items-center justify-between gap-3 transition-colors ${
                              selected ? 'choice-selected' : 'choice-idle'
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <span
                                className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                                  selected
                                    ? 'bg-brand-strong border-brand text-surface'
                                    : 'bg-surface border-border'
                                }`}
                              >
                                {selected && <Check className="w-3.5 h-3.5" />}
                              </span>
                              <span className="text-base font-medium leading-tight">
                                {service.name}
                              </span>
                            </div>
                            <span className="text-xs sm:text-sm font-semibold tabular-nums shrink-0 text-text-secondary">
                              {formatBRL(service.price)}
                            </span>
                          </button>

                          {needsType && selected && (
                            <div className="ml-2 sm:ml-4 p-3.5 rounded-2xl bg-brand-soft border border-border space-y-2.5">
                              <p className="text-sm font-semibold text-text-primary">
                                Qual tipo de atendimento?
                              </p>
                              <div className="grid grid-cols-2 gap-2.5">
                                {(['Aplicação', 'Manutenção'] as const).map(
                                  (typeOption) => {
                                    const active = chosenType === typeOption;
                                    return (
                                      <button
                                        key={typeOption}
                                        type="button"
                                        onClick={() =>
                                          handleSelectAttendanceType(
                                            service.id,
                                            typeOption,
                                          )
                                        }
                                        aria-pressed={active}
                                        className={`min-h-[46px] px-3.5 py-2 rounded-2xl border text-base font-medium flex items-center justify-center gap-2.5 transition-colors ${
                                          active
                                            ? 'choice-selected'
                                            : 'choice-idle'
                                        }`}
                                      >
                                        <span
                                          className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                                            active
                                              ? 'border-brand-strong bg-surface'
                                              : 'border-placeholder bg-surface'
                                          }`}
                                        >
                                          {active && (
                                            <span className="w-2 h-2 rounded-full bg-brand-strong" />
                                          )}
                                        </span>
                                        <span>{typeOption}</span>
                                      </button>
                                    );
                                  },
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {isDuda && (
                  <div className="rounded-2xl bg-brand-soft border-2 border-brand/45 p-4 sm:p-5 space-y-3 shadow-sm">
                    <p className="text-base font-semibold text-brand-strong">
                      Teve algum adicional?
                    </p>
                    <div className="grid grid-cols-2 gap-2.5">
                      {(
                        [
                          { id: 'yes', label: 'Sim' },
                          { id: 'no', label: 'Não' },
                        ] as const
                      ).map((opt) => {
                        const active = hasAdditionals === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => handleSelectHasAdditionals(opt.id)}
                            aria-pressed={active}
                            className={`min-h-[48px] px-4 py-2.5 rounded-2xl border text-base font-medium flex items-center justify-center gap-2.5 transition-colors ${
                              active ? 'choice-selected' : 'choice-idle'
                            }`}
                          >
                            <span
                              className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                                active
                                  ? 'border-brand-strong bg-surface'
                                  : 'border-placeholder bg-surface'
                              }`}
                            >
                              {active && (
                                <span className="w-2 h-2 rounded-full bg-brand-strong" />
                              )}
                            </span>
                            <span>{opt.label}</span>
                          </button>
                        );
                      })}
                    </div>

                    {hasAdditionals === 'yes' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                        {DUDA_ADDITIONALS.map((item) => {
                          const checked = selectedAdditionals.includes(item);
                          return (
                            <button
                              key={item}
                              type="button"
                              onClick={() => toggleAdditional(item)}
                              aria-pressed={checked}
                              className={`min-h-[50px] px-4 py-3 rounded-2xl border inline-flex items-center gap-3 text-left text-base transition-colors ${
                                checked
                                  ? 'choice-selected font-medium'
                                  : 'choice-idle'
                              }`}
                            >
                              <span
                                className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                                  checked
                                    ? 'bg-brand-strong border-brand text-surface'
                                    : 'bg-surface border-border'
                                }`}
                              >
                                {checked && <Check className="w-3.5 h-3.5" />}
                              </span>
                              <span>{item}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                <div className="pt-5 border-t border-border space-y-2">
                  <label
                    className="block text-base font-semibold text-text-primary"
                    htmlFor="attendanceform-field-3"
                  >
                    Valor total pago{' '}
                    <span className="font-semibold text-red-600">
                      (obrigatório)
                    </span>
                  </label>
                  <p className="text-xs sm:text-sm text-text-secondary">
                    Digite o valor total que você pagou, incluindo sinal e
                    quaisquer adicionais.
                  </p>
                  <div className="relative max-w-xs pt-1">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 pt-0.5 text-base font-bold text-brand-strong">
                      R$
                    </span>
                    <input
                      id="attendanceform-field-3"
                      type="text"
                      inputMode="decimal"
                      required
                      value={totalPaidInput}
                      onChange={(e) => {
                        setTotalPaidInput(
                          e.target.value.replace(/[^\d.,]/g, ''),
                        );
                        setErrorMessage('');
                      }}
                      placeholder="0,00"
                      className="w-full min-h-[52px] pl-12 pr-4 py-2.5 text-lg font-bold border rounded-2xl tabular-nums field-control"
                    />
                  </div>
                </div>
              </section>
            )}

            {/* ETAPA 3 — Próximo retorno */}
            {step === 3 && (
              <section className="space-y-4">
                <div>
                  <h1 className="font-display text-3xl sm:text-4xl font-semibold text-brand-strong [text-wrap:balance]">
                    Próximo retorno
                  </h1>
                  <p className="mt-1 text-sm sm:text-base font-medium text-text-secondary leading-relaxed">
                    {isDuda
                      ? 'Deseja agendar sua próxima manutenção?'
                      : 'Deseja agendar o seu retorno?'}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  {(
                    [
                      { id: 'yes', label: 'Sim' },
                      { id: 'no', label: 'Não' },
                    ] as const
                  ).map((opt) => {
                    const active = wantsToScheduleReturn === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => handleSelectWantsReturn(opt.id)}
                        aria-pressed={active}
                        className={`min-h-[52px] px-4 py-3 rounded-2xl border text-base font-semibold flex items-center justify-center gap-2.5 transition-colors ${
                          active ? 'choice-selected' : 'choice-idle'
                        }`}
                      >
                        <span
                          className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                            active
                              ? 'border-brand-strong bg-surface'
                              : 'border-placeholder bg-surface'
                          }`}
                        >
                          {active && (
                            <span className="w-2 h-2 rounded-full bg-brand-strong" />
                          )}
                        </span>
                        <span>{opt.label}</span>
                      </button>
                    );
                  })}
                </div>

                {wantsToScheduleReturn === 'yes' && (
                  <div className="space-y-3.5 pt-1">
                    <p className="text-sm sm:text-base font-semibold text-text-primary">
                      Quando deseja fazer sua próxima manutenção?
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {returnOptions
                        .filter((opt) => opt.value !== 'no_schedule')
                        .map((opt) => {
                          const active = returnOption === opt.value;
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => handleSelectReturnOption(opt.value)}
                              aria-pressed={active}
                              className={`min-h-[52px] px-4 py-3 rounded-2xl border text-left text-base font-medium flex items-center gap-3 transition-colors ${
                                active ? 'choice-selected' : 'choice-idle'
                              }`}
                            >
                              <span
                                className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                                  active
                                    ? 'border-brand-strong bg-surface'
                                    : 'border-placeholder bg-surface'
                                }`}
                              >
                                {active && (
                                  <span className="w-2 h-2 rounded-full bg-brand-strong" />
                                )}
                              </span>
                              <span>{opt.label}</span>
                            </button>
                          );
                        })}
                    </div>

                    {calculatedReturnDate && (
                      <div className="p-4 sm:p-5 rounded-2xl bg-brand-soft border-2 border-brand/45 shadow-sm space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                          <div className="flex items-center gap-2 text-brand-strong">
                            <Calendar className="w-5 h-5 shrink-0" />
                            <span className="text-sm sm:text-base font-semibold">
                              Data prevista ({selectedReturnMeta?.days} dias):
                            </span>
                          </div>
                          <div className="sm:text-right">
                            <div className="text-2xl sm:text-3xl font-bold tracking-tight text-brand-strong tabular-nums">
                              {formatDateBR(calculatedReturnDate)}
                            </div>
                            {wasAdjustedFromSunday && (
                              <p className="text-xs font-medium text-brand-strong/80 mt-0.5">
                                Antecipado para sábado (domingo)
                              </p>
                            )}
                          </div>
                        </div>

                        <p className="pt-3 border-t border-border/80 text-sm sm:text-base font-medium text-brand-strong leading-relaxed">
                          {isDuda
                            ? 'A Duda consultará a disponibilidade para o dia escolhido e entrará em contato para definir o melhor horário. 🩷'
                            : 'A Laís consultará a disponibilidade para o dia escolhido e entrará em contato pelo WhatsApp para definir o melhor horário. 🩷'}
                        </p>
                      </div>
                    )}

                    {returnOption === 'specific_date' && (
                      <div className="p-4 sm:p-5 rounded-2xl bg-brand-soft border-2 border-brand/45 shadow-sm space-y-3.5">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-brand-strong">
                            <Calendar className="w-5 h-5 shrink-0" />
                            <span className="text-sm sm:text-base font-semibold">
                              Escolha a data desejada no calendário
                            </span>
                          </div>
                          <p className="text-xs sm:text-sm text-text-secondary">
                            Selecione qualquer data futura disponível. A confirmação do horário será feita após combinar pelo WhatsApp.
                          </p>
                        </div>

                        <ReturnDateCalendar
                          value={specificReturnDate}
                          minDate={brazilToday}
                          onSelect={handleSelectSpecificDate}
                        />

                        {specificReturnDate && (
                          <div className="pt-3 border-t border-border/80 space-y-2">
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                              <span className="text-sm font-semibold text-brand-strong">
                                Data desejada escolhida:
                              </span>
                              <span className="text-2xl font-bold tracking-tight text-brand-strong tabular-nums">
                                {formatDateBR(specificReturnDate)}
                              </span>
                            </div>
                            <p className="text-sm font-medium text-brand-strong leading-relaxed">
                              {isDuda
                                ? 'A Duda consultará a disponibilidade para o dia escolhido e entrará em contato pelo WhatsApp para confirmar o melhor horário. 🩷'
                                : 'A Laís consultará a disponibilidade para o dia escolhido e entrará em contato pelo WhatsApp para confirmar o melhor horário. 🩷'}
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {effectiveReturnDate && (
                      <div className="p-4 sm:p-5 rounded-2xl bg-surface border-2 border-brand/35 shadow-sm space-y-4">
                        <div className="space-y-2.5">
                          <div className="flex items-center gap-2 text-brand-strong">
                            <Clock className="w-4 h-4 shrink-0" />
                            <p className="text-sm sm:text-base font-semibold">
                              Qual período você prefere?
                            </p>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {RETURN_PERIOD_OPTIONS.map((period) => {
                              const active = preferredPeriod === period;
                              return (
                                <button
                                  key={period}
                                  type="button"
                                  onClick={() => handleSelectPreferredPeriod(period)}
                                  aria-pressed={active}
                                  className={`min-h-[46px] px-3 py-2 rounded-2xl border text-sm font-semibold transition-colors flex items-center justify-center text-center ${
                                    active ? 'choice-selected' : 'choice-idle'
                                  }`}
                                >
                                  {period}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="space-y-2.5 pt-3 border-t border-border">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="text-sm font-semibold text-text-primary">
                                Horários de preferência (opcional)
                              </p>
                              <p className="text-xs text-text-secondary">
                                Selecione até 3 horários de preferência para ajudar na organização da agenda.
                              </p>
                            </div>
                            <span className="text-xs font-bold text-brand-strong tabular-nums">
                              {selectedPreferredHours.length}/3 selecionados
                            </span>
                          </div>

                          {selectedPreferredHours.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {selectedPreferredHours.map((hour) => (
                                <button
                                  key={`picked-${hour}`}
                                  type="button"
                                  onClick={() => togglePreferredHour(hour)}
                                  className="min-h-[34px] px-3 py-1 rounded-xl bg-brand-soft border border-brand/50 text-xs sm:text-sm font-semibold text-brand-strong inline-flex items-center gap-1.5 tabular-nums hover:bg-brand/20 transition-colors"
                                >
                                  <span>{hour}</span>
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              ))}
                            </div>
                          )}

                          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                            {availableHourSlots.map((hour) => {
                              const active = selectedPreferredHours.includes(hour);
                              const disabled =
                                !active && selectedPreferredHours.length >= 3;
                              return (
                                <button
                                  key={hour}
                                  type="button"
                                  disabled={disabled}
                                  onClick={() => togglePreferredHour(hour)}
                                  aria-pressed={active}
                                  className={`min-h-[42px] px-2.5 py-2 rounded-xl border text-sm font-semibold tabular-nums transition-colors ${
                                    active
                                      ? 'choice-selected'
                                      : disabled
                                        ? 'bg-background border-border/60 text-text-secondary/40 cursor-not-allowed'
                                        : 'choice-idle'
                                  }`}
                                >
                                  {hour}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}

                    {returnOption === 'to_arrange' && (
                      <div className="p-4 sm:p-5 rounded-2xl bg-brand-soft border-2 border-brand/45 shadow-sm space-y-1.5">
                        <p className="text-base font-bold text-brand-strong">
                          Vamos combinar pelo WhatsApp! 🩷
                        </p>
                        <p className="text-sm sm:text-base text-text-primary leading-relaxed">
                          {isDuda
                            ? 'A Duda entrará em contato com você para escolher o melhor dia e horário para sua próxima manutenção.'
                            : 'A Laís entrará em contato com você para escolher o melhor dia e horário para o seu retorno.'}
                        </p>
                      </div>
                    )}

                    {returnOption && returnOption !== 'no_schedule' && (
                      <div className="space-y-3 pt-1">
                        <button
                          type="button"
                          onClick={() =>
                            setShowExtraProceduresPicker((open) => !open)
                          }
                          aria-expanded={showExtraProceduresPicker}
                          className="w-full min-h-[50px] px-4 py-3 rounded-2xl border-2 border-brand/55 bg-brand-soft text-brand-strong font-semibold text-sm sm:text-base inline-flex items-center justify-center gap-2 hover:bg-brand/15 transition-colors shadow-sm"
                        >
                          <Plus className="w-4 h-4 shrink-0" />
                          <span>+ Adicionar outro procedimento</span>
                          {selectedExtraReturnServices.length > 0 && (
                            <span className="text-xs font-bold tabular-nums opacity-85">
                              ({selectedExtraReturnServices.length})
                            </span>
                          )}
                        </button>

                        {selectedExtraReturnServices.length > 0 && (
                          <div className="p-3.5 rounded-2xl bg-brand-soft/60 border border-brand/35 space-y-2.5">
                            <p className="text-xs font-semibold uppercase tracking-wider text-brand-strong">
                              Procedimentos extras para o retorno
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {selectedExtraReturnServices.map((svc) => (
                                <button
                                  key={svc.id}
                                  type="button"
                                  onClick={() => toggleExtraReturnService(svc.id)}
                                  className="min-h-[38px] px-3 py-1.5 rounded-xl bg-surface border border-brand/45 text-xs sm:text-sm font-medium text-text-primary inline-flex items-center gap-2 hover:border-brand-strong transition-colors"
                                >
                                  <span>
                                    {svc.name} ·{' '}
                                    <strong className="text-brand-strong">
                                      {svc.professional === 'lais' ? 'Laís' : 'Duda'}
                                    </strong>
                                  </span>
                                  <X className="w-3.5 h-3.5 text-brand-strong shrink-0" />
                                </button>
                              ))}
                            </div>
                            {hasJointReturnBooking && (
                              <p className="text-xs font-medium text-brand-strong leading-relaxed">
                                Agendamento conjunto: a mesma data desejada será
                                encaminhada para a Laís e para a Duda, permitindo que
                                cada profissional combine e confirme seu próprio
                                horário com você pelo WhatsApp. 🩷
                              </p>
                            )}
                          </div>
                        )}

                        {showExtraProceduresPicker && (
                          <div className="p-4 sm:p-5 rounded-2xl bg-surface border-2 border-brand/35 space-y-4 shadow-sm">
                            <div className="flex items-center justify-between gap-2">
                              <div>
                                <p className="text-sm sm:text-base font-semibold text-brand-strong">
                                  Escolha outros procedimentos do estúdio (opcional)
                                </p>
                                <p className="text-xs text-text-secondary">
                                  Você pode adicionar ou remover serviços da Laís e da Duda.
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => setShowExtraProceduresPicker(false)}
                                aria-label="Fechar lista de procedimentos"
                                className="min-h-[36px] min-w-[36px] rounded-xl flex items-center justify-center btn-ghost shrink-0"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>

                            <div className="space-y-3">
                              <div className="space-y-2">
                                <p className="text-xs font-bold uppercase tracking-wider text-brand-strong">
                                  Laís · Cílios e Sobrancelhas
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  {LAIS_SERVICES.map((svc) => {
                                    const checked =
                                      extraReturnServiceIds.includes(svc.id);
                                    return (
                                      <button
                                        key={svc.id}
                                        type="button"
                                        onClick={() =>
                                          toggleExtraReturnService(svc.id)
                                        }
                                        aria-pressed={checked}
                                        className={`min-h-[46px] px-3.5 py-2.5 rounded-2xl border text-left flex items-center justify-between gap-2.5 transition-colors ${
                                          checked ? 'choice-selected' : 'choice-idle'
                                        }`}
                                      >
                                        <div className="flex items-center gap-2.5 min-w-0">
                                          <span
                                            className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                                              checked
                                                ? 'bg-brand-strong border-brand text-surface'
                                                : 'bg-surface border-border'
                                            }`}
                                          >
                                            {checked && <Check className="w-3 h-3" />}
                                          </span>
                                          <span className="text-sm font-medium leading-tight">
                                            {svc.name}
                                          </span>
                                        </div>
                                        <span className="text-xs text-text-secondary tabular-nums shrink-0">
                                          {formatBRL(svc.price)}
                                        </span>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>

                              <div className="space-y-2 pt-2 border-t border-border">
                                <p className="text-xs font-bold uppercase tracking-wider text-brand-strong">
                                  Duda · Unhas e Cuidados
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  {DUDA_SERVICES.map((svc) => {
                                    const checked =
                                      extraReturnServiceIds.includes(svc.id);
                                    return (
                                      <button
                                        key={svc.id}
                                        type="button"
                                        onClick={() =>
                                          toggleExtraReturnService(svc.id)
                                        }
                                        aria-pressed={checked}
                                        className={`min-h-[46px] px-3.5 py-2.5 rounded-2xl border text-left flex items-center justify-between gap-2.5 transition-colors ${
                                          checked ? 'choice-selected' : 'choice-idle'
                                        }`}
                                      >
                                        <div className="flex items-center gap-2.5 min-w-0">
                                          <span
                                            className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                                              checked
                                                ? 'bg-brand-strong border-brand text-surface'
                                                : 'bg-surface border-border'
                                            }`}
                                          >
                                            {checked && <Check className="w-3 h-3" />}
                                          </span>
                                          <span className="text-sm font-medium leading-tight">
                                            {svc.name}
                                          </span>
                                        </div>
                                        <span className="text-xs text-text-secondary tabular-nums shrink-0">
                                          {formatBRL(svc.price)}
                                        </span>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}

            {/* ETAPA 4 — Confirmar atendimento */}
            {step === 4 && (
              <section className="space-y-5">
                <div>
                  <h1 className="font-display text-3xl sm:text-4xl font-semibold text-brand-strong [text-wrap:balance]">
                    Confirmar atendimento
                  </h1>
                  <p className="mt-1 text-sm sm:text-base text-text-secondary leading-relaxed">
                    Confira os dados do seu atendimento com {professionalName}.
                  </p>
                </div>

                {/* Valor total pago em destaque e editável diretamente */}
                <div
                  onClick={() => totalEditRef.current?.focus()}
                  className="p-5 sm:p-6 rounded-2xl bg-brand-soft border-2 border-red-400 shadow-sm space-y-3 cursor-text"
                >
                  <div className="flex items-start gap-2.5 rounded-xl bg-red-50 border border-red-200 px-3.5 py-2.5">
                    <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <p className="text-sm sm:text-base font-bold text-red-600 leading-snug">
                        Atenção: confira se o valor abaixo está correto
                      </p>
                      <p className="text-xs sm:text-sm font-medium text-red-600/90 leading-snug">
                        Considere o valor total pago (com sinal e adicionais). Se
                        precisar corrigir, toque no valor.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-0.5">
                    <label
                      htmlFor="attendanceform-final-total"
                      className="text-sm font-bold text-brand-strong uppercase tracking-wide"
                    >
                      Valor total pago
                    </label>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        totalEditRef.current?.focus();
                        totalEditRef.current?.select();
                      }}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-brand-strong hover:underline"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      <span>Toque para editar</span>
                    </button>
                  </div>
                  <div className="flex items-baseline gap-2.5 bg-surface border-2 border-brand/40 rounded-xl px-4 py-3.5 focus-within:border-brand-strong focus-within:ring-2 focus-within:ring-brand/25">
                    <span className="text-2xl sm:text-3xl font-extrabold text-brand-strong select-none">
                      R$
                    </span>
                    <input
                      id="attendanceform-final-total"
                      ref={totalEditRef}
                      type="text"
                      inputMode="decimal"
                      aria-label="Valor total pago em reais"
                      value={totalPaidInput}
                      onChange={(e) => {
                        setTotalPaidInput(
                          e.target.value.replace(/[^\d.,]/g, ''),
                        );
                        setErrorMessage('');
                      }}
                      placeholder="0,00"
                      className="w-full bg-transparent text-4xl sm:text-5xl font-extrabold text-brand-strong tabular-nums focus:outline-none placeholder:text-placeholder"
                    />
                  </div>
                </div>

                {/* Resumo limpo com divisórias sutis */}
                <dl className="divide-y divide-border border-t border-b border-border text-sm sm:text-base">
                  <div className="py-3.5 flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-4">
                    <dt className="text-text-secondary">Nome</dt>
                    <dd className="font-semibold text-text-primary sm:text-right">
                      {clientName.trim()}
                    </dd>
                  </div>

                  <div className="py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
                    <div className="flex items-center justify-between gap-2">
                      <label
                        htmlFor="attendanceform-final-whatsapp"
                        className="text-text-secondary"
                      >
                        WhatsApp
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          whatsappEditRef.current?.focus();
                          whatsappEditRef.current?.select();
                        }}
                        className="sm:hidden inline-flex items-center gap-1 text-xs font-semibold text-brand-strong hover:underline"
                      >
                        <Pencil className="w-3 h-3" />
                        <span>Editar</span>
                      </button>
                    </div>
                    <div className="flex items-center gap-2 sm:justify-end">
                      <input
                        id="attendanceform-final-whatsapp"
                        ref={whatsappEditRef}
                        type="tel"
                        inputMode="numeric"
                        aria-label="WhatsApp da cliente"
                        value={whatsapp}
                        onChange={(e) => {
                          setWhatsapp(formatBrazilPhone(e.target.value));
                          setErrorMessage('');
                        }}
                        placeholder="(00) 00000-0000"
                        className="w-full sm:w-44 min-h-[40px] px-3 py-1.5 rounded-xl bg-background border border-border font-semibold text-text-primary tabular-nums sm:text-right focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          whatsappEditRef.current?.focus();
                          whatsappEditRef.current?.select();
                        }}
                        className="hidden sm:inline-flex items-center gap-1 text-xs font-semibold text-brand-strong hover:underline shrink-0"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        <span>Editar</span>
                      </button>
                    </div>
                  </div>

                  <div className="py-3.5 flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-4">
                    <dt className="text-text-secondary shrink-0">
                      Serviços realizados
                    </dt>
                    <dd className="font-semibold text-text-primary sm:text-right">
                      <span>
                        {selectedServices.map((s) => s.name).join(', ')}
                      </span>
                      {isDuda && selectedAdditionals.length > 0 && (
                        <span className="block text-xs font-medium text-text-secondary mt-0.5">
                          Adicionais: {selectedAdditionals.join(', ')}
                        </span>
                      )}
                    </dd>
                  </div>

                  <div className="py-3.5 flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-4">
                    <dt className="text-text-secondary">
                      Próximo retorno solicitado
                    </dt>
                    <dd className="font-semibold text-text-primary sm:text-right">
                      {returnOption
                        ? getReturnOptionLabel(returnOption, professional)
                        : '—'}
                    </dd>
                  </div>

                  {effectiveReturnDate && (
                    <div className="py-3.5 flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-4">
                      <dt className="text-text-secondary">
                        {returnOption === 'specific_date'
                          ? 'Data escolhida para retorno'
                          : 'Data prevista de retorno'}
                      </dt>
                      <dd className="font-semibold text-brand-strong tabular-nums sm:text-right">
                        {formatDateBR(effectiveReturnDate)}
                      </dd>
                    </div>
                  )}

                  {effectiveReturnDate && preferredTimesSummary && (
                    <div className="py-3.5 flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-4">
                      <dt className="text-text-secondary">
                        Período e horários de preferência
                      </dt>
                      <dd className="font-semibold text-text-primary tabular-nums sm:text-right">
                        {preferredTimesSummary}
                      </dd>
                    </div>
                  )}

                  {wantsToScheduleReturn === 'yes' &&
                    selectedExtraReturnServices.length > 0 && (
                      <div className="py-3.5 flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-4">
                        <dt className="text-text-secondary shrink-0">
                          Outros procedimentos no retorno
                        </dt>
                        <dd className="font-semibold text-text-primary sm:text-right">
                          <span>
                            {selectedExtraReturnServices
                              .map(
                                (svc) =>
                                  `${svc.name} (${svc.professional === 'lais' ? 'Laís' : 'Duda'})`,
                              )
                              .join(', ')}
                          </span>
                          {hasJointReturnBooking && (
                            <span className="block text-xs font-medium text-brand-strong mt-0.5">
                              Agendamento conjunto · Laís e Duda
                            </span>
                          )}
                        </dd>
                      </div>
                    )}
                </dl>
              </section>
            )}

            {errorMessage && (
              <div className="p-3.5 rounded-2xl bg-error-soft border border-error-border text-sm font-medium text-error">
                {errorMessage}
              </div>
            )}

            {/* Navegação das etapas */}
            {step === 1 &&
              ((lookupStatus !== 'found' && lookupStatus !== 'error') ||
                forceNewNameSamePhone) && (
                <button
                  type="button"
                  disabled={lookupStatus === 'loading'}
                  onClick={() => void handleNextFromStep()}
                  className="w-full min-h-[54px] px-6 py-3 rounded-2xl text-base font-semibold transition-colors shadow-sm btn-primary disabled:opacity-60 inline-flex items-center justify-center gap-2"
                >
                  <span>
                    {lookupStatus === 'loading'
                      ? 'Verificando WhatsApp...'
                      : lookupStatus === 'not_found' || forceNewNameSamePhone
                        ? 'Continuar'
                        : 'Próximo'}
                  </span>
                  <ArrowRight className="w-5 h-5" />
                </button>
              )}

            {(step === 2 || step === 3) && (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => goToStep((step - 1) as FormStep)}
                  className="min-h-[52px] px-5 py-3 rounded-2xl text-base font-semibold transition-colors btn-secondary inline-flex items-center justify-center gap-2"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Voltar</span>
                </button>
                <button
                  type="button"
                  onClick={handleNextFromStep}
                  className="min-h-[52px] px-5 py-3 rounded-2xl text-base font-semibold transition-colors shadow-sm btn-primary inline-flex items-center justify-center gap-2"
                >
                  <span>Próximo</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {step === 4 && (
              <button
                type="submit"
                disabled={submitting}
                className="w-full min-h-[54px] px-6 py-3 rounded-2xl disabled:opacity-60 text-base font-semibold transition-colors shadow-sm btn-primary"
              >
                {submitting ? 'Confirmando...' : 'Confirmar e finalizar'}
              </button>
            )}
          </form>
        </div>
      </main>
    </div>
  );
}
