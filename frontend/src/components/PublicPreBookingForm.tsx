import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Loader2,
  Sparkles,
} from 'lucide-react';
import {
  DUDA_SERVICES,
  LAIS_LASH_TYPE_SERVICE_IDS,
  LAIS_SERVICES,
  formatBrazilPhone,
  formatDateBR,
  getBrazilTodayISO,
  normalizeWhatsAppDigits,
  type LashAttendanceType,
} from '../../../shared/catalog';
import {
  lookupClientsByWhatsapp,
  submitPublicPreBooking,
  type PublicPreBookingConfirmation,
  type PublicRecognizedClient,
} from '../lib/api';
import { formatTimeInputHHMM, isValidHHMM } from './AgendaBookingModal';

interface PublicPreBookingFormProps {
  onBack: () => void;
}

type PreBookingStep = 1 | 2;

function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function PublicPreBookingForm({ onBack }: PublicPreBookingFormProps) {
  const [step, setStep] = useState<PreBookingStep>(1);
  const [whatsapp, setWhatsapp] = useState('');
  const [clientName, setClientName] = useState('');
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [recognizedWhatsappDigits, setRecognizedWhatsappDigits] = useState('');
  const [lookupStatus, setLookupStatus] = useState<
    'idle' | 'loading' | 'found' | 'not_found' | 'error'
  >('idle');
  const [lookupError, setLookupError] = useState('');
  const [matchedClients, setMatchedClients] = useState<PublicRecognizedClient[]>([]);
  const [disambiguatedClientId, setDisambiguatedClientId] = useState<string | null>(null);
  const [forceNewNameSamePhone, setForceNewNameSamePhone] = useState(false);

  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [serviceAttendanceTypes, setServiceAttendanceTypes] = useState<
    Record<string, LashAttendanceType>
  >({});
  const [desiredDate, setDesiredDate] = useState<string>(() => getBrazilTodayISO());
  const [desiredTime, setDesiredTime] = useState('');
  const [notes, setNotes] = useState('');

  const [idempotencyKey] = useState<string>(() => generateIdempotencyKey());
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const whatsappInputRef = useRef<HTMLInputElement | null>(null);
  const clientNameInputRef = useRef<HTMLInputElement | null>(null);
  const lookupAbortRef = useRef<AbortController | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [confirmation, setConfirmation] = useState<PublicPreBookingConfirmation | null>(null);

  const brazilToday = useMemo(() => getBrazilTodayISO(), []);
  const normalizedWhatsappDigits = useMemo(
    () => normalizeWhatsAppDigits(whatsapp),
    [whatsapp]
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
          : 'Não foi possível consultar seu cadastro. Tente novamente.'
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

    if (selectedClientId && recognizedWhatsappDigits === normalizedWhatsappDigits) {
      return;
    }

    const delayMs = normalizedWhatsappDigits.length === 11 ? 250 : 750;
    const timer = window.setTimeout(() => {
      void runWhatsappLookup(normalizedWhatsappDigits);
    }, delayMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [step, confirmation, normalizedWhatsappDigits, selectedClientId, recognizedWhatsappDigits]);

  const hasLaisSelected = useMemo(
    () => selectedServiceIds.some((id) => LAIS_SERVICES.some((s) => s.id === id)),
    [selectedServiceIds]
  );
  const hasDudaSelected = useMemo(
    () => selectedServiceIds.some((id) => DUDA_SERVICES.some((s) => s.id === id)),
    [selectedServiceIds]
  );
  const isJointSelection = hasLaisSelected && hasDudaSelected;

  const selectedLashServicesNeedingType = useMemo(
    () =>
      LAIS_SERVICES.filter(
        (svc) =>
          selectedServiceIds.includes(svc.id) &&
          LAIS_LASH_TYPE_SERVICE_IDS.includes(svc.id)
      ),
    [selectedServiceIds]
  );

  function handleWhatsappChange(rawValue: string) {
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
    setStep(2);
    window.scrollTo({ top: 0, behavior: 'smooth' });
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

  function handleSelectAttendanceType(serviceId: string, type: LashAttendanceType) {
    setErrorMessage('');
    setServiceAttendanceTypes((prev) => ({
      ...prev,
      [serviceId]: type,
    }));
  }

  function handleStep1Next() {
    setErrorMessage('');
    if (normalizedWhatsappDigits.length < 10 || normalizedWhatsappDigits.length > 11) {
      setErrorMessage('Informe seu WhatsApp com DDD (10 ou 11 dígitos).');
      return;
    }

    if (lookupStatus === 'found' && !forceNewNameSamePhone) {
      if (matchedClients.length === 1) {
        handleConfirmRecognizedClient(matchedClients[0]);
        return;
      }
      if (disambiguatedClientId) {
        const picked = matchedClients.find((c) => c.id === disambiguatedClientId);
        if (picked) {
          handleConfirmRecognizedClient(picked);
          return;
        }
      }
      setErrorMessage('Selecione seu nome acima ou informe uma nova pessoa.');
      return;
    }

    if (clientName.trim().length < 2) {
      setErrorMessage('Informe seu nome completo.');
      return;
    }

    setStep(2);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submittingRef.current) return;
    setErrorMessage('');

    if (selectedServiceIds.length === 0) {
      setErrorMessage('Selecione pelo menos um procedimento desejado.');
      return;
    }

    for (const lashSvc of selectedLashServicesNeedingType) {
      const picked = serviceAttendanceTypes[lashSvc.id];
      if (picked !== 'Aplicação' && picked !== 'Manutenção') {
        setErrorMessage(`Selecione Aplicação ou Manutenção para ${lashSvc.name}.`);
        return;
      }
    }

    if (!desiredDate) {
      setErrorMessage('Selecione a data desejada para o agendamento.');
      return;
    }

    const normalizedTime = desiredTime.trim();
    if (!isValidHHMM(normalizedTime)) {
      setErrorMessage('Informe o horário desejado no formato HH:MM (ex: 14:30).');
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    try {
      const result = await submitPublicPreBooking({
        clientId: selectedClientId,
        clientName: clientName.trim(),
        whatsapp,
        serviceIds: selectedServiceIds,
        serviceAttendanceTypes,
        desiredDate,
        desiredTime: normalizedTime,
        notes: notes.trim(),
        idempotencyKey,
      });
      setConfirmation(result);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Não foi possível enviar sua solicitação de agendamento.'
      );
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  if (confirmation) {
    const allProcedures = [
      ...confirmation.laisProcedures.map((name) => `${name} (Laís)`),
      ...confirmation.dudaProcedures.map((name) => `${name} (Duda)`),
    ];

    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="border-b border-border bg-surface">
          <div className="max-w-2xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
            <span className="font-display text-xl font-bold text-brand-strong">
              MAIS CÍLIOS
            </span>
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center px-4 py-8">
          <div className="w-full max-w-lg bg-surface border border-border rounded-3xl p-7 sm:p-9 shadow-card text-center">
            <div className="w-16 h-16 rounded-full bg-success-soft text-success mx-auto flex items-center justify-center">
              <CheckCircle2 className="w-9 h-9" />
            </div>

            <h1 className="mt-5 font-display text-3xl sm:text-4xl font-semibold text-brand-strong [text-wrap:balance]">
              Pré-agendamento enviado!
            </h1>
            <p className="mt-2 text-sm sm:text-base text-text-secondary">
              Obrigada,{' '}
              <strong className="font-semibold text-text-primary">
                {confirmation.clientName}
              </strong>
              . Recebemos sua solicitação de horário.
            </p>

            <div className="mt-6 rounded-2xl bg-brand-soft border border-border p-4 text-left space-y-2.5 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-text-secondary">Data desejada</span>
                <span className="font-semibold text-brand-strong tabular-nums">
                  {formatDateBR(confirmation.desiredDate)}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-text-secondary">Horário desejado</span>
                <span className="font-semibold text-brand-strong tabular-nums">
                  {confirmation.desiredTime}
                </span>
              </div>
              <div className="pt-2 border-t border-border/70">
                <span className="block text-text-secondary mb-1">Procedimentos</span>
                <p className="font-medium text-text-primary leading-relaxed">
                  {allProcedures.join(' · ')}
                </p>
              </div>
            </div>

            <p className="mt-4 text-xs sm:text-sm text-text-secondary">
              {confirmation.isJoint
                ? 'Laís e Duda receberam sua solicitação de agendamento conjunto, vão verificar a disponibilidade e entrar em contato pelo WhatsApp para confirmar.'
                : 'A profissional responsável verificará a disponibilidade na agenda e confirmará com você pelo WhatsApp.'}
            </p>

            <button
              type="button"
              onClick={onBack}
              className="mt-7 w-full min-h-[50px] px-5 py-3 rounded-2xl text-sm sm:text-base font-semibold transition-colors btn-primary"
            >
              Voltar à tela inicial
            </button>
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
            onClick={step === 2 ? () => setStep(1) : onBack}
            className="min-h-[44px] px-2.5 -ml-2 inline-flex items-center gap-1.5 text-sm font-medium rounded-xl transition-colors btn-ghost whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{step === 2 ? 'Voltar' : 'Início'}</span>
          </button>
          <span className="font-display text-xl font-bold text-brand-strong whitespace-nowrap shrink-0">
            MAIS CÍLIOS
          </span>
          <button
            type="button"
            onClick={onBack}
            className="min-h-[40px] px-2.5 text-xs sm:text-sm font-medium rounded-xl btn-ghost whitespace-nowrap shrink-0"
          >
            Cancelar
          </button>
        </div>
      </header>

      <main className="flex-1 w-full max-w-2xl mx-auto px-4 sm:px-6 pt-5 sm:pt-8">
        <div className="bg-surface border border-border rounded-3xl p-5 sm:p-8 shadow-card">
          <div className="pb-5 border-b border-border">
            <div className="flex items-center justify-between gap-3 text-xs sm:text-sm">
              <span className="font-semibold text-brand-strong">
                Etapa {step} de 2 · {step === 1 ? 'Identificação' : 'Procedimentos, data e horário'}
              </span>
              <span className="text-text-secondary">Novo agendamento</span>
            </div>
            <div className="mt-2.5 h-1.5 w-full rounded-full bg-brand-soft overflow-hidden">
              <div
                className={`h-full rounded-full bg-brand transition-all duration-200 ${
                  step === 1 ? 'w-1/2' : 'w-full'
                }`}
              />
            </div>
          </div>

          {step === 1 ? (
            <div className="mt-6 space-y-5">
              <div>
                <h1 className="font-display text-3xl sm:text-4xl font-semibold text-brand-strong [text-wrap:balance]">
                  Novo agendamento
                </h1>
                <p className="mt-1 text-sm sm:text-base text-text-secondary">
                  Informe seu WhatsApp para identificarmos seu cadastro ou fazer um novo.
                </p>
              </div>

              <div>
                <label
                  htmlFor="prebooking-whatsapp"
                  className="block text-sm font-medium text-text-secondary mb-1.5"
                >
                  WhatsApp <span className="font-semibold text-red-600">(obrigatório)</span>
                </label>
                <div className="relative">
                  <input
                    id="prebooking-whatsapp"
                    ref={whatsappInputRef}
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel"
                    value={whatsapp}
                    onChange={(e) => handleWhatsappChange(e.target.value)}
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
                        onClick={() => handleConfirmRecognizedClient(matchedClients[0])}
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

              {lookupStatus === 'found' &&
                !forceNewNameSamePhone &&
                matchedClients.length >= 2 && (
                  <div className="p-5 sm:p-6 rounded-2xl bg-brand-soft border-2 border-brand/45 shadow-sm text-center space-y-4">
                    <div className="space-y-1.5">
                      <h2 className="font-display text-2xl sm:text-3xl font-semibold text-brand-strong">
                        Bem-vinda de volta! 🩷
                      </h2>
                      <p className="text-sm sm:text-base text-text-secondary">
                        Encontramos mais de um cadastro neste número. Selecione seu nome:
                      </p>
                    </div>

                    <div className="space-y-2 text-left">
                      {matchedClients.map((client) => {
                        const selected = disambiguatedClientId === client.id;
                        return (
                          <button
                            key={client.id}
                            type="button"
                            onClick={() => {
                              setDisambiguatedClientId(client.id);
                              setErrorMessage('');
                            }}
                            className={`w-full min-h-[48px] px-4 py-2.5 rounded-xl border text-left flex items-center justify-between gap-3 transition-colors ${
                              selected ? 'choice-selected font-semibold' : 'bg-surface border-border'
                            }`}
                          >
                            <span>{client.name}</span>
                            {selected && <Check className="w-4 h-4 text-brand-strong shrink-0" />}
                          </button>
                        );
                      })}
                    </div>

                    <button
                      type="button"
                      onClick={handleStep1Next}
                      className="w-full min-h-[50px] px-5 py-3 rounded-2xl text-base font-semibold btn-primary inline-flex items-center justify-center gap-2"
                    >
                      <span>Continuar</span>
                      <ArrowRight className="w-5 h-5" />
                    </button>

                    <button
                      type="button"
                      onClick={handleUseSamePhoneNewPerson}
                      className="text-xs sm:text-sm text-text-secondary hover:text-brand-strong underline-offset-4 hover:underline"
                    >
                      Cadastrar outra pessoa com este WhatsApp
                    </button>
                  </div>
                )}

              {(lookupStatus === 'not_found' ||
                lookupStatus === 'error' ||
                forceNewNameSamePhone) && (
                <div>
                  <label
                    htmlFor="prebooking-name"
                    className="block text-sm font-medium text-text-secondary mb-1.5"
                  >
                    Nome completo <span className="font-semibold text-red-600">(obrigatório)</span>
                  </label>
                  <input
                    id="prebooking-name"
                    ref={clientNameInputRef}
                    type="text"
                    autoComplete="name"
                    value={clientName}
                    onChange={(e) => {
                      setClientName(e.target.value);
                      setErrorMessage('');
                    }}
                    placeholder="Seu nome completo"
                    className="w-full min-h-[50px] px-4 py-2.5 border rounded-2xl field-control text-base"
                  />
                  {lookupError && (
                    <p className="mt-1.5 text-xs text-text-secondary">{lookupError}</p>
                  )}
                </div>
              )}

              {errorMessage && (
                <div className="p-3.5 rounded-xl bg-error-soft border border-error-border text-sm text-error flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {(lookupStatus === 'not_found' ||
                lookupStatus === 'error' ||
                forceNewNameSamePhone ||
                normalizedWhatsappDigits.length < 10) && (
                <div className="pt-2 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={onBack}
                    className="min-h-[50px] px-5 py-3 rounded-2xl text-sm sm:text-base font-semibold btn-secondary"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleStep1Next}
                    className="flex-1 min-h-[50px] px-5 py-3 rounded-2xl text-sm sm:text-base font-semibold btn-primary inline-flex items-center justify-center gap-2"
                  >
                    <span>Próximo</span>
                    <ArrowRight className="w-5 h-5" />
                  </button>
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={(e) => void handleSubmit(e)} className="mt-6 space-y-6" noValidate>
              <div className="p-3.5 rounded-2xl bg-brand-soft border border-border flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm">
                <div className="min-w-0">
                  <span className="text-text-secondary">Cliente: </span>
                  <strong className="text-text-primary">{clientName}</strong>
                  <span className="text-border mx-1.5">·</span>
                  <span className="text-text-secondary tabular-nums">{whatsapp}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="text-xs font-semibold text-brand-strong hover:underline"
                >
                  Alterar dados
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <h2 className="font-display text-2xl sm:text-3xl font-semibold text-brand-strong">
                    Escolha os procedimentos
                  </h2>
                  <p className="mt-1 text-sm text-text-secondary">
                    Você pode selecionar um ou mais serviços da Laís e/ou da Duda.
                  </p>
                </div>

                {/* Serviços da Laís */}
                <div className="space-y-2.5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-brand-strong">
                    Laís · Cílios e sobrancelhas
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {LAIS_SERVICES.map((svc) => {
                      const selected = selectedServiceIds.includes(svc.id);
                      const needsType = LAIS_LASH_TYPE_SERVICE_IDS.includes(svc.id);
                      const pickedType = serviceAttendanceTypes[svc.id];
                      return (
                        <div key={svc.id} className="space-y-2">
                          <button
                            type="button"
                            onClick={() => toggleService(svc.id)}
                            aria-pressed={selected}
                            className={`w-full min-h-[48px] px-4 py-2.5 rounded-2xl border text-left flex items-center justify-between gap-3 transition-colors ${
                              selected ? 'choice-selected font-semibold' : 'choice-idle'
                            }`}
                          >
                            <span className="text-sm">{svc.name}</span>
                            <span
                              className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
                                selected
                                  ? 'bg-brand-strong border-brand-strong text-surface'
                                  : 'border-border bg-surface'
                              }`}
                            >
                              {selected && <Check className="w-3.5 h-3.5" />}
                            </span>
                          </button>

                          {selected && needsType && (
                            <div className="pl-2 pr-1 grid grid-cols-2 gap-2">
                              {(['Aplicação', 'Manutenção'] as const).map((typeOpt) => {
                                const active = pickedType === typeOpt;
                                return (
                                  <button
                                    key={typeOpt}
                                    type="button"
                                    onClick={() => handleSelectAttendanceType(svc.id, typeOpt)}
                                    aria-pressed={active}
                                    className={`min-h-[40px] px-3 py-1.5 rounded-xl border text-xs font-semibold transition-colors ${
                                      active ? 'choice-selected' : 'choice-idle'
                                    }`}
                                  >
                                    {typeOpt}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Serviços da Duda */}
                <div className="space-y-2.5 pt-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-brand-strong">
                    Duda · Unhas e cuidados
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {DUDA_SERVICES.map((svc) => {
                      const selected = selectedServiceIds.includes(svc.id);
                      return (
                        <button
                          key={svc.id}
                          type="button"
                          onClick={() => toggleService(svc.id)}
                          aria-pressed={selected}
                          className={`w-full min-h-[48px] px-4 py-2.5 rounded-2xl border text-left flex items-center justify-between gap-3 transition-colors ${
                            selected ? 'choice-selected font-semibold' : 'choice-idle'
                          }`}
                        >
                          <span className="text-sm">{svc.name}</span>
                          <span
                            className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
                              selected
                                ? 'bg-brand-strong border-brand-strong text-surface'
                                : 'border-border bg-surface'
                            }`}
                          >
                            {selected && <Check className="w-3.5 h-3.5" />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {isJointSelection && (
                  <div className="p-4 rounded-2xl bg-brand-soft border border-brand/40 flex items-start gap-2.5 text-xs sm:text-sm text-brand-strong">
                    <Sparkles className="w-4 h-4 shrink-0 mt-0.5" />
                    <p>
                      <strong>Agendamento conjunto (Laís + Duda):</strong> seu pedido será
                      encaminhado às duas profissionais para sincronizarem o mesmo horário nas
                      agendas.
                    </p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-border">
                <div>
                  <label
                    htmlFor="prebooking-date"
                    className="block text-sm font-medium text-text-secondary mb-1.5"
                  >
                    Data desejada <span className="font-semibold text-red-600">(obrigatório)</span>
                  </label>
                  <div className="relative">
                    <Calendar className="w-4 h-4 text-brand absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="prebooking-date"
                      type="date"
                      min={brazilToday}
                      required
                      value={desiredDate}
                      onChange={(e) => {
                        if (e.target.value) setDesiredDate(e.target.value);
                        setErrorMessage('');
                      }}
                      className="w-full min-h-[50px] pl-10 pr-4 py-2.5 border rounded-2xl font-semibold tabular-nums field-control text-base"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="prebooking-time"
                    className="block text-sm font-medium text-text-secondary mb-1.5"
                  >
                    Horário desejado <span className="font-semibold text-red-600">(obrigatório)</span>
                  </label>
                  <div className="relative">
                    <Clock className="w-4 h-4 text-brand absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="prebooking-time"
                      type="text"
                      inputMode="numeric"
                      required
                      maxLength={5}
                      value={desiredTime}
                      onChange={(e) => {
                        setDesiredTime(formatTimeInputHHMM(e.target.value));
                        setErrorMessage('');
                      }}
                      placeholder="Ex: 14:30"
                      className="w-full min-h-[50px] pl-10 pr-4 py-2.5 border rounded-2xl font-semibold tabular-nums field-control text-base"
                    />
                  </div>
                  <span className="mt-1 block text-xs text-text-secondary">
                    Formato 24h (ex: 09:00, 14:30)
                  </span>
                </div>
              </div>

              <div>
                <label
                  htmlFor="prebooking-notes"
                  className="block text-sm font-medium text-text-secondary mb-1.5"
                >
                  Observações (opcional)
                </label>
                <textarea
                  id="prebooking-notes"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Alguma preferência ou observação importante?"
                  className="w-full px-4 py-2.5 border rounded-2xl field-control text-base"
                />
              </div>

              {errorMessage && (
                <div className="p-3.5 rounded-xl bg-error-soft border border-error-border text-sm text-error flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <div className="pt-2 flex items-center gap-3">
                <button
                  type="button"
                  onClick={onBack}
                  className="min-h-[50px] px-5 py-3 rounded-2xl text-sm sm:text-base font-semibold btn-secondary"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 min-h-[50px] px-5 py-3 rounded-2xl text-sm sm:text-base font-semibold disabled:opacity-50 btn-primary inline-flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Enviando...</span>
                    </>
                  ) : (
                    <span>Solicitar pré-agendamento</span>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
