import { useCallback, useEffect, useState } from 'react';
import {
  Bell,
  BellOff,
  BellRing,
  CheckCircle2,
  Download,
  Loader2,
  Send,
  Smartphone,
  X,
} from 'lucide-react';
import { formatBrazilTimeBR, type Professional } from '../../../shared/catalog';
import type { PushStatusResponse } from '../../../shared/panelTypes';
import { usePWAInstall } from '../hooks/usePWAInstall';
import {
  fetchPushStatus,
  fetchVapidPublicKey,
  sendTestPushNotification,
  subscribePushDevice,
  unsubscribePushDevice,
} from '../lib/api';

interface NotificationSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  userName: string;
  professional: Professional;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputBuffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(outputBuffer);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function detectDeviceLabel(): string {
  const ua = window.navigator.userAgent || '';
  if (/iPhone/i.test(ua)) return 'iPhone (App Tela Inicial)';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/Android/i.test(ua)) return 'Celular Android';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'Mac / Computador';
  if (/Windows/i.test(ua)) return 'Windows / Computador';
  return 'Navegador';
}

export function NotificationSettingsModal({
  isOpen,
  onClose,
  userName,
}: NotificationSettingsModalProps) {
  const { isInstalled, isIOS, canInstallPrompt, install } = usePWAInstall();

  const [loadingStatus, setLoadingStatus] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [testingBusy, setTestingBusy] = useState(false);
  const [status, setStatus] = useState<PushStatusResponse | null>(null);
  const [browserSubscribed, setBrowserSubscribed] = useState(false);
  const [permissionState, setPermissionState] = useState<string>('default');
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  const supportsPush =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;

  const refreshState = useCallback(async () => {
    setLoadingStatus(true);
    setError('');
    try {
      const serverStatus = await fetchPushStatus();
      setStatus(serverStatus);

      if (supportsPush) {
        setPermissionState(Notification.permission);
        const reg = await navigator.serviceWorker.getRegistration();
        const existingSub = await reg?.pushManager.getSubscription();
        setBrowserSubscribed(Boolean(existingSub));
      } else {
        setBrowserSubscribed(false);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Não foi possível verificar as notificações.',
      );
    } finally {
      setLoadingStatus(false);
    }
  }, [supportsPush]);

  useEffect(() => {
    if (isOpen) {
      setFeedback('');
      setError('');
      void refreshState();
    }
  }, [isOpen, refreshState]);

  if (!isOpen) return null;

  async function handleEnableNotifications() {
    setError('');
    setFeedback('');

    if (isIOS && !isInstalled) {
      setError(
        'No iPhone, adicione primeiro o MAIS CÍLIOS à Tela de Início pelo Safari e abra pelo ícone instalado para ativar as notificações.',
      );
      return;
    }

    if (!supportsPush) {
      setError(
        'Este navegador não suporta notificações push diretamente. Tente atualizar o navegador ou abrir pela tela inicial.',
      );
      return;
    }

    setActionBusy(true);
    try {
      const permission = await Notification.requestPermission();
      setPermissionState(permission);
      if (permission !== 'granted') {
        setError(
          permission === 'denied'
            ? 'As notificações estão bloqueadas nas configurações deste navegador. Libere o acesso para receber alertas no celular.'
            : 'Permissão de notificação não concedida.',
        );
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        const publicKey =
          status?.vapidPublicKey || (await fetchVapidPublicKey());
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }

      const json = subscription.toJSON();
      const endpoint = subscription.endpoint;
      const p256dh = json.keys?.p256dh ?? '';
      const auth = json.keys?.auth ?? '';

      if (!endpoint || !p256dh || !auth) {
        throw new Error('Não foi possível gerar a chave de notificação deste aparelho.');
      }

      await subscribePushDevice({
        endpoint,
        keys: { p256dh, auth },
        deviceLabel: detectDeviceLabel(),
      });

      setBrowserSubscribed(true);
      setFeedback(
        'Notificações ativadas neste celular! Você receberá alertas mesmo com o site fechado.',
      );
      await refreshState();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Não foi possível ativar as notificações no celular.',
      );
    } finally {
      setActionBusy(false);
    }
  }

  async function handleDisableNotifications() {
    setError('');
    setFeedback('');
    setActionBusy(true);
    try {
      let endpoint: string | undefined;
      if (supportsPush) {
        const reg = await navigator.serviceWorker.getRegistration();
        const existingSub = await reg?.pushManager.getSubscription();
        if (existingSub) {
          endpoint = existingSub.endpoint;
          await existingSub.unsubscribe();
        }
      }

      await unsubscribePushDevice(endpoint);
      setBrowserSubscribed(false);
      setFeedback('Notificações desativadas para este dispositivo.');
      await refreshState();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Não foi possível desativar as notificações.',
      );
    } finally {
      setActionBusy(false);
    }
  }

  async function handleSendTest() {
    setError('');
    setFeedback('');
    setTestingBusy(true);
    try {
      const result = await sendTestPushNotification();
      if (result.activeSubscriptionsCount > 0) {
        setFeedback(
          'Notificação de teste enviada para o sininho e para o(s) aparelho(s) cadastrado(s)!',
        );
      } else {
        setFeedback(
          'Notificação de teste enviada no sininho! Para receber também na tela bloqueada, toque em "Ativar notificações no celular".',
        );
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Erro ao enviar notificação de teste.',
      );
    } finally {
      setTestingBusy(false);
    }
  }

  async function handleInstallApp() {
    const accepted = await install();
    if (accepted) {
      setFeedback('MAIS CÍLIOS adicionado à tela inicial do celular!');
    }
  }

  const isActiveOnDevice =
    browserSubscribed || (status?.activeSubscriptionsCount ?? 0) > 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="notif-settings-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-overlay/45 backdrop-blur-xs"
    >
      <div className="w-full max-w-lg max-h-[90vh] flex flex-col bg-surface border border-border rounded-3xl shadow-dialog overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-border flex items-start justify-between gap-4 bg-background">
          <div className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-brand-strong">
              MAIS CÍLIOS · Alertas no Celular
            </span>
            <h2
              id="notif-settings-title"
              className="font-display text-2xl font-bold text-text-primary"
            >
              Notificações da {userName}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar configurações de notificações"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl transition-colors btn-ghost"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 sm:p-6 overflow-y-auto space-y-5">
          {error && (
            <div className="p-3.5 rounded-xl bg-error-soft border border-error-border text-sm text-error">
              {error}
            </div>
          )}

          {feedback && (
            <div className="p-3.5 rounded-xl bg-success-soft border border-success-border text-sm text-success flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{feedback}</span>
            </div>
          )}

          {/* Status & Ações Push */}
          <div className="p-4 rounded-2xl bg-brand-soft/60 border border-brand/30 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-brand-soft border border-brand/40 flex items-center justify-center text-brand-strong shrink-0">
                  {isActiveOnDevice ? (
                    <BellRing className="w-5 h-5" />
                  ) : (
                    <Bell className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-bold text-text-primary">
                    Receber alertas mesmo com o site fechado
                  </p>
                  <p className="text-xs text-text-secondary">
                    {loadingStatus
                      ? 'Verificando aparelho...'
                      : browserSubscribed
                        ? 'Ativadas neste aparelho'
                        : permissionState === 'denied'
                          ? 'Permissão bloqueada no navegador'
                          : 'Desativadas neste aparelho'}
                  </p>
                </div>
              </div>
              {status && status.activeSubscriptionsCount > 0 && (
                <span className="px-2.5 py-1 rounded-lg bg-surface border border-brand/30 text-xs font-semibold text-brand-strong tabular-nums shrink-0">
                  {status.activeSubscriptionsCount}{' '}
                  {status.activeSubscriptionsCount === 1
                    ? 'aparelho'
                    : 'aparelhos'}
                </span>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5">
              <button
                type="button"
                disabled={actionBusy}
                onClick={() => void handleEnableNotifications()}
                className="flex-1 min-h-[44px] px-4 py-2.5 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors btn-primary disabled:opacity-60"
              >
                {actionBusy ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <BellRing className="w-4 h-4" />
                )}
                <span>Ativar notificações no celular</span>
              </button>

              {isActiveOnDevice && (
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={() => void handleDisableNotifications()}
                  className="min-h-[44px] px-4 py-2.5 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors btn-danger disabled:opacity-60"
                >
                  <BellOff className="w-4 h-4" />
                  <span>Desativar notificações</span>
                </button>
              )}
            </div>

            <div className="pt-2 border-t border-brand/25 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-text-secondary">
                Envie um alerta para confirmar o recebimento no sininho e no celular.
              </p>
              <button
                type="button"
                disabled={testingBusy}
                onClick={() => void handleSendTest()}
                className="min-h-[40px] px-4 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors btn-secondary disabled:opacity-60"
              >
                {testingBusy ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                <span>Enviar notificação de teste</span>
              </button>
            </div>
          </div>

          {/* Orientações para instalação na tela inicial */}
          <div className="p-4 rounded-2xl bg-background border border-border space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-brand-strong" />
                <h3 className="text-sm font-bold text-text-primary">
                  Instalar na tela inicial do celular
                </h3>
              </div>
              {isInstalled && (
                <span className="px-2 py-0.5 rounded-md bg-success-soft border border-success-border text-[11px] font-semibold text-success">
                  App instalado
                </span>
              )}
            </div>

            {canInstallPrompt && (
              <button
                type="button"
                onClick={() => void handleInstallApp()}
                className="w-full min-h-[42px] px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors btn-secondary"
              >
                <Download className="w-4 h-4" />
                <span>Adicionar MAIS CÍLIOS à tela inicial</span>
              </button>
            )}

            <div className="space-y-2.5 text-xs text-text-secondary leading-relaxed">
              <div className="p-3 rounded-xl bg-surface border border-border space-y-1">
                <p className="font-semibold text-brand-strong">
                  iPhone / iPad (Safari — iOS 16.4 ou superior):
                </p>
                <p>
                  1. Abra este site no navegador <strong>Safari</strong>.
                </p>
                <p>
                  2. Toque no ícone de <strong>Compartilhar</strong> (quadrado com seta para cima) e escolha <strong>“Adicionar à Tela de Início”</strong>.
                </p>
                <p>
                  3. Abra o ícone <strong>MAIS CÍLIOS</strong> na tela inicial do celular, faça login e toque em <strong>“Ativar notificações no celular”</strong>.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-surface border border-border space-y-1">
                <p className="font-semibold text-brand-strong">
                  Android (Google Chrome):
                </p>
                <p>
                  1. Toque no menu <strong>⋮</strong> (três pontinhos) no canto superior direito do Chrome e selecione <strong>“Instalar aplicativo”</strong> ou <strong>“Adicionar à tela inicial”</strong>.
                </p>
                <p>
                  2. Toque em <strong>“Ativar notificações no celular”</strong> acima e aceite a permissão.
                </p>
              </div>
            </div>
          </div>

          {status && status.subscriptions.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
                Aparelhos conectados ({status.subscriptions.length})
              </h3>
              <div className="divide-y divide-border border border-border rounded-xl bg-background">
                {status.subscriptions.map((sub) => (
                  <div
                    key={sub.id}
                    className="px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs"
                  >
                    <span className="font-medium text-text-primary">
                      {sub.deviceLabel}
                    </span>
                    <span className="text-text-secondary tabular-nums">
                      Atualizado às {formatBrazilTimeBR(sub.updatedAt)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="p-4 sm:px-6 border-t border-border bg-background flex justify-end">
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
