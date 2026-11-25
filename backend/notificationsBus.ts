import type { Professional } from '../shared/catalog.ts';
import type { StudioNotification } from '../shared/panelTypes.ts';

type NotificationListener = (notification: StudioNotification) => void;
type PushDispatcher = (notification: StudioNotification) => Promise<void>;

const streamListeners: Record<Professional, Set<NotificationListener>> = {
  lais: new Set(),
  duda: new Set(),
};

let pushDispatcher: PushDispatcher | null = null;

export function setPushDispatcher(dispatcher: PushDispatcher): void {
  pushDispatcher = dispatcher;
}

export function subscribeNotificationStream(
  professional: Professional,
  listener: NotificationListener,
): () => void {
  streamListeners[professional].add(listener);
  return () => {
    streamListeners[professional].delete(listener);
  };
}

export function publishNotificationEvent(notification: StudioNotification): void {
  const listeners = streamListeners[notification.recipient];
  for (const listener of listeners) {
    try {
      listener(notification);
    } catch (error) {
      console.error('Erro ao transmitir notificação em tempo real:', error);
    }
  }

  if (pushDispatcher) {
    void pushDispatcher(notification).catch((error) => {
      console.error('Erro ao enviar push notification:', error);
    });
  }
}
