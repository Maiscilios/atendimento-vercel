import { useMemo, useState } from 'react';
import {
  CalendarPlus,
  CheckCircle2,
  MessageCircle,
  RefreshCw,
  Search,
  Trash2,
  XCircle,
} from 'lucide-react';
import {
  DUDA_SERVICES,
  LAIS_SERVICES,
  SERVICE_CATEGORIES,
  buildWhatsAppLink,
  classifyServiceCategory,
  formatDateBR,
  type ServiceCategoryId,
} from '../../../shared/catalog';
import type { InterestedLead } from '../../../shared/panelTypes';

interface InterestedLeadsTabViewProps {
  leads: InterestedLead[];
  loading: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  categoryFilter: 'all' | ServiceCategoryId;
  onCategoryFilterChange: (value: 'all' | ServiceCategoryId) => void;
  serviceFilter: string;
  onServiceFilterChange: (value: string) => void;
  promotionsFilter: 'all' | 'yes' | 'no';
  onPromotionsFilterChange: (value: 'all' | 'yes' | 'no') => void;
  onRefresh: () => void;
  onScheduleLead: (lead: InterestedLead) => void;
  onDeleteLead: (id: string) => Promise<void>;
}

export function InterestedLeadsTabView({
  leads,
  loading,
  search,
  onSearchChange,
  categoryFilter,
  onCategoryFilterChange,
  serviceFilter,
  onServiceFilterChange,
  promotionsFilter,
  onPromotionsFilterChange,
  onRefresh,
  onScheduleLead,
  onDeleteLead,
}: InterestedLeadsTabViewProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const groupedServiceOptions = useMemo(() => {
    const allServices = [
      ...LAIS_SERVICES.map((svc) => ({
        id: svc.id,
        label: svc.name,
        category: classifyServiceCategory(svc, 'lais'),
      })),
      ...DUDA_SERVICES.map((svc) => ({
        id: svc.id,
        label: svc.id === 'duda_manutencao' ? 'Manutenção (unhas)' : svc.name,
        category: classifyServiceCategory(svc, 'duda'),
      })),
    ];

    return SERVICE_CATEGORIES.map((cat) => ({
      id: cat.id,
      label: cat.label,
      items: allServices.filter((svc) => svc.category === cat.id),
    })).filter((group) => group.items.length > 0);
  }, []);

  const acceptingCount = useMemo(
    () => leads.filter((lead) => lead.acceptsPromotions).length,
    [leads]
  );
  const declinedCount = leads.length - acceptingCount;

  async function handleConfirmDelete(id: string) {
    setDeletingId(id);
    try {
      await onDeleteLead(id);
      setConfirmDeleteId(null);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="bg-surface border border-border rounded-2xl p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-brand absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Buscar nome ou WhatsApp..."
              aria-label="Buscar interessada por nome ou WhatsApp"
              className="w-full min-h-[44px] pl-10 pr-3 py-2 border rounded-xl field-control text-base"
            />
          </div>

          <select
            value={categoryFilter}
            onChange={(e) =>
              onCategoryFilterChange(e.target.value as 'all' | ServiceCategoryId)
            }
            aria-label="Filtrar por categoria de interesse"
            className="min-h-[44px] px-3 py-2 border rounded-xl field-control text-base"
          >
            <option value="all">Todas as categorias</option>
            {SERVICE_CATEGORIES.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.label}
              </option>
            ))}
          </select>

          <select
            value={serviceFilter}
            onChange={(e) => onServiceFilterChange(e.target.value)}
            aria-label="Filtrar por serviço de interesse"
            className="min-h-[44px] px-3 py-2 border rounded-xl field-control text-base"
          >
            <option value="all">Todos os serviços de interesse</option>
            {groupedServiceOptions.map((group) => (
              <optgroup key={group.id} label={group.label}>
                {group.items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>

          <div className="flex items-center gap-2">
            <select
              value={promotionsFilter}
              onChange={(e) =>
                onPromotionsFilterChange(e.target.value as 'all' | 'yes' | 'no')
              }
              aria-label="Filtrar por autorização de promoções"
              className="flex-1 min-w-0 min-h-[44px] px-3 py-2 border rounded-xl field-control text-base"
            >
              <option value="all">Promoções: Todas</option>
              <option value="yes">Aceita promoções (Sim)</option>
              <option value="no">Não aceita (Não)</option>
            </select>

            <button
              type="button"
              onClick={onRefresh}
              aria-label="Atualizar interessadas"
              className="min-h-[44px] px-3.5 py-2 inline-flex items-center gap-1.5 text-xs font-semibold rounded-xl transition-colors btn-secondary shrink-0"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Atualizar</span>
            </button>
          </div>
        </div>

        <div className="pt-2 border-t border-border flex flex-wrap items-center justify-between gap-2 text-xs text-text-secondary">
          <span className="tabular-nums">
            <strong className="text-text-primary">{leads.length}</strong>{' '}
            {leads.length === 1 ? 'interessada cadastrada' : 'interessadas cadastradas'}
            <span className="mx-1.5 text-border">·</span>
            <strong className="text-success">{acceptingCount}</strong>{' '}
            {acceptingCount === 1 ? 'aceita promoções' : 'aceitam promoções'}
            <span className="mx-1.5 text-border">·</span>
            <strong className="text-text-primary">{declinedCount}</strong>{' '}
            {declinedCount === 1 ? 'não aceita' : 'não aceitam'}
          </span>
          <span>Cadastros de interessadas não entram no faturamento nem em atendimentos.</span>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-text-secondary">
            Carregando interessadas...
          </div>
        ) : leads.length === 0 ? (
          <div className="p-8 text-center space-y-1.5">
            <p className="text-base font-medium text-text-primary">
              Nenhuma interessada encontrada
            </p>
            <p className="text-sm text-text-secondary">
              Os cadastros feitos pela opção “Cadastrar interessada” aparecerão aqui.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {leads.map((lead) => {
              const serviceSummary = lead.services
                .map((s) => (s.id === 'duda_manutencao' ? 'Manutenção (unhas)' : s.name))
                .join(', ');
              const whatsappMsg = `Olá ${lead.name}! Aqui é do estúdio MAIS CÍLIOS. Vi seu interesse em ${serviceSummary} e gostaria de conversar com você!`;

              return (
                <div
                  key={lead.id}
                  className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-background transition-colors"
                >
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      <h3 className="text-base font-semibold text-text-primary">
                        {lead.name}
                      </h3>
                      <span aria-hidden="true" className="text-border">
                        ·
                      </span>
                      <span className="text-xs text-text-secondary tabular-nums">
                        Cadastro em {formatDateBR(lead.createdAt.slice(0, 10))}
                      </span>
                      <span aria-hidden="true" className="text-border">
                        ·
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-semibold ${
                          lead.acceptsPromotions ? 'text-success' : 'text-text-secondary'
                        }`}
                      >
                        {lead.acceptsPromotions ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            <span>Aceita promoções no WhatsApp</span>
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3.5 h-3.5 shrink-0" />
                            <span>Não deseja promoções</span>
                          </>
                        )}
                      </span>
                    </div>

                    <p className="text-sm text-text-secondary">
                      Serviços de interesse:{' '}
                      <strong className="text-text-primary">{serviceSummary}</strong>
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <a
                      href={buildWhatsAppLink(lead.whatsapp, whatsappMsg)}
                      target="_blank"
                      rel="noreferrer"
                      className="min-h-[42px] px-3.5 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-1.5 transition-colors tabular-nums btn-success-soft"
                    >
                      <MessageCircle className="w-4 h-4" />
                      <span>{lead.whatsapp}</span>
                    </a>

                    <button
                      type="button"
                      onClick={() => onScheduleLead(lead)}
                      className="min-h-[42px] px-3.5 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-1.5 transition-colors btn-primary"
                    >
                      <CalendarPlus className="w-4 h-4" />
                      <span>Agendar</span>
                    </button>

                    {confirmDeleteId === lead.id ? (
                      <div className="inline-flex items-center gap-1.5 bg-error-soft border border-error-border rounded-xl px-2.5 py-1.5">
                        <button
                          type="button"
                          disabled={deletingId === lead.id}
                          onClick={() => void handleConfirmDelete(lead.id)}
                          className="px-2.5 py-1 rounded-lg text-xs font-semibold btn-danger-solid"
                        >
                          {deletingId === lead.id ? 'Excluindo...' : 'Excluir'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-surface border border-border text-text-secondary"
                        >
                          Voltar
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(lead.id)}
                        aria-label={`Excluir cadastro de ${lead.name}`}
                        className="min-h-[42px] min-w-[42px] px-2.5 py-2 rounded-xl text-xs font-semibold inline-flex items-center justify-center transition-colors btn-danger"
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
  );
}
