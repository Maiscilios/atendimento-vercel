import { useEffect, useRef } from 'react';
import type { StudioNotification } from '../../../shared/panelTypes';
import { getStoredToken } from '../lib/api';

interface UseNotificationsStreamOptions {
  enabled: boolean;
  onNotification: (notification: StudioNotification) => void;
  onReconnect?: () => void;
}

export function useNotificationsStream({
  enabled,
  onNotification,
  onReconnect,
}: UseNotificationsStreamOptions) {
  const onNotificationRef = useRef(onNotification);
  const onReconnectRef = useRef(onReconnect);
  const seenIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    onNotificationRef.current = onNotification;
  }, [onNotification]);

  useEffect(() => {
    onReconnectRef.current = onReconnect;
  }, [onReconnect]);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let activeAbort: AbortController | null = null;
    let reconnectTimer: number | null = null;
    let retryMs = 3000;
    let hasConnectedOnce = false;

    const connect = async () => {
      if (cancelled) return;
      activeAbort?.abort();
      const controller = new AbortController();
      activeAbort = controller;

      try {
        const token = getStoredToken();
        const headers = new Headers();
        headers.set('Accept', 'text/event-stream');
        if (token) {
          headers.set('Authorization', `Bearer ${token}`);
        }

        const response = await fetch('/api/notifications/stream', {
          method: 'GET',
          headers,
          credentials: 'include',
          signal: controller.signal,
          cache: 'no-store',
        });

        if (!response.ok || !response.body) {
          throw new Error(`SSE status ${response.status}`);
        }

        if (hasConnectedOnce) {
          onReconnectRef.current?.();
        }
        hasConnectedOnce = true;
        retryMs = 3000;

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (!cancelled) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split(/\r?\n\r?\n/);
          buffer = frames.pop() ?? '';

          for (const frame of frames) {
            if (!frame.trim()) continue;
            const lines = frame.split(/\r?\n/);
            let eventName = 'message';
            const dataLines: string[] = [];

            for (const line of lines) {
              if (line.startsWith(':')) continue;
              if (line.startsWith('event:')) {
                eventName = line.slice(6).trim();
              } else if (line.startsWith('data:')) {
                dataLines.push(line.slice(5).trim());
              }
            }

            if (eventName === 'notification' && dataLines.length > 0) {
              try {
                const parsed = JSON.parse(
                  dataLines.join('\n'),
                ) as StudioNotification;
                if (parsed?.id && !seenIdsRef.current.has(parsed.id)) {
                  seenIdsRef.current.add(parsed.id);
                  if (seenIdsRef.current.size > 200) {
                    const first = seenIdsRef.current.values().next().value;
                    if (first) seenIdsRef.current.delete(first);
                  }
                  onNotificationRef.current(parsed);
                }
              } catch {
                // Ignore malformed SSE event payload
              }
            }
          }
        }
      } catch {
        // Reconnect below if still active
      }

      if (!cancelled) {
        reconnectTimer = window.setTimeout(() => {
          retryMs = Math.min(retryMs * 1.5, 15000);
          void connect();
        }, retryMs);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !cancelled) {
        onReconnectRef.current?.();
      }
    };

    void connect();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      activeAbort?.abort();
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled]);
}
