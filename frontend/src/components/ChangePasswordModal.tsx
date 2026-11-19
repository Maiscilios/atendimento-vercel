import { useState, type FormEvent } from 'react';
import { X, Lock, CheckCircle2 } from 'lucide-react';
import { changePasswordRequest } from '../lib/api';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  userName: string;
}

export function ChangePasswordModal({ isOpen, onClose, userName }: ChangePasswordModalProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess(false);

    if (newPassword.trim().length < 6) {
      setError('A nova senha deve ter no mínimo 6 caracteres.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('A confirmação da nova senha não confere.');
      return;
    }

    setLoading(true);
    try {
      await changePasswordRequest(currentPassword, newPassword);
      setSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível alterar a senha.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="change-password-title" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-overlay/40 backdrop-blur-xs">
      <div className="w-full max-w-md bg-surface border border-border rounded-3xl p-6 shadow-dialog">
        <div className="flex items-center justify-between gap-4 pb-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <Lock className="w-5 h-5 text-brand" />
            <h2 id="change-password-title" className="text-lg font-semibold text-text-primary">
              Alterar senha — {userName}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl transition-colors btn-ghost"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {error && (
            <div className="p-3 text-sm text-error bg-error-soft border border-error-border rounded-xl">
              {error}
            </div>
          )}

          {success && (
            <div className="flex items-center gap-2 p-3 text-sm text-success bg-success-soft border border-success-border rounded-xl">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Senha atualizada com sucesso.</span>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5" htmlFor="changepasswordmodal-field-1">
              Senha atual
            </label>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2.5 border rounded-xl field-control text-base"
              placeholder="Digite sua senha atual" id="changepasswordmodal-field-1"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5" htmlFor="changepasswordmodal-field-2">
              Nova senha (mínimo 6 caracteres)
            </label>
            <input
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2.5 border rounded-xl field-control text-base"
              placeholder="Digite a nova senha" id="changepasswordmodal-field-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5" htmlFor="changepasswordmodal-field-3">
              Confirmar nova senha
            </label>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2.5 border rounded-xl field-control text-base"
              placeholder="Repita a nova senha" id="changepasswordmodal-field-3"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 py-2 text-sm font-medium rounded-xl transition-colors btn-ghost"
            >
              Fechar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="min-h-[44px] px-5 py-2 text-sm font-semibold disabled:opacity-50 rounded-xl transition-colors btn-primary"
            >
              {loading ? 'Salvando...' : 'Salvar nova senha'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
