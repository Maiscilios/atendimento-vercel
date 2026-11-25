import { useMemo, useState } from 'react';
import {
  Calendar,
  CalendarPlus,
  History,
  MessageCircle,
  Search,
  Sparkles,
} from 'lucide-react';
import {
  SERVICE_CATEGORIES,
  buildWhatsAppLink,
  formatDateBR,
  type Professional,
  type ServiceCategoryId,
} from '../../../shared/catalog';
import {
  formatDaysSinceLastVisitBR,
  type PanelClientSummary,
} from '../../../shared/panelTypes';

type CategoryFilter = 'all' | ServiceCategoryId;

interface ClientsTabViewProps {
  clients: PanelClientSummary[];
  loading: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  brazilToday: string;
  onSelectClient: (client: PanelClientSummary) => void;
  onScheduleClient: (client: PanelClientSummary) => void;
  showProfessionalFilter?: boolean;
  professionalFilter?: 'all' | Professional;
  onProfessionalFilterChange?: (prof: 'all' | Professional) => void;
  emptySubtitle?: string;
}

export function ClientsTabView({
  clients,
  loading,
  search,
  onSearchChange,
  brazilToday,
  onSelectClient,
  onScheduleClient,
  showProfessionalFilter = false,
  professionalFilter = 'all',
  onProfessionalFilterChange,
  emptySubtitle = 'As clientes aparecerão aqui automaticamente conforme os atendimentos forem confirmados.',
}: ClientsTabViewProps) {
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>('all');

  const categoryCounts = useMemo(() => {
    const counts: Record<CategoryFilter, number> = {
      all: clients.length,
      extensao_cilios: 0,
      sobrancelhas: 0,
      epilacao_facial_buco: 0,
      alongamento_unhas: 0,
      manicure_pedicure: 0,
      procedimentos_gel: 0,
      spa_pes: 0,
    };

    for (const client of clients) {
      for (const catId of client.serviceCategories ?? []) {
        counts[catId] = (counts[catId] ?? 0) + 1;
      }
    }

    return counts;
  }, [clients]);

  const filteredClients = useMemo(() => {
    if (selectedCategory === 'all') return clients;
    return clients.filter((client) =>
      (client.serviceCategories ?? []).includes(selectedCategory),
    );
  }, [clients, selectedCategory]);

  const categoryOptions: Array<{ id: CategoryFilter; label: string }> = [
    { id: 'all', label: 'Todas as clientes' },
    ...SERVICE_CATEGORIES,
  ];

  return (
    <div className="space-y-4">
      <div className="bg-surface border border-border rounded-2xl p-4 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-1">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-brand absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Pesquisar cliente por nome ou telefone..."
                className="w-full min-h-[44px] pl-10 pr-4 py-2 border rounded-xl field-control text-base"
              />
            </div>

            {showProfessionalFilter && onProfessionalFilterChange && (
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
                    onClick={() => onProfessionalFilterChange(opt.id)}
                    className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                      professionalFilter === opt.id ? 'tab-active' : 'tab-idle'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <span className="text-xs font-medium text-text-secondary tabular-nums">
            Exibindo {filteredClients.length}{' '}
            {filteredClients.length === 1 ? 'cliente' : 'clientes'}
          </span>
        </div>

        {/* Categorias de serviços */}
        <div
          className="flex flex-wrap gap-2 pt-2 border-t border-border"
          role="tablist"
          aria-label="Filtrar clientes por categoria de serviço"
        >
          {categoryOptions.map((cat) => {
            const active = selectedCategory === cat.id;
            const count = categoryCounts[cat.id] ?? 0;
            return (
              <button
                key={cat.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSelectedCategory(cat.id)}
                className={`min-h-[38px] px-3 py-1.5 rounded-xl border text-xs font-semibold inline-flex items-center gap-2 transition-colors ${
                  active
                    ? 'bg-brand-strong text-surface border-brand-strong'
                    : 'bg-background text-text-primary border-border hover:bg-brand-soft/70'
                }`}
              >
                <span>{cat.label}</span>
                <span
                  className={`px-1.5 py-0.5 rounded-md text-[11px] font-bold tabular-nums leading-none ${
                    active
                      ? 'bg-surface/20 text-surface'
                      : 'bg-brand-soft text-brand-strong'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-text-secondary">
            Carregando clientes...
          </div>
        ) : filteredClients.length === 0 ? (
          <div className="p-8 text-center space-y-1.5">
            <p className="text-base font-medium text-text-primary">
              Nenhuma cliente encontrada
            </p>
            <p className="text-sm text-text-secondary">{emptySubtitle}</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filteredClients.map((client) => {
              const procedures = client.performedProcedures ?? [];
              const nextAppt = client.nextAppointment;
              return (
                <div
                  key={client.key}
                  className="p-4 sm:px-5 flex flex-col lg:flex-row lg:items-start justify-between gap-4 hover:bg-background/70 transition-colors"
                >
                  <div className="space-y-2.5 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => onSelectClient(client)}
                        className="text-left text-base font-bold text-brand-strong hover:underline"
                      >
                        {client.clientName}
                      </button>

                      {showProfessionalFilter && client.professionals.length > 0 && (
                        <span className="px-2 py-0.5 rounded-md bg-brand-soft border border-brand/30 text-[11px] font-semibold text-brand-strong">
                          {client.professionals
                            .map((p) => (p === 'lais' ? 'Laís' : 'Duda'))
                            .join(' e ')}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-secondary tabular-nums">
                      <span>
                        Último atendimento:{' '}
                        <strong className="text-text-primary">
                          {formatDateBR(client.lastVisitDate)}
                        </strong>
                      </span>
                      <span className="font-semibold text-brand-strong">
                        {formatDaysSinceLastVisitBR(client.lastVisitDate, brazilToday)}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        Histórico:{' '}
                        <strong className="text-text-primary">
                          {client.totalVisits}{' '}
                          {client.totalVisits === 1 ? 'atendimento' : 'atendimentos'}
                        </strong>
                      </span>
                    </div>

                    {procedures.length > 0 && (
                      <div className="flex items-start gap-1.5 text-xs text-text-secondary">
                        <Sparkles className="w-3.5 h-3.5 text-brand shrink-0 mt-0.5" />
                        <p className="leading-relaxed">
                          <span className="font-semibold text-text-primary">
                            Procedimentos realizados:
                          </span>{' '}
                          {procedures.join(' · ')}
                        </p>
                      </div>
                    )}

                    {nextAppt && (
                      <div className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-1.5 rounded-xl bg-brand-soft/80 border border-brand/35 text-xs text-brand-strong">
                        <Calendar className="w-3.5 h-3.5 shrink-0" />
                        <span className="font-semibold">Próximo agendamento:</span>
                        <span className="tabular-nums font-bold">
                          {formatDateBR(nextAppt.appointmentDate)} às{' '}
                          {nextAppt.appointmentTime}
                        </span>
                        <span className="text-text-primary">
                          · {nextAppt.procedureName}
                          {showProfessionalFilter && (
                            <> ({nextAppt.professional === 'lais' ? 'Laís' : 'Duda'})</>
                          )}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <a
                      href={buildWhatsAppLink(
                        client.whatsapp,
                        `Olá ${client.clientName}! Aqui é do estúdio MAIS CÍLIOS.`,
                      )}
                      target="_blank"
                      rel="noreferrer"
                      className="min-h-[40px] px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 transition-colors tabular-nums btn-success-soft"
                    >
                      <MessageCircle className="w-4 h-4" />
                      <span>{client.whatsapp}</span>
                    </a>

                    <button
                      type="button"
                      onClick={() => onSelectClient(client)}
                      className="min-h-[40px] px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 transition-colors btn-secondary"
                    >
                      <History className="w-4 h-4" />
                      <span>Histórico ({client.totalVisits})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onScheduleClient(client)}
                      className="min-h-[40px] px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 transition-colors btn-primary"
                    >
                      <CalendarPlus className="w-4 h-4" />
                      <span>Agendar</span>
                    </button>
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
