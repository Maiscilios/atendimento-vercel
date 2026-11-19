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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#331824]/40 backdrop-blur-xs">
      <div className="w-full max-w-md bg-white border border-[#F1D8E2] rounded-3xl p-6 shadow-xl">
        <div className="flex items-center justify-between gap-4 pb-4 border-b border-[#F5E4EC]">
          <div className="flex items-center gap-2.5">
            <Lock className="w-5 h-5 text-[#9D2A58]" />
            <h2 className="text-lg font-semibold text-[#331824]">
              Alterar senha — {userName}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-[#7A5464] hover:bg-[#FDF2F6] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {error && (
            <div className="p-3 text-sm text-[#9F1239] bg-[#FFF1F2] border border-[#FECDD3] rounded-xl">
              {error}
            </div>
          )}

          {success && (
            <div className="flex items-center gap-2 p-3 text-sm text-[#166534] bg-[#F0FDF4] border border-[#BBF7D0] rounded-xl">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Senha atualizada com sucesso.</span>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-[#4D2939] mb-1.5">
              Senha atual
            </label>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2.5 text-sm bg-[#FFF9FB] border border-[#EED2DE] rounded-xl text-[#331824] focus:outline-none focus:border-[#9D2A58]"
              placeholder="Digite sua senha atual"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#4D2939] mb-1.5">
              Nova senha (mínimo 6 caracteres)
            </label>
            <input
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2.5 text-sm bg-[#FFF9FB] border border-[#EED2DE] rounded-xl text-[#331824] focus:outline-none focus:border-[#9D2A58]"
              placeholder="Digite a nova senha"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#4D2939] mb-1.5">
              Confirmar nova senha
            </label>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2.5 text-sm bg-[#FFF9FB] border border-[#EED2DE] rounded-xl text-[#331824] focus:outline-none focus:border-[#9D2A58]"
              placeholder="Repita a nova senha"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 py-2 text-sm font-medium text-[#6E4959] hover:bg-[#FDF2F6] rounded-xl transition-colors"
            >
              Fechar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="min-h-[44px] px-5 py-2 text-sm font-semibold text-white bg-[#9D2A58] hover:bg-[#831843] disabled:opacity-50 rounded-xl transition-colors"
            >
              {loading ? 'Salvando...' : 'Salvar nova senha'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
