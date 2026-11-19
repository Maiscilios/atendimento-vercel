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
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border bg-surface">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            className="min-h-[40px] px-2.5 -ml-2 inline-flex items-center gap-1.5 text-sm font-medium rounded-xl transition-colors btn-ghost"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Voltar</span>
          </button>
          <span className="font-display text-2xl font-bold text-brand-strong">MAIS CÍLIOS</span>
          <div className="w-16" aria-hidden="true" />
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-md bg-surface border border-border rounded-3xl p-6 sm:p-8 shadow-card">
          <div className="flex items-center gap-3 pb-4 border-b border-border">
            <div className="w-11 h-11 rounded-2xl bg-brand-soft border border-border flex items-center justify-center text-brand-strong">
              {isConfigured ? (
                <KeyRound className="w-5 h-5" />
              ) : (
                <ShieldCheck className="w-5 h-5" />
              )}
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold text-brand-strong">
                Acesso da Equipe
              </h1>
              <p className="text-xs sm:text-sm text-text-secondary">
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
              <span className="block text-xs font-medium text-text-secondary mb-1.5">
                Selecione a profissional
              </span>
              <div className="grid grid-cols-2 gap-2 p-1 bg-brand-soft rounded-xl">
                <button
                  type="button"
                  onClick={() => handleSelectProfessional('lais')}
                  className={`min-h-[44px] rounded-lg text-sm font-semibold transition-colors ${
                    username === 'lais'
                      ? 'tab-active'
                      : 'tab-idle'
                  }`} aria-pressed={username === 'lais'}
                >
                  Laís (Admin)
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectProfessional('duda')}
                  className={`min-h-[44px] rounded-lg text-sm font-semibold transition-colors ${
                    username === 'duda'
                      ? 'tab-active'
                      : 'tab-idle'
                  }`} aria-pressed={username === 'duda'}
                >
                  Duda
                </button>
              </div>
            </div>

            {statusLoading ? (
              <div className="py-6 text-center text-sm text-text-secondary">
                Carregando configuração de acesso...
              </div>
            ) : !isConfigured ? (
              <>
                <div className="p-3.5 rounded-xl bg-brand-soft border border-border text-xs sm:text-sm text-text-secondary leading-relaxed">
                  <strong>Primeiro acesso de {professionalLabel}:</strong> crie agora uma senha individual (mínimo 6 caracteres). Depois de salva, somente essa senha dará acesso ao painel.
                </div>

                {setupStatus?.setupKeyRequired && (
                  <div>
                    <label htmlFor="setup-key" className="block text-sm font-medium text-text-secondary mb-1.5">
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
                      className="w-full min-h-[46px] px-3.5 py-2 border rounded-xl field-control text-base"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1.5" htmlFor="loginscreen-field-1">
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
                      className="w-full min-h-[46px] pl-3.5 pr-11 py-2 border rounded-xl field-control text-base" id="loginscreen-field-1"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 min-h-[38px] min-w-[38px] flex items-center justify-center text-text-secondary hover:text-brand-strong rounded-lg"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1.5" htmlFor="loginscreen-field-2">
                    Confirmar senha de {professionalLabel}
                  </label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repita a senha escolhida"
                    className="w-full min-h-[46px] px-3.5 py-2 border rounded-xl field-control text-base" id="loginscreen-field-2"
                  />
                </div>
              </>
            ) : (
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5" htmlFor="loginscreen-field-3">
                  Senha de acesso
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={`Digite a senha de ${professionalLabel}`}
                    className="w-full min-h-[46px] pl-3.5 pr-11 py-2 border rounded-xl field-control text-base" id="loginscreen-field-3"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 min-h-[38px] min-w-[38px] flex items-center justify-center text-text-secondary hover:text-brand-strong rounded-lg"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div className="p-3 rounded-xl bg-error-soft border border-error-border text-sm text-error">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || statusLoading}
              className="w-full min-h-[48px] px-5 py-2.5 rounded-xl disabled:opacity-60 text-sm sm:text-base font-semibold transition-colors btn-primary"
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
