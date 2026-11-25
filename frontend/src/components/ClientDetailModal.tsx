import { Calendar, MessageCircle, X } from 'lucide-react';
import {
  buildWhatsAppLink,
  formatBRL,
  formatBrazilTimeBR,
  formatDateBR,
  getReturnOptionLabel,
  getReturnStatusLabel,
} from '../../../shared/catalog';
import type { PanelClientSummary } from '../../../shared/panelTypes';

interface ClientDetailModalProps {
  client: PanelClientSummary | null;
  onClose: () => void;
  showProfessionalBadge?: boolean;
}

export function ClientDetailModal({
  client,
  onClose,
  showProfessionalBadge = false,
}: ClientDetailModalProps) {
  if (!client) return null;

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="client-detail-title" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-overlay/45 backdrop-blur-xs">
      <div className="w-full max-w-2xl max-h-[88vh] flex flex-col bg-surface border border-border rounded-3xl shadow-dialog overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-border flex items-start justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <span className="text-xs font-semibold uppercase tracking-wider text-brand-strong">
              Cadastro da Cliente
            </span>
            <h2 id="client-detail-title" className="font-display text-2xl sm:text-3xl font-bold text-text-primary truncate">
              {client.clientName}
            </h2>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1">
              <a
                href={buildWhatsAppLink(
                  client.whatsapp,
                  `Olá ${client.clientName}! Aqui é do estúdio MAIS CÍLIOS.`
                )}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-success hover:underline tabular-nums"
              >
                <MessageCircle className="w-4 h-4" />
                <span>{client.whatsapp}</span>
              </a>
              <span className="text-xs text-text-secondary tabular-nums">
                Último atendimento:{' '}
                <strong className="text-text-primary">{formatDateBR(client.lastVisitDate)}</strong>
              </span>
              <span className="text-xs text-text-secondary tabular-nums">
                {client.totalVisits}{' '}
                {client.totalVisits === 1 ? 'atendimento' : 'atendimentos'}
              </span>
              <span className="text-xs text-text-secondary tabular-nums">
                Total em serviços: <strong className="text-text-primary">{formatBRL(client.totalSpent)}</strong>
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar cadastro"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl transition-colors shrink-0 btn-ghost"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 sm:p-6 overflow-y-auto space-y-4" tabIndex={0} role="region" aria-label="Histórico da cliente">
          {((client.performedProcedures && client.performedProcedures.length > 0) ||
            client.nextAppointment) && (
            <div className="p-4 rounded-2xl bg-brand-soft/65 border border-brand/30 space-y-2.5">
              {client.performedProcedures && client.performedProcedures.length > 0 && (
                <div className="text-xs text-text-secondary">
                  <span className="font-semibold text-brand-strong block mb-0.5">
                    Procedimentos realizados
                  </span>
                  <p className="text-sm text-text-primary">
                    {client.performedProcedures.join(' · ')}
                  </p>
                </div>
              )}
              {client.nextAppointment && (
                <div className="pt-2 border-t border-brand/25 text-xs text-brand-strong">
                  <span className="font-semibold block mb-0.5">Próximo agendamento</span>
                  <p className="text-sm font-semibold text-text-primary tabular-nums">
                    {formatDateBR(client.nextAppointment.appointmentDate)} às{' '}
                    {client.nextAppointment.appointmentTime} ·{' '}
                    {client.nextAppointment.procedureName}
                    {showProfessionalBadge && (
                      <> ({client.nextAppointment.professional === 'lais' ? 'Laís' : 'Duda'})</>
                    )}
                  </p>
                </div>
              )}
            </div>
          )}

          <h3 className="text-sm font-semibold text-text-primary">
            Histórico completo de atendimentos
          </h3>

          {client.attendances.map((att) => (
            <div
              key={att.id}
              className="p-4 rounded-2xl bg-background border border-border space-y-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-brand-strong">
                  <Calendar className="w-3.5 h-3.5" />
                  <span className="tabular-nums">
                    {formatDateBR(att.serviceDate)} às{' '}
                    {formatBrazilTimeBR(att.createdAt)}
                  </span>
                  {showProfessionalBadge && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{att.professional === 'lais' ? 'Laís' : 'Duda'}</span>
                    </>
                  )}
                </div>
                <span className="text-sm font-bold metric-value tabular-nums">
                  {formatBRL(att.totalPaid)}
                </span>
              </div>

              <p className="text-sm text-text-primary">
                {att.services.map((s) => s.name).join(' · ')}
              </p>

              {att.additionals.length > 0 && (
                <p className="text-xs text-text-secondary">
                  Adicionais: {att.additionals.join(', ')}
                </p>
              )}

              {att.returnOption !== 'no_schedule' && (
                <div className="pt-1 text-xs text-text-secondary flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span>
                    Retorno: <strong>{getReturnOptionLabel(att.returnOption)}</strong>
                  </span>
                  {att.returnDate && (
                    <span className="tabular-nums">
                      Previsto: <strong>{formatDateBR(att.returnDate)}</strong>
                    </span>
                  )}
                  {att.preferredTimes.length > 0 && (
                    <span className="tabular-nums">
                      Horários: <strong>{att.preferredTimes.join(', ')}</strong>
                    </span>
                  )}
                  <span>
                    Situação: <strong>{getReturnStatusLabel(att.returnStatus)}</strong>
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="p-4 sm:px-6 border-t border-border bg-background flex items-center justify-between gap-3">
          <a
            href={buildWhatsAppLink(
              client.whatsapp,
              `Olá ${client.clientName}! Aqui é do estúdio MAIS CÍLIOS.`
            )}
            target="_blank"
            rel="noreferrer"
            className="min-h-[42px] px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2 transition-colors btn-success-soft"
          >
            <MessageCircle className="w-4 h-4" />
            <span>Conversar no WhatsApp</span>
          </a>

          <button
            type="button"
            onClick={onClose}
            className="min-h-[42px] px-5 py-2 rounded-xl text-sm font-semibold transition-colors btn-primary"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
