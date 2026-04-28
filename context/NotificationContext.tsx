"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
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
}

const NotificationContext = createContext<NotificationContextValue>({
  notifications: [],
  total: 0,
  refresh: () => {},
});

export function useNotifications() {
  return useContext(NotificationContext);
}

const POLL_MS = process.env.NODE_ENV === "development" ? 5_000 : 15_000;
const MAX_NOTIFICATIONS = 300;
const NOTIFICATION_STORAGE_KEY = "iot_active_notifications";

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
  const { status, data: session } = useSession();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const throttleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const allowedDeviceIdsRef = useRef<Set<string> | null>(null);
  const allowedDeviceIdsLoadedRef = useRef(false);

  const storageKey = useMemo(() => {
    const email = session?.user?.email?.trim().toLowerCase();
    return email
      ? `${NOTIFICATION_STORAGE_KEY}:${email}`
      : NOTIFICATION_STORAGE_KEY;
  }, [session?.user?.email]);

  const refreshAllowedDeviceIds = useCallback(async () => {
    if (status !== "authenticated") {
      allowedDeviceIdsRef.current = null;
      allowedDeviceIdsLoadedRef.current = false;
      return;
    }

    try {
      const response = await fetch("/api/devices");
      if (!response.ok) return;

      const json = await response.json();
      if (!json.success || !Array.isArray(json.data)) return;

      allowedDeviceIdsRef.current = new Set(
        json.data
          .map((device: { thingsboardDeviceId?: string }) => device.thingsboardDeviceId)
          .filter((deviceId: unknown): deviceId is string => Boolean(deviceId)),
      );
      allowedDeviceIdsLoadedRef.current = true;
    } catch {
      // Ignore device list fetch errors and keep the previous allowlist.
    }
  }, [status]);

  const isAllowedDevice = useCallback((deviceId?: string) => {
    const allowedDeviceIds = allowedDeviceIdsRef.current;
    if (!allowedDeviceIdsLoadedRef.current || !allowedDeviceIds) return false;
    if (!deviceId) return false;
    return allowedDeviceIds.has(deviceId);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) {
        setNotifications([]);
        return;
      }
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setNotifications(parsed as NotificationItem[]);
      }
    } catch {
      // Ignore storage read errors
    }
  }, [storageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(notifications.slice(0, MAX_NOTIFICATIONS)));
    } catch {
      // Ignore storage write errors
    }
  }, [notifications, storageKey]);

  const fetchNotifications = useCallback(async () => {
    if (status !== "authenticated") return;
    try {
      await refreshAllowedDeviceIds();

      const res = await fetch("/api/notifications/alerts");
      if (!res.ok) return;
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        const incoming = allowedDeviceIdsLoadedRef.current
          ? (json.data as NotificationItem[]).filter((item) =>
              isAllowedDevice(item.deviceId),
            )
          : (json.data as NotificationItem[]);
        setNotifications((prev) => mergeNotifications(prev, incoming));
      }
    } catch {
      // Silently ignore — pertahankan notif yang sudah ada
    }
  }, [isAllowedDevice, refreshAllowedDeviceIds, status]);

  // Polling
  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;

    const startPolling = async () => {
      await refreshAllowedDeviceIds();
      if (cancelled) return;

      fetchNotifications();
      timerRef.current = setInterval(fetchNotifications, POLL_MS);
    };

    startPolling();

    return () => {
      cancelled = true;
      if (timerRef.current) clearInterval(timerRef.current);
      if (throttleRef.current) clearTimeout(throttleRef.current);
    };
  }, [fetchNotifications, refreshAllowedDeviceIds, status]);

  // Pusher realtime — hanya trigger fetch, tidak replace state
  useEffect(() => {
    if (status !== "authenticated" || typeof window === "undefined") return;
    if (!process.env.NEXT_PUBLIC_PUSHER_KEY) return;

    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    const startRealtimeSubscription = async () => {
      await refreshAllowedDeviceIds();
      if (cancelled) return;

      import("@/lib/pusher-client")
        .then(({ subscribeToGlobalAlertEvents }) => {
          if (cancelled) return;

          unsubscribe = subscribeToGlobalAlertEvents((payload: AlertEventPayload) => {
            if (payload.status === "CLEARED") return;
            if (!isAllowedDevice(payload.deviceId)) return;

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
    };

    startRealtimeSubscription();

    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
    };
  }, [isAllowedDevice, status]);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        total: notifications.length,
        refresh: fetchNotifications,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}