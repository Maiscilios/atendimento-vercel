import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, Eye, EyeOff, KeyRound, ShieldCheck } from 'lucide-react';
import { fetchSetupStatus, loginRequest, setupInitialPassword } from '../lib/api';
import type { AuthUser } from '../../../shared/catalog';
import type { SetupStatus } from '../../../shared/panelTypes';

interface LoginScreenProps {
  onBack: () => void;
  onLoginSuccess: (user: AuthUser) => void;
}

export function LoginScreen({ onBack, onLoginSuccess }: LoginScreenProps) {
  const [username, setUsername] = useState<'lais' | 'duda'>('lais');
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [setupKey, setSetupKey] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    fetchSetupStatus()
      .then((status) => {
        if (active) setSetupStatus(status);
      })
      .catch(() => {
        if (active) setSetupStatus({ laisConfigured: false, dudaConfigured: false });
      })
      .finally(() => {
        if (active) setStatusLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const isConfigured =
    username === 'lais'
      ? Boolean(setupStatus?.laisConfigured)
      : Boolean(setupStatus?.dudaConfigured);

  const professionalLabel = username === 'lais' ? 'Laís' : 'Duda';

  function handleSelectProfessional(next: 'lais' | 'duda') {
    setUsername(next);
    setPassword('');
    setConfirmPassword('');
    setError('');
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (!isConfigured) {
      if (password.trim().length < 6) {
        setError('A senha inicial deve ter pelo menos 6 caracteres.');
        return;
      }
      if (password !== confirmPassword) {
        setError('As duas senhas digitadas não conferem.');
        return;
      }

      setLoading(true);
      try {
        const { user } = await setupInitialPassword(username, password.trim(), setupKey);
        onLoginSuccess(user);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Não foi possível cadastrar a senha inicial.'
        );
      } finally {
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    try {
      const { user } = await loginRequest(username, password);
      onLoginSuccess(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível entrar.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#FFF9FB] flex flex-col">
      <header className="border-b border-[#F3DCE6] bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            className="min-h-[40px] px-2.5 -ml-2 inline-flex items-center gap-1.5 text-sm font-medium text-[#831843] hover:bg-[#FDF2F6] rounded-xl transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Voltar</span>
          </button>
          <span className="font-display text-2xl font-bold text-[#831843]">MAIS CÍLIOS</span>
          <div className="w-16" aria-hidden="true" />
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-md bg-white border border-[#F1D8E2] rounded-3xl p-6 sm:p-8 shadow-[0_6px_24px_rgba(131,24,67,0.06)]">
          <div className="flex items-center gap-3 pb-4 border-b border-[#F5E4EC]">
            <div className="w-11 h-11 rounded-2xl bg-[#FDF2F6] border border-[#F1D8E2] flex items-center justify-center text-[#9D2A58]">
              {isConfigured ? (
                <KeyRound className="w-5 h-5" />
              ) : (
                <ShieldCheck className="w-5 h-5" />
              )}
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold text-[#831843]">
                Acesso da Equipe
              </h1>
              <p className="text-xs sm:text-sm text-[#7A5464]">
                {statusLoading
                  ? 'Verificando acesso...'
                  : isConfigured
                    ? 'Entre com sua senha individual'
                    : `Primeiro acesso — Cadastre a senha de ${professionalLabel}`}
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div>
              <span className="block text-xs font-medium text-[#5E3A4A] mb-1.5">
                Selecione a profissional
              </span>
              <div className="grid grid-cols-2 gap-2 p-1 bg-[#F9ECF2] rounded-xl">
                <button
                  type="button"
                  onClick={() => handleSelectProfessional('lais')}
                  className={`min-h-[44px] rounded-lg text-sm font-semibold transition-colors ${
                    username === 'lais'
                      ? 'bg-white text-[#831843] shadow-sm'
                      : 'text-[#6E4959] hover:text-[#331824]'
                  }`}
                >
                  Laís (Admin)
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectProfessional('duda')}
                  className={`min-h-[44px] rounded-lg text-sm font-semibold transition-colors ${
                    username === 'duda'
                      ? 'bg-white text-[#831843] shadow-sm'
                      : 'text-[#6E4959] hover:text-[#331824]'
                  }`}
                >
                  Duda
                </button>
              </div>
            </div>

            {statusLoading ? (
              <div className="py-6 text-center text-sm text-[#7A5464]">
                Carregando configuração de acesso...
              </div>
            ) : !isConfigured ? (
              <>
                <div className="p-3.5 rounded-xl bg-[#FDF2F6] border border-[#EBC5D5] text-xs sm:text-sm text-[#5E3A4A] leading-relaxed">
                  <strong>Primeiro acesso de {professionalLabel}:</strong> crie agora uma senha individual (mínimo 6 caracteres). Depois de salva, somente essa senha dará acesso ao painel.
                </div>

                {setupStatus?.setupKeyRequired && (
                  <div>
                    <label htmlFor="setup-key" className="block text-sm font-medium text-[#5E3A4A] mb-1.5">
                      Código de configuração
                    </label>
                    <input
                      id="setup-key"
                      type="password"
                      required
                      autoComplete="off"
                      value={setupKey}
                      onChange={(e) => setSetupKey(e.target.value)}
                      placeholder="Código fornecido pela administradora"
                      className="w-full min-h-[46px] px-3.5 py-2 text-sm sm:text-base bg-[#FFF9FB] border border-[#EED2DE] rounded-xl text-[#331824] focus:outline-none focus:border-[#9D2A58]"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-[#5E3A4A] mb-1.5">
                    Criar senha de {professionalLabel}
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                      className="w-full min-h-[46px] pl-3.5 pr-11 py-2 text-sm sm:text-base bg-[#FFF9FB] border border-[#EED2DE] rounded-xl text-[#331824] focus:outline-none focus:border-[#9D2A58]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 min-h-[38px] min-w-[38px] flex items-center justify-center text-[#7A5464] hover:text-[#831843] rounded-lg"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#5E3A4A] mb-1.5">
                    Confirmar senha de {professionalLabel}
                  </label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repita a senha escolhida"
                    className="w-full min-h-[46px] px-3.5 py-2 text-sm sm:text-base bg-[#FFF9FB] border border-[#EED2DE] rounded-xl text-[#331824] focus:outline-none focus:border-[#9D2A58]"
                  />
                </div>
              </>
            ) : (
              <div>
                <label className="block text-xs font-medium text-[#5E3A4A] mb-1.5">
                  Senha de acesso
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={`Digite a senha de ${professionalLabel}`}
                    className="w-full min-h-[46px] pl-3.5 pr-11 py-2 text-sm sm:text-base bg-[#FFF9FB] border border-[#EED2DE] rounded-xl text-[#331824] focus:outline-none focus:border-[#9D2A58]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 min-h-[38px] min-w-[38px] flex items-center justify-center text-[#7A5464] hover:text-[#831843] rounded-lg"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div className="p-3 rounded-xl bg-[#FFF1F2] border border-[#FECDD3] text-sm text-[#9F1239]">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || statusLoading}
              className="w-full min-h-[48px] px-5 py-2.5 rounded-xl bg-[#9D2A58] hover:bg-[#831843] disabled:opacity-60 text-white text-sm sm:text-base font-semibold transition-colors"
            >
              {loading
                ? 'Salvando...'
                : isConfigured
                  ? `Entrar como ${professionalLabel}`
                  : `Cadastrar senha e entrar (${professionalLabel})`}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
