import { Calendar, MessageCircle, X } from 'lucide-react';
import {
  buildWhatsAppLink,
  formatBRL,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#331824]/45 backdrop-blur-xs">
      <div className="w-full max-w-2xl max-h-[88vh] flex flex-col bg-white border border-[#F1D8E2] rounded-3xl shadow-xl overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-[#F5E4EC] flex items-start justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#9D2A58]">
              Cadastro da Cliente
            </span>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#331824] truncate">
              {client.clientName}
            </h2>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1">
              <a
                href={buildWhatsAppLink(client.whatsapp)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#15803D] hover:underline tabular-nums"
              >
                <MessageCircle className="w-4 h-4" />
                <span>{client.whatsapp}</span>
              </a>
              <span className="text-xs text-[#7A5464] tabular-nums">
                {client.totalVisits}{' '}
                {client.totalVisits === 1 ? 'atendimento' : 'atendimentos'}
              </span>
              <span className="text-xs text-[#7A5464] tabular-nums">
                Total em serviços: <strong className="text-[#331824]">{formatBRL(client.totalSpent)}</strong>
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar cadastro"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-[#7A5464] hover:bg-[#FDF2F6] transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 sm:p-6 overflow-y-auto space-y-3">
          <h3 className="text-sm font-semibold text-[#4D2939]">
            Histórico completo de atendimentos
          </h3>

          {client.attendances.map((att) => (
            <div
              key={att.id}
              className="p-4 rounded-2xl bg-[#FFF9FB] border border-[#F3DCE6] space-y-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-[#831843]">
                  <Calendar className="w-3.5 h-3.5" />
                  <span className="tabular-nums">{formatDateBR(att.serviceDate)}</span>
                  {showProfessionalBadge && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{att.professional === 'lais' ? 'Laís' : 'Duda'}</span>
                    </>
                  )}
                </div>
                <span className="text-sm font-bold text-[#331824] tabular-nums">
                  {formatBRL(att.totalPaid)}
                </span>
              </div>

              <p className="text-sm text-[#331824]">
                {att.services.map((s) => s.name).join(' · ')}
              </p>

              {att.additionals.length > 0 && (
                <p className="text-xs text-[#7A5464]">
                  Adicionais: {att.additionals.join(', ')}
                </p>
              )}

              {att.returnOption !== 'no_schedule' && (
                <div className="pt-1 text-xs text-[#5E3A4A] flex flex-wrap items-center gap-x-3 gap-y-1">
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

        <div className="p-4 sm:px-6 border-t border-[#F5E4EC] bg-[#FFF9FB] flex items-center justify-between gap-3">
          <a
            href={buildWhatsAppLink(
              client.whatsapp,
              `Olá ${client.clientName}! Aqui é do estúdio MAIS CÍLIOS.`
            )}
            target="_blank"
            rel="noreferrer"
            className="min-h-[42px] px-4 py-2 rounded-xl bg-[#ECFDF3] hover:bg-[#DCFCE7] border border-[#BBF7D0] text-[#15803D] text-sm font-semibold inline-flex items-center gap-2 transition-colors"
          >
            <MessageCircle className="w-4 h-4" />
            <span>Conversar no WhatsApp</span>
          </a>

          <button
            type="button"
            onClick={onClose}
            className="min-h-[42px] px-5 py-2 rounded-xl bg-[#9D2A58] hover:bg-[#831843] text-white text-sm font-semibold transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
