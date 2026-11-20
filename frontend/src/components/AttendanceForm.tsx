import { useMemo, useRef, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Pencil,
} from 'lucide-react';
import {
  DUDA_ADDITIONALS,
  DUDA_RETURN_OPTIONS,
  LAIS_RETURN_OPTIONS,
  TIME_SLOTS,
  addDaysToISO,
  calculateReturnDateISO,
  formatBRL,
  formatBrazilPhone,
  formatBrazilTimeBR,
  formatDateBR,
  getLocalDateISO,
  getReturnOptionLabel,
  getServicesCatalog,
  parseCurrencyInput,
  type Professional,
  type ReturnOption,
} from '../../../shared/catalog';
import { submitAttendance, type SubmissionConfirmation } from '../lib/api';

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

export function AttendanceForm({ professional, onBack }: AttendanceFormProps) {
  const isDuda = professional === 'duda';
  const servicesCatalog = getServicesCatalog(professional);
  const returnOptions = isDuda ? DUDA_RETURN_OPTIONS : LAIS_RETURN_OPTIONS;
  const professionalName = isDuda ? 'Duda' : 'Laís';

  const [step, setStep] = useState<FormStep>(1);
  const [clientName, setClientName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [totalPaidInput, setTotalPaidInput] = useState('');
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [selectedAdditionals, setSelectedAdditionals] = useState<string[]>([]);
  const [returnOption, setReturnOption] = useState<ReturnOption | null>(null);
  const [preferredTimes, setPreferredTimes] = useState<string[]>([]);
  const [serviceDate] = useState<string>(() => getLocalDateISO());

  const [idempotencyKey, setIdempotencyKey] = useState<string>(() =>
    generateIdempotencyKey(),
  );
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const totalEditRef = useRef<HTMLInputElement | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [confirmation, setConfirmation] = useState<SubmissionConfirmation | null>(
    null,
  );

  const selectedServices = useMemo(
    () =>
      servicesCatalog.filter((service) =>
        selectedServiceIds.includes(service.id),
      ),
    [servicesCatalog, selectedServiceIds],
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

  const needsThreeTimes = Boolean(
    selectedReturnMeta && selectedReturnMeta.days !== null,
  );

  function toggleService(serviceId: string) {
    setErrorMessage('');
    setSelectedServiceIds((prev) =>
      prev.includes(serviceId)
        ? prev.filter((id) => id !== serviceId)
        : [...prev, serviceId],
    );
  }

  function toggleAdditional(label: string) {
    setSelectedAdditionals((prev) =>
      prev.includes(label)
        ? prev.filter((item) => item !== label)
        : [...prev, label],
    );
  }

  function handleSelectReturnOption(option: ReturnOption) {
    setErrorMessage('');
    setReturnOption(option);
    const meta = returnOptions.find((item) => item.value === option);
    if (!meta || meta.days === null) {
      setPreferredTimes([]);
    }
  }

  function toggleTimeSlot(slot: string) {
    setErrorMessage('');
    setPreferredTimes((prev) => (prev.includes(slot) ? [] : [slot]));
  }

  function resetForm() {
    setStep(1);
    setClientName('');
    setWhatsapp('');
    setTotalPaidInput('');
    setSelectedServiceIds([]);
    setSelectedAdditionals([]);
    setReturnOption(null);
    setPreferredTimes([]);
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
    if (clientName.trim().length < 2) {
      setErrorMessage('Por favor, informe seu nome completo.');
      return false;
    }
    const digits = whatsapp.replace(/\D/g, '');
    if (digits.length < 10) {
      setErrorMessage(
        'Por favor, informe um número de WhatsApp válido com DDD.',
      );
      return false;
    }
    return true;
  }

  function validateStep2(): boolean {
    if (selectedServiceIds.length === 0) {
      setErrorMessage('Por favor, selecione pelo menos um serviço realizado.');
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
    if (!returnOption) {
      setErrorMessage(
        'Por favor, selecione uma opção para o próximo retorno.',
      );
      return false;
    }
    if (needsThreeTimes && preferredTimes.length !== 1) {
      setErrorMessage(
        'Por favor, escolha 1 horário de sua preferência.',
      );
      return false;
    }
    return true;
  }

  function handleNextFromStep() {
    if (step === 1) {
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
      const result = await submitAttendance({
        professional,
        clientName: clientName.trim(),
        whatsapp,
        totalPaid,
        serviceIds: selectedServiceIds,
        additionals: isDuda ? selectedAdditionals : [],
        returnOption,
        preferredTimes: needsThreeTimes ? preferredTimes : [],
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

            <h1 className="mt-4 font-display text-3xl font-bold text-brand-strong [text-wrap:balance]">
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
                  {getReturnOptionLabel(confirmation.returnOption)}
                </span>
              </div>
              {confirmation.returnDate && (
                <div className="flex justify-between gap-3">
                  <span className="text-text-secondary">Data prevista</span>
                  <span className="font-semibold text-brand-strong tabular-nums">
                    {formatDateBR(confirmation.returnDate)}
                  </span>
                </div>
              )}
              {confirmation.preferredTimes.length > 0 && (
                <div className="flex justify-between gap-3">
                  <span className="text-text-secondary">Horário escolhido</span>
                  <span className="font-medium text-text-primary tabular-nums">
                    {confirmation.preferredTimes[0]}
                  </span>
                </div>
              )}
            </div>

            {confirmation.returnOption !== 'no_schedule' && (
              <p className="mt-4 text-xs sm:text-sm text-text-secondary">
                {professionalName} verificará a disponibilidade na agenda e
                confirmará com você pelo WhatsApp.
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
                  <h1 className="font-display text-3xl sm:text-4xl font-bold text-brand-strong [text-wrap:balance]">
                    Dados da cliente
                  </h1>
                  <p className="mt-1 text-sm sm:text-base text-text-secondary">
                    Atendimento com{' '}
                    <strong className="font-semibold text-text-primary">
                      {professionalName}
                    </strong>
                    . Informe seu nome e WhatsApp para começar.
                  </p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label
                      className="block text-sm font-medium text-text-secondary mb-1.5"
                      htmlFor="attendanceform-field-1"
                    >
                      Nome completo
                    </label>
                    <input
                      id="attendanceform-field-1"
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
                    <input
                      id="attendanceform-field-2"
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel"
                      required
                      value={whatsapp}
                      onChange={(e) => {
                        setWhatsapp(formatBrazilPhone(e.target.value));
                        setErrorMessage('');
                      }}
                      placeholder="(00) 00000-0000"
                      className="w-full min-h-[50px] px-4 py-2.5 border rounded-2xl tabular-nums field-control text-base"
                    />
                  </div>
                </div>
              </section>
            )}

            {/* ETAPA 2 — Atendimento realizado */}
            {step === 2 && (
              <section className="space-y-5">
                <div>
                  <h1 className="font-display text-3xl sm:text-4xl font-bold text-brand-strong [text-wrap:balance]">
                    Atendimento realizado
                  </h1>
                  <p className="mt-1 text-sm sm:text-base text-text-secondary">
                    Selecione um ou mais serviços realizados com{' '}
                    {professionalName}.
                  </p>
                </div>

                <div className="space-y-2.5">
                  <p className="text-xs text-text-secondary">
                    Os valores exibidos ao lado são apenas informativos.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {servicesCatalog.map((service) => {
                      const selected = selectedServiceIds.includes(service.id);
                      return (
                        <button
                          key={service.id}
                          type="button"
                          onClick={() => toggleService(service.id)}
                          aria-pressed={selected}
                          className={`min-h-[52px] px-4 py-3 rounded-2xl border text-left flex items-center justify-between gap-3 transition-colors ${
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
                      );
                    })}
                  </div>
                </div>

                {isDuda && (
                  <div className="space-y-2 pt-1">
                    <p className="text-sm font-medium text-text-primary">
                      Adicionais (se houver)
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {DUDA_ADDITIONALS.map((item) => {
                        const checked = selectedAdditionals.includes(item);
                        return (
                          <button
                            key={item}
                            type="button"
                            onClick={() => toggleAdditional(item)}
                            aria-pressed={checked}
                            className={`min-h-[44px] px-3.5 py-2 rounded-xl border inline-flex items-center gap-2 text-sm transition-colors ${
                              checked
                                ? 'choice-selected font-medium'
                                : 'choice-idle'
                            }`}
                          >
                            <span
                              className={`w-4 h-4 rounded-sm border flex items-center justify-center shrink-0 ${
                                checked
                                  ? 'bg-brand-strong border-brand text-surface'
                                  : 'bg-surface border-border'
                              }`}
                            >
                              {checked && <Check className="w-3 h-3" />}
                            </span>
                            <span>{item}</span>
                          </button>
                        );
                      })}
                    </div>
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
              <section className="space-y-5">
                <div>
                  <h1 className="font-display text-3xl sm:text-4xl font-bold text-brand-strong [text-wrap:balance]">
                    Próximo retorno
                  </h1>
                  <p className="mt-1 text-sm sm:text-base text-text-secondary">
                    Deseja deixar sua próxima manutenção pré-agendada?
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {returnOptions.map((opt) => {
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
                  <div className="p-4 sm:p-5 rounded-2xl bg-brand-soft border border-border space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div className="flex items-center gap-2 text-brand-strong">
                        <Calendar className="w-5 h-5 shrink-0" />
                        <span className="text-sm font-medium">
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

                    <div className="pt-3.5 border-t border-border/70 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-sm sm:text-base font-semibold text-red-600">
                          <Clock className="w-4 h-4 text-red-600 shrink-0" />
                          <span>Escolha 1 horário de sua preferência</span>
                        </div>
                        <span className="text-xs sm:text-sm font-semibold text-brand-strong tabular-nums">
                          {preferredTimes.length === 1
                            ? `Selecionado: ${preferredTimes[0]}`
                            : '0 de 1 selecionado'}
                        </span>
                      </div>

                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
                        {TIME_SLOTS.map((slot) => {
                          const selected = preferredTimes.includes(slot);
                          return (
                            <button
                              key={slot}
                              type="button"
                              onClick={() => toggleTimeSlot(slot)}
                              aria-pressed={selected}
                              className={`min-h-[48px] px-2 py-2.5 rounded-xl border text-sm sm:text-base font-semibold tabular-nums transition-colors ${
                                selected
                                  ? 'choice-selected'
                                  : 'bg-surface border-border text-text-primary hover:border-brand'
                              }`}
                            >
                              {slot}
                            </button>
                          );
                        })}
                      </div>

                      <p className="text-sm font-semibold text-red-600 leading-relaxed">
                        {professionalName} verificará a disponibilidade e
                        confirmará o horário com você pelo WhatsApp.
                      </p>
                    </div>
                  </div>
                )}

                {returnOption === 'to_arrange' && (
                  <p className="text-sm text-text-secondary bg-background border border-border rounded-2xl px-4 py-3">
                    Combinaremos o melhor dia com você pelo WhatsApp.
                  </p>
                )}
              </section>
            )}

            {/* ETAPA 4 — Confirmar atendimento */}
            {step === 4 && (
              <section className="space-y-5">
                <div>
                  <h1 className="font-display text-3xl sm:text-4xl font-bold text-brand-strong [text-wrap:balance]">
                    Confirmar atendimento
                  </h1>
                  <p className="mt-1 text-sm sm:text-base text-text-secondary">
                    Confira os dados do seu atendimento com {professionalName}.
                  </p>
                </div>

                {/* Valor total pago em destaque e editável diretamente */}
                <div
                  onClick={() => totalEditRef.current?.focus()}
                  className="p-5 rounded-2xl bg-brand-soft border border-border space-y-2 cursor-text"
                >
                  <div className="flex items-center justify-between gap-2">
                    <label
                      htmlFor="attendanceform-final-total"
                      className="text-sm font-semibold text-text-secondary"
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
                  <div className="flex items-baseline gap-2 bg-surface border border-border rounded-xl px-4 py-3 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/25">
                    <span className="text-2xl sm:text-3xl font-bold text-brand-strong select-none">
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
                      className="w-full bg-transparent text-3xl sm:text-4xl font-bold text-brand-strong tabular-nums focus:outline-none placeholder:text-placeholder"
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

                  <div className="py-3.5 flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-4">
                    <dt className="text-text-secondary">WhatsApp</dt>
                    <dd className="font-semibold text-text-primary tabular-nums sm:text-right">
                      {formatBrazilPhone(whatsapp)}
                    </dd>
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
                      {returnOption ? getReturnOptionLabel(returnOption) : '—'}
                    </dd>
                  </div>

                  {(calculatedReturnDate || preferredTimes.length > 0) && (
                    <div className="py-3.5 flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-4">
                      <dt className="text-text-secondary">
                        Data e horário escolhido
                      </dt>
                      <dd className="font-semibold text-brand-strong tabular-nums sm:text-right">
                        {calculatedReturnDate
                          ? formatDateBR(calculatedReturnDate)
                          : ''}
                        {calculatedReturnDate && preferredTimes.length > 0
                          ? ' · '
                          : ''}
                        {preferredTimes.join(' · ')}
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
            {step === 1 && (
              <button
                type="button"
                onClick={handleNextFromStep}
                className="w-full min-h-[54px] px-6 py-3 rounded-2xl text-base font-semibold transition-colors shadow-sm btn-primary inline-flex items-center justify-center gap-2"
              >
                <span>Próximo</span>
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
