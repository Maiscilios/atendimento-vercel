import { useMemo, useState, type FormEvent } from 'react';
import { ArrowLeft, Calendar, Check, CheckCircle2, Clock } from 'lucide-react';
import {
  DUDA_ADDITIONALS,
  DUDA_RETURN_OPTIONS,
  LAIS_RETURN_OPTIONS,
  TIME_SLOTS,
  addDaysToISO,
  formatBRL,
  formatBrazilPhone,
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

export function AttendanceForm({ professional, onBack }: AttendanceFormProps) {
  const isDuda = professional === 'duda';
  const servicesCatalog = getServicesCatalog(professional);
  const returnOptions = isDuda ? DUDA_RETURN_OPTIONS : LAIS_RETURN_OPTIONS;
  const professionalName = isDuda ? 'Duda' : 'Laís';

  const [clientName, setClientName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [totalPaidInput, setTotalPaidInput] = useState('');
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [selectedAdditionals, setSelectedAdditionals] = useState<string[]>([]);
  const [returnOption, setReturnOption] = useState<ReturnOption | null>(null);
  const [preferredTimes, setPreferredTimes] = useState<string[]>([]);
  const [serviceDate] = useState<string>(() => getLocalDateISO());

  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [confirmation, setConfirmation] = useState<SubmissionConfirmation | null>(null);

  const selectedReturnMeta = useMemo(
    () => returnOptions.find((opt) => opt.value === returnOption) ?? null,
    [returnOptions, returnOption]
  );

  const calculatedReturnDate = useMemo(() => {
    if (!selectedReturnMeta || selectedReturnMeta.days === null) return null;
    return addDaysToISO(serviceDate, selectedReturnMeta.days);
  }, [selectedReturnMeta, serviceDate]);

  const needsThreeTimes = Boolean(selectedReturnMeta && selectedReturnMeta.days !== null);

  function toggleService(serviceId: string) {
    setSelectedServiceIds((prev) =>
      prev.includes(serviceId) ? prev.filter((id) => id !== serviceId) : [...prev, serviceId]
    );
  }

  function toggleAdditional(label: string) {
    setSelectedAdditionals((prev) =>
      prev.includes(label) ? prev.filter((item) => item !== label) : [...prev, label]
    );
  }

  function handleSelectReturnOption(option: ReturnOption) {
    setReturnOption(option);
    const meta = returnOptions.find((item) => item.value === option);
    if (!meta || meta.days === null) {
      setPreferredTimes([]);
    }
  }

  function toggleTimeSlot(slot: string) {
    setPreferredTimes((prev) => {
      if (prev.includes(slot)) {
        return prev.filter((t) => t !== slot);
      }
      if (prev.length >= 3) {
        return prev;
      }
      return [...prev, slot].sort();
    });
  }

  function resetForm() {
    setClientName('');
    setWhatsapp('');
    setTotalPaidInput('');
    setSelectedServiceIds([]);
    setSelectedAdditionals([]);
    setReturnOption(null);
    setPreferredTimes([]);
    setErrorMessage('');
    setConfirmation(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrorMessage('');

    const trimmedName = clientName.trim();
    if (trimmedName.length < 2) {
      setErrorMessage('Por favor, informe seu nome completo.');
      return;
    }

    const digits = whatsapp.replace(/\D/g, '');
    if (digits.length < 10) {
      setErrorMessage('Por favor, informe um número de WhatsApp válido com DDD.');
      return;
    }

    const totalPaid = parseCurrencyInput(totalPaidInput);
    if (totalPaid <= 0) {
      setErrorMessage('Por favor, informe o valor total pago, incluindo o sinal.');
      return;
    }

    if (selectedServiceIds.length === 0) {
      setErrorMessage('Por favor, selecione pelo menos um serviço realizado.');
      return;
    }

    if (!returnOption) {
      setErrorMessage('Por favor, selecione uma opção para a próxima manutenção.');
      return;
    }

    if (needsThreeTimes && preferredTimes.length !== 3) {
      setErrorMessage('Por favor, escolha exatamente 3 horários de sua preferência.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await submitAttendance({
        professional,
        clientName: trimmedName,
        whatsapp,
        totalPaid,
        serviceIds: selectedServiceIds,
        additionals: isDuda ? selectedAdditionals : [],
        returnOption,
        preferredTimes: needsThreeTimes ? preferredTimes : [],
        serviceDate,
      });
      setConfirmation(result);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Não foi possível confirmar seu atendimento.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (confirmation) {
    return (
      <div className="min-h-screen bg-[#FFF9FB] flex flex-col">
        <header className="border-b border-[#F3DCE6] bg-white">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
            <span className="font-display text-2xl font-bold text-[#831843]">MAIS CÍLIOS</span>
            <button
              type="button"
              onClick={onBack}
              className="min-h-[40px] px-3 text-sm font-medium text-[#831843] hover:bg-[#FDF2F6] rounded-xl transition-colors"
            >
              Início
            </button>
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
          <div className="w-full max-w-lg bg-white border border-[#F1D8E2] rounded-3xl p-7 sm:p-9 text-center shadow-[0_6px_24px_rgba(131,24,67,0.06)]">
            <div className="w-14 h-14 mx-auto rounded-full bg-[#FDF2F6] border border-[#F1D8E2] flex items-center justify-center text-[#9D2A58]">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <h1 className="mt-4 font-display text-3xl font-bold text-[#831843]">
              Atendimento confirmado!
            </h1>
            <p className="mt-2 text-sm sm:text-base text-[#5E3A4A]">
              Obrigada, <strong className="font-semibold text-[#331824]">{confirmation.clientName}</strong>. Suas informações com{' '}
              <strong className="font-semibold text-[#331824]">{professionalName}</strong> foram registradas com sucesso.
            </p>

            <div className="mt-6 p-4 rounded-2xl bg-[#FFF9FB] border border-[#F3DCE6] text-left space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-[#7A5464]">Data do atendimento</span>
                <span className="font-medium text-[#331824] tabular-nums">
                  {formatDateBR(confirmation.serviceDate)}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-[#7A5464]">Próxima manutenção</span>
                <span className="font-medium text-[#331824]">
                  {getReturnOptionLabel(confirmation.returnOption)}
                </span>
              </div>
              {confirmation.returnDate && (
                <div className="flex justify-between gap-3">
                  <span className="text-[#7A5464]">Data prevista</span>
                  <span className="font-semibold text-[#831843] tabular-nums">
                    {formatDateBR(confirmation.returnDate)}
                  </span>
                </div>
              )}
              {confirmation.preferredTimes.length > 0 && (
                <div className="flex justify-between gap-3">
                  <span className="text-[#7A5464]">Horários preferidos</span>
                  <span className="font-medium text-[#331824] tabular-nums">
                    {confirmation.preferredTimes.join(' · ')}
                  </span>
                </div>
              )}
            </div>

            {confirmation.returnOption !== 'no_schedule' && (
              <p className="mt-4 text-xs sm:text-sm text-[#7A5464]">
                O pré-agendamento é uma preferência. {professionalName} verificará a disponibilidade e entrará em contato pelo WhatsApp para confirmar.
              </p>
            )}

            <div className="mt-7 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={resetForm}
                className="min-h-[48px] px-5 py-2.5 rounded-xl bg-[#9D2A58] hover:bg-[#831843] text-white text-sm font-semibold transition-colors"
              >
                Novo atendimento
              </button>
              <button
                type="button"
                onClick={onBack}
                className="min-h-[48px] px-5 py-2.5 rounded-xl bg-[#FDF2F6] hover:bg-[#F9E3EC] text-[#831843] border border-[#EBC5D5] text-sm font-semibold transition-colors"
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
    <div className="min-h-screen bg-[#FFF9FB] pb-12">
      <header className="sticky top-0 z-20 border-b border-[#F3DCE6] bg-white/95 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={onBack}
            className="min-h-[40px] px-2.5 -ml-2 inline-flex items-center gap-1.5 text-sm font-medium text-[#831843] hover:bg-[#FDF2F6] rounded-xl transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Voltar</span>
          </button>
          <span className="font-display text-xl font-bold text-[#831843] whitespace-nowrap">
            MAIS CÍLIOS
          </span>
          <div className="w-16" aria-hidden="true" />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 pt-5 sm:pt-7">
        <div className="bg-white border border-[#F1D8E2] rounded-3xl p-5 sm:p-8 shadow-[0_4px_20px_rgba(131,24,67,0.04)]">
          <div className="pb-4 border-b border-[#F5E4EC] flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h1 className="font-display text-3xl font-bold text-[#831843]">
                Confirme seu atendimento
              </h1>
              <p className="mt-0.5 text-sm sm:text-base font-medium text-[#7A5464]">
                Atendimento realizado por {professionalName}
              </p>
            </div>
            <span className="text-xs font-medium text-[#7A5464] tabular-nums">
              Data: {formatDateBR(serviceDate)}
            </span>
          </div>

          <form onSubmit={handleSubmit} className="mt-5 space-y-6">
            {/* 01. Seus dados */}
            <section className="space-y-3">
              <h2 className="text-base font-semibold text-[#331824]">01. Seus dados</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#5E3A4A] mb-1">
                    Nome completo
                  </label>
                  <input
                    type="text"
                    required
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="Seu nome completo"
                    className="w-full min-h-[44px] px-3.5 py-2 text-sm sm:text-base bg-[#FFF9FB] border border-[#EED2DE] rounded-xl text-[#331824] placeholder:text-[#B18E9C] focus:outline-none focus:border-[#9D2A58]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#5E3A4A] mb-1">
                    WhatsApp
                  </label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    required
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(formatBrazilPhone(e.target.value))}
                    placeholder="(00) 00000-0000"
                    className="w-full min-h-[44px] px-3.5 py-2 text-sm sm:text-base bg-[#FFF9FB] border border-[#EED2DE] rounded-xl text-[#331824] placeholder:text-[#B18E9C] tabular-nums focus:outline-none focus:border-[#9D2A58]"
                  />
                </div>
              </div>
            </section>

            {/* 02. Valor do atendimento */}
            <section className="space-y-2 pt-4 border-t border-[#F5E4EC]">
              <h2 className="text-base font-semibold text-[#331824]">02. Valor do atendimento</h2>
              <label className="block text-sm text-[#5E3A4A]">
                Qual foi o valor total pago, incluindo o sinal?
              </label>
              <div className="relative max-w-xs">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-[#831843]">
                  R$
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  required
                  value={totalPaidInput}
                  onChange={(e) => setTotalPaidInput(e.target.value.replace(/[^\d.,]/g, ''))}
                  placeholder="0,00"
                  className="w-full min-h-[46px] pl-11 pr-4 py-2 text-base font-semibold bg-[#FFF9FB] border border-[#EED2DE] rounded-xl text-[#331824] placeholder:text-[#B18E9C] tabular-nums focus:outline-none focus:border-[#9D2A58]"
                />
              </div>
            </section>

            {/* 03. Serviços realizados */}
            <section className="space-y-2.5 pt-4 border-t border-[#F5E4EC]">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-base font-semibold text-[#331824]">03. Serviços realizados</h2>
                <span className="text-xs text-[#7A5464]">Selecione um ou mais</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {servicesCatalog.map((service) => {
                  const selected = selectedServiceIds.includes(service.id);
                  return (
                    <button
                      key={service.id}
                      type="button"
                      onClick={() => toggleService(service.id)}
                      className={`min-h-[46px] px-3.5 py-2.5 rounded-xl border text-left flex items-center justify-between gap-2.5 transition-colors ${
                        selected
                          ? 'bg-[#FDF2F6] border-[#9D2A58] text-[#831843]'
                          : 'bg-[#FFF9FB] border-[#EFE0E7] text-[#331824] hover:border-[#DFB8C8]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                            selected
                              ? 'bg-[#9D2A58] border-[#9D2A58] text-white'
                              : 'bg-white border-[#D9B6C5]'
                          }`}
                        >
                          {selected && <Check className="w-3.5 h-3.5" />}
                        </span>
                        <span className="text-sm font-medium leading-tight">{service.name}</span>
                      </div>
                      <span className="text-xs sm:text-sm font-semibold tabular-nums shrink-0 text-[#7A5464]">
                        {formatBRL(service.price)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* 04. Adicionais (somente Duda — compacto, sem divisórias ou espaços grandes) */}
            {isDuda && (
              <section className="space-y-2">
                <h2 className="text-sm font-semibold text-[#331824]">Adicionais</h2>
                <div className="flex flex-wrap gap-2">
                  {DUDA_ADDITIONALS.map((item) => {
                    const checked = selectedAdditionals.includes(item);
                    return (
                      <button
                        key={item}
                        type="button"
                        onClick={() => toggleAdditional(item)}
                        className={`min-h-[40px] px-3 py-1.5 rounded-lg border inline-flex items-center gap-2 text-sm transition-colors ${
                          checked
                            ? 'bg-[#FDF2F6] border-[#9D2A58] text-[#831843] font-medium'
                            : 'bg-[#FFF9FB] border-[#EFE0E7] text-[#4D2939] hover:border-[#DFB8C8]'
                        }`}
                      >
                        <span
                          className={`w-4 h-4 rounded-sm border flex items-center justify-center shrink-0 ${
                            checked
                              ? 'bg-[#9D2A58] border-[#9D2A58] text-white'
                              : 'bg-white border-[#D9B6C5]'
                          }`}
                        >
                          {checked && <Check className="w-3 h-3" />}
                        </span>
                        <span>{item}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Próxima manutenção */}
            <section className="space-y-3 pt-4 border-t border-[#F5E4EC]">
              <div>
                <h2 className="text-base font-semibold text-[#331824]">
                  {isDuda ? '05. Próxima manutenção' : '04. Próxima manutenção'}
                </h2>
                <p className="text-sm text-[#5E3A4A] mt-0.5">
                  Deseja deixar seu retorno pré-agendado?
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {returnOptions.map((opt) => {
                  const active = returnOption === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => handleSelectReturnOption(opt.value)}
                      className={`min-h-[46px] px-4 py-2.5 rounded-xl border text-left text-sm font-medium flex items-center gap-2.5 transition-colors ${
                        active
                          ? 'bg-[#9D2A58] border-[#9D2A58] text-white'
                          : 'bg-[#FFF9FB] border-[#EFE0E7] text-[#331824] hover:border-[#DFB8C8]'
                      }`}
                    >
                      <span
                        className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                          active ? 'border-white bg-white/20' : 'border-[#CFA7B8] bg-white'
                        }`}
                      >
                        {active && <span className="w-2 h-2 rounded-full bg-white" />}
                      </span>
                      <span>{opt.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Exibição da data calculada em tamanho grande SOMENTE após selecionar 15, 20 ou 25 dias */}
              {calculatedReturnDate && (
                <div className="mt-4 p-4 sm:p-5 rounded-2xl bg-[#FDF2F6] border border-[#EBC5D5] space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="flex items-center gap-2 text-[#831843]">
                      <Calendar className="w-5 h-5 shrink-0" />
                      <span className="text-sm font-medium">
                        Data prevista para sua manutenção ({selectedReturnMeta?.days} dias):
                      </span>
                    </div>
                    <div className="text-3xl sm:text-4xl font-bold tracking-tight text-[#831843] tabular-nums">
                      {formatDateBR(calculatedReturnDate)}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-[#EBC5D5]/70 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-sm font-semibold text-[#331824]">
                        <Clock className="w-4 h-4 text-[#9D2A58]" />
                        <span>Escolha 3 horários de sua preferência</span>
                      </div>
                      <span className="text-xs font-semibold text-[#831843] tabular-nums">
                        {preferredTimes.length} de 3 selecionados
                      </span>
                    </div>

                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                      {TIME_SLOTS.map((slot) => {
                        const selected = preferredTimes.includes(slot);
                        const disabled = !selected && preferredTimes.length >= 3;
                        return (
                          <button
                            key={slot}
                            type="button"
                            disabled={disabled}
                            onClick={() => toggleTimeSlot(slot)}
                            className={`min-h-[44px] px-2 py-2 rounded-xl border text-sm font-semibold tabular-nums transition-colors ${
                              selected
                                ? 'bg-[#9D2A58] border-[#9D2A58] text-white'
                                : disabled
                                  ? 'bg-white/50 border-[#EFE0E7] text-[#B89CA7] cursor-not-allowed'
                                  : 'bg-white border-[#EBC5D5] text-[#331824] hover:border-[#9D2A58]'
                            }`}
                          >
                            {slot}
                          </button>
                        );
                      })}
                    </div>

                    <p className="text-xs text-[#6E4959] leading-relaxed">
                      O retorno é uma preferência de horário, não uma reserva confirmada.{' '}
                      {isDuda ? 'A Duda' : 'A Laís'} verificará a disponibilidade da agenda e entrará em contato.
                    </p>
                  </div>
                </div>
              )}

              {returnOption === 'to_arrange' && (
                <p className="text-xs text-[#6E4959] bg-[#FFF9FB] border border-[#F3DCE6] rounded-xl px-3.5 py-2.5">
                  Combinaremos o melhor dia com você pelo WhatsApp.
                </p>
              )}
            </section>

            {errorMessage && (
              <div className="p-3.5 rounded-xl bg-[#FFF1F2] border border-[#FECDD3] text-sm font-medium text-[#9F1239]">
                {errorMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full min-h-[52px] px-6 py-3 rounded-2xl bg-[#9D2A58] hover:bg-[#831843] disabled:opacity-60 text-white text-base font-semibold transition-colors shadow-sm"
            >
              {submitting ? 'Confirmando...' : 'Confirmar atendimento'}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
