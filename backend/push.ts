import * as webpush from 'web-push';
import {
  formatDateBR,
  isValidHHMMTime,
  type Professional,
} from '../shared/catalog.ts';
import type { StudioNotification } from '../shared/panelTypes.ts';
import {
  deletePushSubscriptionByEndpoint,
  getOrCreateAppSetting,
  listPushSubscriptionsForProfessional,
  markPushSubscriptionSuccess,
} from './db.ts';
import { setPushDispatcher } from './notificationsBus.ts';

interface StoredVapidKeys {
  publicKey: string;
  privateKey: string;
}

const DEFAULT_VAPID_SUBJECT = 'mailto:contato@maiscilios.com.br';

function normalizeVapidSubject(raw?: string): string {
  const trimmed = raw?.trim();
  if (!trimmed) return DEFAULT_VAPID_SUBJECT;
  if (trimmed.startsWith('mailto:') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  return DEFAULT_VAPID_SUBJECT;
}

let cachedVapidConfig:
  | { publicKey: string; privateKey: string; subject: string }
  | undefined;

export async function getVapidConfig(): Promise<{
  publicKey: string;
  privateKey: string;
  subject: string;
}> {
  const envPublic = process.env.VAPID_PUBLIC_KEY?.trim();
  const envPrivate = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = normalizeVapidSubject(process.env.VAPID_SUBJECT);

  if (envPublic && envPrivate) {
    return { publicKey: envPublic, privateKey: envPrivate, subject };
  }

  if (cachedVapidConfig) {
    return cachedVapidConfig;
  }

  const stored = await getOrCreateAppSetting<StoredVapidKeys>(
    'vapid_keys_json',
    () => webpush.generateVAPIDKeys(),
  );

  cachedVapidConfig = {
    publicKey: stored.publicKey,
    privateKey: stored.privateKey,
    subject,
  };
  return cachedVapidConfig;
}

export async function getPublicVapidKey(): Promise<string> {
  const cfg = await getVapidConfig();
  return cfg.publicKey;
}

export function isValidPushEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== 'string') return false;
  const trimmed = endpoint.trim();
  if (trimmed.length < 16 || trimmed.length > 2048) return false;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return false;
  }

  if (parsed.protocol !== 'https:') return false;

  const host = parsed.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host === '[::1]' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^fc00:/i.test(host) ||
    /^fe80:/i.test(host)
  ) {
    return false;
  }

  return true;
}

export function isValidPushKey(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length >= 16 &&
    value.trim().length <= 256 &&
    /^[A-Za-z0-9\-_+/=]+$/.test(value.trim())
  );
}

export function buildWebPushPayload(notification: StudioNotification): string {
  const parts: string[] = [];

  if (notification.requestTypeLabel) {
    parts.push(notification.requestTypeLabel);
  }
  if (notification.clientName) {
    parts.push(`Cliente: ${notification.clientName}`);
  }
  if (notification.procedures && notification.procedures.length > 0) {
    parts.push(`Serviços: ${notification.procedures.join(', ')}`);
  }
  if (notification.desiredDate) {
    const timeSuffix = notification.desiredTime
      ? isValidHHMMTime(notification.desiredTime)
        ? ` às ${notification.desiredTime}`
        : ` (${notification.desiredTime})`
      : '';
    parts.push(`Data: ${formatDateBR(notification.desiredDate)}${timeSuffix}`);
  }
  if (notification.isJoint) {
    parts.push('Agendamento conjunto (Laís + Duda)');
  }

  const body =
    parts.length > 0 ? parts.join(' · ') : notification.message;

  const title = notification.title.startsWith('MAIS CÍLIOS')
    ? notification.title
    : `MAIS CÍLIOS · ${notification.title}`;

  return JSON.stringify({
    title,
    body,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: `maiscilios-${notification.id}`,
    data: {
      notificationId: notification.id,
      recipient: notification.recipient,
      type: notification.type,
      requestTypeLabel: notification.requestTypeLabel ?? null,
      clientName: notification.clientName ?? null,
      procedures: notification.procedures ?? [],
      desiredDate: notification.desiredDate ?? null,
      desiredTime: notification.desiredTime ?? null,
      isJoint: Boolean(notification.isJoint),
      relatedReturnRequestId: notification.relatedReturnRequestId ?? null,
      relatedAppointmentId: notification.relatedAppointmentId ?? null,
      jointGroupId: notification.jointGroupId ?? null,
      targetTab: notification.targetTab ?? 'appointments',
      targetDate: notification.targetDate ?? null,
      targetProfessional:
        notification.targetProfessional ?? notification.recipient,
    },
  });
}

export type WebPushSendFn = typeof webpush.sendNotification;

let pushSender: WebPushSendFn = (subscription, payload, options) =>
  webpush.sendNotification(subscription, payload, options);

export function setWebPushSenderForTest(fn: WebPushSendFn | null): void {
  pushSender =
    fn ??
    ((subscription, payload, options) =>
      webpush.sendNotification(subscription, payload, options));
}

export async function dispatchPushForNotification(
  notification: StudioNotification,
): Promise<{ sent: number; failed: number; removed: number }> {
  const subscriptions = await listPushSubscriptionsForProfessional(
    notification.recipient as Professional,
  );
  if (subscriptions.length === 0) {
    return { sent: 0, failed: 0, removed: 0 };
  }

  const vapid = await getVapidConfig();
  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
  const payload = buildWebPushPayload(notification);

  let sent = 0;
  let failed = 0;
  let removed = 0;

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await pushSender(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          },
          payload,
          { TTL: 86_400 },
        );
        sent += 1;
        await markPushSubscriptionSuccess(sub.id);
      } catch (err) {
        failed += 1;
        const statusCode =
          typeof err === 'object' && err !== null && 'statusCode' in err
            ? Number((err as { statusCode?: number }).statusCode)
            : 0;
        if (statusCode === 404 || statusCode === 410) {
          removed += 1;
          await deletePushSubscriptionByEndpoint(sub.endpoint);
        }
      }
    }),
  );

  return { sent, failed, removed };
}

export function initializePushSubsystem(): void {
  setPushDispatcher(async (notification) => {
    await dispatchPushForNotification(notification);
  });
}
