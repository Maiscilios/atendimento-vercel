import { clientsClaim } from 'workbox-core';
import {
  cleanupOutdatedCaches,
  precacheAndRoute,
  type PrecacheEntry,
} from 'workbox-precaching';

interface SwPushMessageData {
  json: () => unknown;
  text: () => string;
}

interface SwPushEvent extends Event {
  data: SwPushMessageData | null;
  waitUntil: (promise: Promise<unknown>) => void;
}

interface SwNotificationData {
  notificationId?: string | null;
  recipient?: string | null;
  type?: string | null;
  requestTypeLabel?: string | null;
  clientName?: string | null;
  procedures?: string[];
  desiredDate?: string | null;
  desiredTime?: string | null;
  isJoint?: boolean;
  relatedReturnRequestId?: string | null;
  relatedAppointmentId?: string | null;
  jointGroupId?: string | null;
  targetTab?: string | null;
  targetDate?: string | null;
  targetProfessional?: string | null;
}

interface SwNotificationInstance {
  data?: SwNotificationData;
  close: () => void;
}

interface SwNotificationEvent extends Event {
  notification: SwNotificationInstance;
  waitUntil: (promise: Promise<unknown>) => void;
}

interface SwWindowClient {
  url: string;
  focus: () => Promise<SwWindowClient>;
  postMessage: (message: unknown) => void;
}

interface SwClientsNamespace {
  matchAll: (options: {
    type?: string;
    includeUncontrolled?: boolean;
  }) => Promise<SwWindowClient[]>;
  openWindow: (url: string) => Promise<SwWindowClient | null>;
}

interface SwRegistrationNamespace {
  showNotification: (
    title: string,
    options?: {
      body?: string;
      icon?: string;
      badge?: string;
      tag?: string;
      renotify?: boolean;
      data?: SwNotificationData;
    },
  ) => Promise<void>;
}

interface SwGlobalScope {
  __WB_MANIFEST: Array<PrecacheEntry | string>;
  location: Location;
  clients: SwClientsNamespace;
  registration: SwRegistrationNamespace;
  skipWaiting: () => Promise<void>;
  addEventListener: (
    type: string,
    listener: (event: Event) => void,
  ) => void;
}

declare global {
  interface Window {
    __WB_MANIFEST: Array<PrecacheEntry | string>;
  }
}

const sw = self as unknown as SwGlobalScope;

void sw.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

sw.addEventListener('message', (event: Event) => {
  const msgEvent = event as MessageEvent<{ type?: string }>;
  if (msgEvent.data?.type === 'SKIP_WAITING') {
    void sw.skipWaiting();
  }
});

sw.addEventListener('push', (event: Event) => {
  const pushEvent = event as SwPushEvent;
  let title = 'MAIS CÍLIOS';
  let body = 'Você tem uma nova notificação no estúdio.';
  let icon = '/pwa-192x192.png';
  let badge = '/pwa-192x192.png';
  let tag = 'maiscilios-alert';
  let data: SwNotificationData = {};

  if (pushEvent.data) {
    try {
      const parsed = pushEvent.data.json() as {
        title?: string;
        body?: string;
        icon?: string;
        badge?: string;
        tag?: string;
        data?: SwNotificationData;
      };
      if (parsed.title) title = parsed.title;
      if (parsed.body) body = parsed.body;
      if (parsed.icon) icon = parsed.icon;
      if (parsed.badge) badge = parsed.badge;
      if (parsed.tag) tag = parsed.tag;
      if (parsed.data) data = parsed.data;
    } catch {
      const rawText = pushEvent.data.text();
      if (rawText) body = rawText;
    }
  }

  pushEvent.waitUntil(
    sw.registration.showNotification(title, {
      body,
      icon,
      badge,
      tag,
      renotify: true,
      data,
    }),
  );
});

sw.addEventListener('notificationclick', (event: Event) => {
  const notifEvent = event as SwNotificationEvent;
  notifEvent.notification.close();
  const data = notifEvent.notification.data ?? {};

  const params = new URLSearchParams();
  if (data.targetTab) params.set('notifTab', data.targetTab);
  if (data.relatedReturnRequestId) {
    params.set('notifReqId', data.relatedReturnRequestId);
  }
  if (data.relatedAppointmentId) {
    params.set('notifApptId', data.relatedAppointmentId);
  }
  if (data.targetDate) params.set('notifDate', data.targetDate);
  if (data.targetProfessional) {
    params.set('notifProf', data.targetProfessional);
  }

  const query = params.toString();
  const targetUrl = query ? `/?${query}` : '/';

  notifEvent.waitUntil(
    (async () => {
      const windowClients = await sw.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      const matching = windowClients.find((client) =>
        client.url.startsWith(sw.location.origin),
      );
      if (matching) {
        matching.postMessage({
          type: 'MAIS_CILIOS_NOTIFICATION_CLICK',
          data,
        });
        await matching.focus();
        return;
      }

      await sw.clients.openWindow(targetUrl);
    })(),
  );
});
