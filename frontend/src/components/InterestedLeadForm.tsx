import { useMemo, useRef, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import {
  DUDA_SERVICES,
  LAIS_SERVICES,
  SERVICE_CATEGORIES,
  classifyServiceCategory,
  formatBrazilPhone,
  normalizeWhatsAppDigits,
  type Professional,
  type ServiceCategoryId,
} from '../../../shared/catalog';
import type { InterestedLead } from '../../../shared/panelTypes';
import { submitInterestedLead } from '../lib/api';

interface InterestedLeadFormProps {
  onBack: () => void;
}

interface GroupedStudioService {
  id: string;
  label: string;
  professional: Professional;
  category: ServiceCategoryId;
}

function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function InterestedLeadForm({ onBack }: InterestedLeadFormProps) {
  const [name, setName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [acceptsPromotions, setAcceptsPromotions] = useState<boolean | null>(null);

  const [idempotencyKey] = useState<string>(() => generateIdempotencyKey());
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [savedLead, setSavedLead] = useState<InterestedLead | null>(null);

  const groupedCategories = useMemo(() => {
    const allItems: GroupedStudioService[] = [];

    for (const svc of LAIS_SERVICES) {
      const cat = classifyServiceCategory(svc, 'lais');
      if (cat) {
        allItems.push({
          id: svc.id,
          label: svc.name,
          professional: 'lais',
          category: cat,
        });
      }
    }
    for (const svc of DUDA_SERVICES) {
      const cat = classifyServiceCategory(svc, 'duda');
      if (cat) {
        allItems.push({
          id: svc.id,
          label: svc.id === 'duda_manutencao' ? 'Manutenção (alongamento de unhas)' : svc.name,
          professional: 'duda',
          category: cat,
        });
      }
    }

    return SERVICE_CATEGORIES.map((category) => ({
      ...category,
      services: allItems.filter((item) => item.category === category.id),
    })).filter((group) => group.services.length > 0);
  }, []);

  function toggleService(serviceId: string) {
    setErrorMessage('');
    setSelectedServiceIds((prev) =>
      prev.includes(serviceId)
        ? prev.filter((id) => id !== serviceId)
        : [...prev, serviceId]
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submittingRef.current) return;
    setErrorMessage('');

    if (name.trim().length < 2) {
      setErrorMessage('Informe seu nome completo.');
      return;
    }

    const digits = normalizeWhatsAppDigits(whatsapp);
    if (digits.length < 10 || digits.length > 11) {
      setErrorMessage('Informe o WhatsApp com DDD (10 ou 11 dígitos).');
      return;
    }

    if (selectedServiceIds.length === 0) {
      setErrorMessage('Selecione pelo menos um serviço de interesse.');
      return;
    }

    if (acceptsPromotions === null) {
      setErrorMessage(
        'Informe se deseja receber promoções, novidades e ofertas exclusivas pelo WhatsApp.'
      );
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    try {
      const created = await submitInterestedLead({
        name: name.trim(),
        whatsapp,
        serviceIds: selectedServiceIds,
        acceptsPromotions,
        idempotencyKey,
      });
      setSavedLead(created);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Não foi possível concluir o cadastro.'
      );
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  if (savedLead) {
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
              Cadastro realizado!
            </h1>
            <p className="mt-2 text-sm sm:text-base text-text-secondary">
              Obrigada,{' '}
              <strong className="font-semibold text-text-primary">{savedLead.name}</strong>! Seus
              interesses foram registrados com carinho no estúdio MAIS CÍLIOS.
            </p>

            <div className="mt-6 rounded-2xl bg-brand-soft border border-border p-4 text-left space-y-2.5 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-text-secondary">WhatsApp</span>
                <span className="font-semibold text-text-primary tabular-nums">
                  {savedLead.whatsapp}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-text-secondary">Promoções e novidades</span>
                <span className="font-semibold text-brand-strong">
                  {savedLead.acceptsPromotions ? 'Sim, deseja receber' : 'Não deseja receber'}
                </span>
              </div>
              <div className="pt-2 border-t border-border/70">
                <span className="block text-text-secondary mb-1">Serviços de interesse</span>
                <p className="font-medium text-text-primary leading-relaxed">
                  {savedLead.services.map((s) => s.name).join(' · ')}
                </p>
              </div>
            </div>

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
            onClick={onBack}
            className="min-h-[44px] px-2.5 -ml-2 inline-flex items-center gap-1.5 text-sm font-medium rounded-xl transition-colors btn-ghost whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Início</span>
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
          <div>
            <h1 className="font-display text-3xl sm:text-4xl font-semibold text-brand-strong [text-wrap:balance]">
              Cadastrar interessada
            </h1>
            <p className="mt-1 text-sm sm:text-base text-text-secondary">
              Conte para nós quais serviços você tem interesse para que possamos entrar em contato.
            </p>
          </div>

          <form onSubmit={(e) => void handleSubmit(e)} className="mt-6 space-y-6" noValidate>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="interested-name"
                  className="block text-sm font-medium text-text-secondary mb-1.5"
                >
                  Nome <span className="font-semibold text-red-600">(obrigatório)</span>
                </label>
                <input
                  id="interested-name"
                  type="text"
                  autoComplete="name"
                  required
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setErrorMessage('');
                  }}
                  placeholder="Seu nome completo"
                  className="w-full min-h-[50px] px-4 py-2.5 border rounded-2xl field-control text-base"
                />
              </div>

              <div>
                <label
                  htmlFor="interested-whatsapp"
                  className="block text-sm font-medium text-text-secondary mb-1.5"
                >
                  WhatsApp <span className="font-semibold text-red-600">(obrigatório)</span>
                </label>
                <input
                  id="interested-whatsapp"
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

            <div className="space-y-4">
              <div>
                <span className="block text-sm font-medium text-text-secondary">
                  Serviços de interesse{' '}
                  <span className="font-semibold text-red-600">(selecione um ou mais)</span>
                </span>
              </div>

              <div className="space-y-4">
                {groupedCategories.map((category) => (
                  <div
                    key={category.id}
                    className="p-4 rounded-2xl bg-brand-soft/45 border border-border space-y-2.5"
                  >
                    <h2 className="text-xs font-bold uppercase tracking-wider text-brand-strong">
                      {category.label}
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {category.services.map((svc) => {
                        const checked = selectedServiceIds.includes(svc.id);
                        return (
                          <button
                            key={svc.id}
                            type="button"
                            onClick={() => toggleService(svc.id)}
                            aria-pressed={checked}
                            className={`min-h-[46px] px-3.5 py-2 rounded-xl border text-left flex items-center justify-between gap-2.5 transition-colors ${
                              checked ? 'choice-selected font-semibold' : 'choice-idle'
                            }`}
                          >
                            <span className="text-sm leading-tight">{svc.label}</span>
                            <span
                              className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
                                checked
                                  ? 'bg-brand-strong border-brand-strong text-surface'
                                  : 'border-border bg-surface'
                              }`}
                            >
                              {checked && <Check className="w-3.5 h-3.5" />}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 sm:p-5 rounded-2xl bg-brand-soft border border-brand/35 space-y-3">
              <p className="text-sm sm:text-base font-medium text-text-primary">
                Deseja receber promoções, novidades e ofertas exclusivas pelo WhatsApp?
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setAcceptsPromotions(true);
                    setErrorMessage('');
                  }}
                  aria-pressed={acceptsPromotions === true}
                  className={`min-h-[48px] px-4 py-2.5 rounded-2xl border text-sm sm:text-base font-semibold transition-colors ${
                    acceptsPromotions === true ? 'choice-selected' : 'choice-idle'
                  }`}
                >
                  Sim
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAcceptsPromotions(false);
                    setErrorMessage('');
                  }}
                  aria-pressed={acceptsPromotions === false}
                  className={`min-h-[48px] px-4 py-2.5 rounded-2xl border text-sm sm:text-base font-semibold transition-colors ${
                    acceptsPromotions === false ? 'choice-selected' : 'choice-idle'
                  }`}
                >
                  Não
                </button>
              </div>
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
                    <span>Salvando...</span>
                  </>
                ) : (
                  <span>Finalizar cadastro</span>
                )}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
