import { useEffect, useState } from 'react';
import { CalendarPlus, Clock, X } from 'lucide-react';
import {
  formatBrazilPhone,
  formatDateBR,
  getBrazilTodayISO,
  getReturnOptionLabel,
  getServicesCatalog,
  type AttendanceRecord,
  type Professional,
} from '../../../shared/catalog';
import type { AgendaAppointment } from '../../../shared/panelTypes';
import {
  confirmAdminAgendaRequest,
  confirmDudaAgendaRequest,
  createAdminAgendaAppointment,
  createDudaAgendaAppointment,
  updateAdminAgendaAppointment,
  updateDudaAgendaAppointment,
} from '../lib/api';

export type AgendaBookingModalState =
  | { kind: 'closed' }
  | {
      kind: 'create';
      professional: Professional;
      initialDate: string;
      initialClientName?: string;
      initialWhatsapp?: string;
    }
  | { kind: 'edit'; appointment: AgendaAppointment }
  | { kind: 'confirm-request'; request: AttendanceRecord };

interface AgendaBookingModalProps {
  state: AgendaBookingModalState;
  isAdmin: boolean;
  onClose: () => void;
  onSaved: (result: {
    appointment: AgendaAppointment;
    updatedAttendance?: AttendanceRecord;
    message: string;
  }) => void;
}

export function formatTimeInputHHMM(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

export function isValidHHMM(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value.trim());
}

