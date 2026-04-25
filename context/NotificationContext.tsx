"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  ReactNode,
} from "react";
import { useSession } from "next-auth/react";
import type { AlertEventPayload } from "@/lib/pusher-client";

export interface NotificationItem {
  id: string;
  targetId: string;
  severity: "critical" | "warning";
  message: string;
  pondName: string;
  action: string;
  timestamp: string;
  deviceId?: string;
}

interface NotificationContextValue {
  notifications: NotificationItem[];
  total: number;
  refresh: () => void;
  dismissNotification: (targetId?: string) => Promise<void>;
  clearNotifications: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextValue>({
  notifications: [],
  total: 0,
  refresh: () => {},
  dismissNotification: async () => {},
  clearNotifications: async () => {},
});

export function useNotifications() {
  return useContext(NotificationContext);
}

const POLL_MS = process.env.NODE_ENV === "development" ? 5_000 : 15_000;
const MAX_NOTIFICATIONS = 300;

function mergeNotifications(
  prev: NotificationItem[],
  incoming: NotificationItem[],
): NotificationItem[] {
  const merged = [...incoming, ...prev];

  const deduped = merged.filter(
    (item, index, arr) => index === arr.findIndex((x) => x.id === item.id),
  );

  deduped.sort(
    (a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  return deduped.slice(0, MAX_NOTIFICATIONS);
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const throttleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchNotifications = useCallback(async () => {
    if (status !== "authenticated") return;
    try {
      const res = await fetch("/api/notifications/alerts");
      if (!res.ok) return;
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        const incoming = json.data as NotificationItem[];
        const deduped = incoming.filter(
          (item, index, arr) => index === arr.findIndex((x) => x.id === item.id),
        );
        deduped.sort(
          (a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
        );
        setNotifications(deduped.slice(0, MAX_NOTIFICATIONS));
      }
    } catch {
      // Silently ignore — pertahankan notif yang sudah ada
    }
  }, [status]);

  const dismissNotification = useCallback(
    async (targetId?: string) => {
      if (!targetId?.startsWith("alarm-")) return;

      try {
        await fetch("/api/notifications/alerts", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "one", targetId }),
        });
      } catch {
        // Ignore network errors, next refresh will retry server truth
      } finally {
        setNotifications((prev) => prev.filter((n) => n.targetId !== targetId));
      }
    },
    [],
  );

  const clearNotifications = useCallback(async () => {
    try {
      await fetch("/api/notifications/alerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "all" }),
      });
    } catch {
      // Ignore network errors, client state still cleared for responsiveness
    } finally {
      setNotifications([]);
    }
  }, []);

  // Polling
  useEffect(() => {
    if (status !== "authenticated") return;
    fetchNotifications();
    timerRef.current = setInterval(fetchNotifications, POLL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (throttleRef.current) clearTimeout(throttleRef.current);
    };
  }, [status, fetchNotifications]);

  // Pusher realtime — hanya trigger fetch, tidak replace state
  useEffect(() => {
    if (status !== "authenticated" || typeof window === "undefined") return;
    if (!process.env.NEXT_PUBLIC_PUSHER_KEY) return;

    let unsubscribe: (() => void) | undefined;

    import("@/lib/pusher-client")
      .then(({ subscribeToGlobalAlertEvents }) => {
        unsubscribe = subscribeToGlobalAlertEvents((payload: AlertEventPayload) => {
          if (payload.status === "CLEARED") return;

          const eventTime = payload.eventTime || Date.now();
          setNotifications((prev) => {
            const existing = prev.find((n) => n.deviceId === payload.deviceId);
            const realtimeItem: NotificationItem = {
              id:
                payload.alertId != null
                  ? `notif-db-${String(payload.alertId)}`
                  : `notif-event-${payload.deviceId}-${eventTime}-${payload.status}`,
              targetId:
                payload.alertId != null
                  ? `alarm-${String(payload.alertId)}`
                  : `event-${payload.deviceId}-${eventTime}`,
              severity: payload.severity === "CRITICAL" ? "critical" : "warning",
              message: payload.message,
              pondName: existing?.pondName || "Kolam",
              action:
                payload.action ||
                (payload.severity === "CRITICAL"
                  ? "SEGERA CEK TAMBAK!"
                  : "Perlu pengecekan"),
              timestamp: new Date(eventTime).toISOString(),
              deviceId: payload.deviceId,
            };

            return mergeNotifications(prev, [realtimeItem]);
          });

          // ACTIVE/ACKNOWLEDGED → fetch terbaru dengan throttle
          if (throttleRef.current) return;
          throttleRef.current = setTimeout(() => {
            throttleRef.current = null;
            fetchNotifications();
          }, 2_000);
        });
      })
      .catch(() => {});

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [status, fetchNotifications]);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        total: notifications.length,
        refresh: fetchNotifications,
        dismissNotification,
        clearNotifications,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}