export function AgendaBookingModal({
  state,
  isAdmin,
  onClose,
  onSaved,
}: AgendaBookingModalProps) {
  const [clientName, setClientName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [selectedServiceNames, setSelectedServiceNames] = useState<string[]>([]);
  const [customProcedure, setCustomProcedure] = useState('');
  const [appointmentDate, setAppointmentDate] = useState(() => getBrazilTodayISO());
  const [appointmentTime, setAppointmentTime] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const activeProfessional: Professional =
    state.kind === 'create'
      ? state.professional
      : state.kind === 'edit'
        ? state.appointment.professional
        : state.kind === 'confirm-request'
          ? state.request.professional
          : 'duda';

  const catalog = getServicesCatalog(activeProfessional);

  useEffect(() => {
    if (state.kind === 'closed') return;
    setError('');
    setSubmitting(false);

    if (state.kind === 'create') {
      setClientName(state.initialClientName ?? '');
      setWhatsapp(
        state.initialWhatsapp ? formatBrazilPhone(state.initialWhatsapp) : ''
      );
      setSelectedServiceNames([]);
      setCustomProcedure('');
      setAppointmentDate(state.initialDate || getBrazilTodayISO());
      setAppointmentTime('');
      setNotes('');
    } else if (state.kind === 'edit') {
      const appt = state.appointment;
      setClientName(appt.clientName);
      setWhatsapp(appt.whatsapp);
      setAppointmentDate(appt.appointmentDate);
      setAppointmentTime(appt.appointmentTime);
      setNotes(appt.notes);

      const parts = appt.procedureName
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);
      const catalogNames = new Set(getServicesCatalog(appt.professional).map((s) => s.name));
      const matched: string[] = [];
      const leftovers: string[] = [];
      for (const part of parts) {
        if (catalogNames.has(part)) matched.push(part);
        else leftovers.push(part);
      }
      setSelectedServiceNames(matched);
      setCustomProcedure(leftovers.join(', '));
    } else if (state.kind === 'confirm-request') {
      const req = state.request;
      setClientName(req.clientName);
      setWhatsapp(req.whatsapp);
      setAppointmentDate(req.returnDate || getBrazilTodayISO());
      setAppointmentTime('');
      setNotes('');

      const catalogNames = new Set(getServicesCatalog(req.professional).map((s) => s.name));
      const matched = req.services
        .map((s) => s.name)
        .filter((name) => catalogNames.has(name));
      const unmatched = req.services
        .map((s) => s.name)
        .filter((name) => !catalogNames.has(name));
      setSelectedServiceNames(matched);
      setCustomProcedure(unmatched.join(', '));
    }
  }, [state]);

  if (state.kind === 'closed') return null;

  function toggleService(name: string) {
    setSelectedServiceNames((prev) =>
      prev.includes(name) ? prev.filter((item) => item !== name) : [...prev, name]
    );
  }

  function buildCombinedProcedure(): string {
    const items = [...selectedServiceNames];
    const extra = customProcedure.trim();
    if (extra.length > 0) {
      items.push(extra);
    }
    return items.join(', ');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (state.kind !== 'confirm-request') {
      if (clientName.trim().length < 2) {
        setError('Informe o nome completo da cliente.');
        return;
      }
      if (whatsapp.replace(/\D/g, '').length < 10) {
        setError('Informe o WhatsApp com DDD (10 ou 11 dígitos).');
        return;
      }
    }

    const procedureName = buildCombinedProcedure();
    if (procedureName.trim().length < 2) {
      setError('Selecione pelo menos um procedimento ou informe o serviço.');
      return;
    }

    if (!appointmentDate) {
      setError('Selecione a data do agendamento.');
      return;
    }

    const normalizedTime = appointmentTime.trim();
    if (!isValidHHMM(normalizedTime)) {
      setError('Digite o horário definitivo no formato HH:MM (ex: 14:30).');
      return;
    }

    setSubmitting(true);
    try {
      if (state.kind === 'confirm-request') {
        const res = isAdmin
          ? await confirmAdminAgendaRequest(state.request.id, {
              appointmentDate,
              appointmentTime: normalizedTime,
              procedureName,
              notes: notes.trim(),
            })
          : await confirmDudaAgendaRequest(state.request.id, {
              appointmentDate,
              appointmentTime: normalizedTime,
              procedureName,
              notes: notes.trim(),
            });

        onSaved({
          appointment: res.appointment,
          updatedAttendance: res.attendance,
          message: `Agendamento de ${res.appointment.clientName} confirmado em ${formatDateBR(res.appointment.appointmentDate)} às ${res.appointment.appointmentTime}.`,
        });
      } else if (state.kind === 'create') {
        const payload = {
          clientName: clientName.trim(),
          whatsapp: whatsapp.trim(),
          procedureName,
          appointmentDate,
          appointmentTime: normalizedTime,
          notes: notes.trim(),
        };
        const created = isAdmin
          ? await createAdminAgendaAppointment({
              ...payload,
              professional: state.professional,
            })
          : await createDudaAgendaAppointment(payload);

        onSaved({
          appointment: created,
          message: `Agendamento adicionado para ${created.clientName} em ${formatDateBR(created.appointmentDate)} às ${created.appointmentTime}.`,
        });
      } else if (state.kind === 'edit') {
        const payload = {
          clientName: clientName.trim(),
          whatsapp: whatsapp.trim(),
          procedureName,
          appointmentDate,
          appointmentTime: normalizedTime,
          notes: notes.trim(),
        };
        const updated = isAdmin
          ? await updateAdminAgendaAppointment(state.appointment.id, payload)
          : await updateDudaAgendaAppointment(state.appointment.id, payload);

        onSaved({
          appointment: updated,
          message: `Agendamento de ${updated.clientName} atualizado para ${formatDateBR(updated.appointmentDate)} às ${updated.appointmentTime}.`,
        });
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Não foi possível confirmar o agendamento.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  const profLabel = activeProfessional === 'duda' ? 'Duda' : 'Laís';

  return (
    <div
      className="fixed inset-0 z-50 bg-overlay/45 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-labelledby="agenda-booking-title"
      aria-modal="true"
    >
      <div className="w-full sm:max-w-xl bg-surface rounded-t-3xl sm:rounded-3xl border border-border shadow-dialog overflow-hidden max-h-[94vh] flex flex-col">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between bg-background">
          <div>
            <h3 id="agenda-booking-title" className="font-display text-2xl font-bold text-brand-strong">
              {state.kind === 'confirm-request'
                ? 'Adicionar à agenda'
                : state.kind === 'edit'
                  ? 'Editar / Remarcar agendamento'
                  : 'Novo agendamento'}
            </h3>
            <p className="text-xs text-text-secondary">
              Agenda da {profLabel} · Horário de Brasília
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar janela"
            className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center btn-ghost"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="p-5 space-y-4 overflow-y-auto">
          {error && (
            <div className="p-3 rounded-xl bg-error-soft border border-error-border text-sm text-error">
              {error}
            </div>
          )}

          {state.kind === 'confirm-request' && (
            <div className="p-3.5 rounded-2xl bg-brand-soft border border-border space-y-1 text-xs text-text-secondary">
              <p className="font-semibold text-brand-strong">
                Solicitação de retorno ({getReturnOptionLabel(state.request.returnOption)})
              </p>
              {state.request.preferredTimes.length > 0 && (
                <p className="tabular-nums">
                  Preferências informadas pela cliente:{' '}
                  <strong>{state.request.preferredTimes.join(' · ')}</strong>
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1" htmlFor="agendabookingmodal-field-1">
                Nome da cliente
              </label>
              <input
                type="text"
                required
                readOnly={state.kind === 'confirm-request'}
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Nome completo"
                className={`field-control w-full min-h-[44px] px-3.5 py-2 text-base border rounded-xl ${
                  state.kind === 'confirm-request' ? 'bg-brand-soft' : 'bg-surface'
                }`} id="agendabookingmodal-field-1"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1" htmlFor="agendabookingmodal-field-2">
                WhatsApp
              </label>
              <input
                type="tel"
                required
                readOnly={state.kind === 'confirm-request'}
                value={whatsapp}
                onChange={(e) => setWhatsapp(formatBrazilPhone(e.target.value))}
                placeholder="(00) 00000-0000"
                className={`field-control w-full min-h-[44px] px-3.5 py-2 text-base border rounded-xl tabular-nums ${
                  state.kind === 'confirm-request' ? 'bg-brand-soft' : 'bg-surface'
                }`} id="agendabookingmodal-field-2"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1" htmlFor="agendabookingmodal-field-3">
                Data do atendimento
              </label>
              <input
                type="date"
                required
                value={appointmentDate}
                onChange={(e) => e.target.value && setAppointmentDate(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2 font-semibold border rounded-xl tabular-nums field-control text-base" id="agendabookingmodal-field-3"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1" htmlFor="agendabookingmodal-field-4">
                Horário definitivo (HH:MM)
              </label>
              <div className="relative">
                <Clock className="w-4 h-4 text-brand absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  inputMode="numeric"
                  required
                  maxLength={5}
                  value={appointmentTime}
                  onChange={(e) => setAppointmentTime(formatTimeInputHHMM(e.target.value))}
                  placeholder="Ex: 14:30"
                  className="w-full min-h-[44px] pl-10 pr-3.5 py-2 font-semibold border rounded-xl tabular-nums field-control text-base" id="agendabookingmodal-field-4"
                />
              </div>
              <span className="mt-1 block text-[11px] text-text-secondary">
                Digite manualmente no formato 24h (ex: 09:00, 14:30)
              </span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-secondary mb-1.5" htmlFor="agendabookingmodal-field-5">
              Serviço / procedimento ({profLabel})
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {catalog.map((svc) => {
                const checked = selectedServiceNames.includes(svc.name);
                return (
                  <label
                    key={svc.id}
                    className={`min-h-[42px] px-3 py-2 rounded-xl border text-xs sm:text-sm flex items-center gap-2.5 cursor-pointer transition-colors ${
                      checked
                        ? 'choice-selected font-semibold'
                        : 'choice-idle'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleService(svc.name)}
                      className="w-4 h-4 accent-brand-strong rounded" id="agendabookingmodal-field-5"
                    />
                    <span className="leading-tight">{svc.name}</span>
                  </label>
                );
              })}
            </div>

            <input
              type="text"
              value={customProcedure}
              onChange={(e) => setCustomProcedure(e.target.value)}
              placeholder="Outro serviço ou observação do procedimento (opcional)"
              className="mt-2 w-full min-h-[44px] px-3.5 py-2 border rounded-xl field-control text-base"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-secondary mb-1" htmlFor="agendabookingmodal-field-6">
              Observações (opcional)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Detalhes adicionais sobre o horário ou atendimento..."
              className="w-full px-3.5 py-2 border rounded-xl field-control text-base" id="agendabookingmodal-field-6"
            />
          </div>

          <div className="pt-2 flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[46px] px-4 py-2 rounded-xl text-sm font-semibold btn-secondary"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 min-h-[46px] px-4 py-2 rounded-xl disabled:opacity-50 text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors btn-primary"
            >
              <CalendarPlus className="w-4 h-4" />
              <span>
                {submitting
                  ? 'Salvando...'
                  : state.kind === 'edit'
                    ? 'Salvar alterações'
                    : 'Confirmar e adicionar à agenda'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
