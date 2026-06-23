"use client";

import { useState, useEffect, useCallback, useRef } from "react";

export interface FeederTelemetry {
  battery: number | null;       // percentage (0-100)
  sisaPakan: number | null;     // gram
  feedingDone: number | null;   // gram (last feeding result from device)
  lastUpdate: number | null;
}

interface FeedingHistoryItem {
  id: string;
  feedingType: "MANUAL" | "AI" | "SCHEDULED" | "CONDITIONAL";
  feedingStatus: "COMPLETED" | "FAILED" | "PENDING" | "CANCELLED";
  amount: number;
  executedAt: string;
  notes: string | null;
}

interface ManualFeedResult {
  success: boolean;
  rpc_sent: boolean;
  feed_amount_g: number;
  water_quality: string;
  confidence: number;
  reason: string;
  warnings: string[];
  feeding_id?: string;
  device_name?: string;
  error?: string;
}

// Max capacity of hopper in grams (adjust to your hardware)
const FEED_HOPPER_MAX_GRAM = 5000;

/**
 * Hook for subscribing to real-time feeder telemetry (battery + sisaPakan)
 * via the same Pusher/WebSocket channel used for sensor data.
 * 
 * The ESP32 firmware sends these keys alongside sensor data:
 *   - "battery"   : percentage integer (0-100)
 *   - "sisaPakan" : remaining feed in grams
 *   - "feeding_done" : grams dispensed in last cycle (sent once after feeding)
 */
export function useFeederTelemetry(deviceId?: string) {
  const [telemetry, setTelemetry] = useState<FeederTelemetry>({
    battery: null,
    sisaPakan: null,
    feedingDone: null,
    lastUpdate: null,
  });
  const [isConnected, setIsConnected] = useState(false);

  const unsubscribeRef = useRef<(() => void) | null>(null);
  const deviceIdRef = useRef<string | undefined>(deviceId);

  // Initial fetch from ThingsBoard latest telemetry
  const fetchInitial = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/telemetry/feeder?deviceId=${id}`);
      if (res.ok) {
        const result = await res.json();
        if (result.success) {
          setTelemetry((prev) => ({
            ...prev,
            battery: result.data.battery ?? prev.battery,
            sisaPakan: result.data.sisaPakan ?? prev.sisaPakan,
            lastUpdate: Date.now(),
          }));
        }
      }
    } catch (err) {
      console.error("[useFeederTelemetry] fetch error:", err);
    }
  }, []);

  useEffect(() => {
    deviceIdRef.current = deviceId;

    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }

    if (!deviceId) {
      setTelemetry({ battery: null, sisaPakan: null, feedingDone: null, lastUpdate: null });
      setIsConnected(false);
      return;
    }

    // Fetch initial values
    fetchInitial(deviceId);

    // Subscribe to real-time updates
    if (typeof window !== "undefined") {
      const isDev = process.env.NODE_ENV === "development";
      const hasPusher = !!process.env.NEXT_PUBLIC_PUSHER_KEY;

      const handleUpdate = (data: any) => {
        if (deviceIdRef.current !== deviceId) return;

        setTelemetry((prev) => ({
          battery: data.battery != null ? Number(data.battery) : prev.battery,
          sisaPakan: data.sisaPakan != null ? Number(data.sisaPakan) : prev.sisaPakan,
          feedingDone: data.feeding_done != null ? Number(data.feeding_done) : prev.feedingDone,
          lastUpdate: data.timestamp || Date.now(),
        }));
        setIsConnected(true);
      };

      if (isDev) {
        import("@/lib/socket-client")
          .then(({ subscribeToDeviceWebSocket }) => {
            unsubscribeRef.current = subscribeToDeviceWebSocket(deviceId, handleUpdate);
            setIsConnected(true);
          })
          .catch(() => setIsConnected(false));
      } else if (hasPusher) {
        import("@/lib/pusher-client")
          .then(({ subscribeToDeviceTelemetry }) => {
            unsubscribeRef.current = subscribeToDeviceTelemetry(deviceId, handleUpdate);
            setIsConnected(true);
          })
          .catch(() => setIsConnected(false));
      }
    }

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [deviceId, fetchInitial]);

  // Compute feed stock percentage from gram value
  const feedStockPercent =
    telemetry.sisaPakan != null
      ? Math.round(Math.min(100, Math.max(0, (telemetry.sisaPakan / FEED_HOPPER_MAX_GRAM) * 100)))
      : null;

  return { telemetry, feedStockPercent, isConnected };
}

/**
 * Hook for manual feeding (RPC trigger via /api/feeding/manual)
 */
export function useManualFeeding() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ManualFeedResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const triggerFeed = useCallback(async (pondId: number, amountGram: number) => {
    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/feeding/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pondId, requestedAmount: amountGram }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to trigger feeding");
        setResult(data);
      } else {
        setResult(data);
      }
    } catch (err) {
      setError("Network error. Failed to send command.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return { triggerFeed, isLoading, result, error, reset };
}

/**
 * Hook for fetching feeding history for a pond
 */
export function useFeedingHistory(pondId?: number) {
  const [history, setHistory] = useState<FeedingHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [stats, setStats] = useState({
    totalSessions: 0,
    totalFeedKg: 0,
    avgPerDay: 0,
    successRate: 0,
    todayTotalGram: 0,
    todaySessions: 0,
    lastFeedingToday: null as string | null,
  });

  const fetchHistory = useCallback(async (id: number) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/history/feeding?pondId=${id}&limit=20`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setHistory(data.data || []);
          if (data.stats) {
            setStats(data.stats);
          }
        }
      }
    } catch (err) {
      console.error("[useFeedingHistory] error:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (pondId) {
      fetchHistory(pondId);
    }
  }, [pondId, fetchHistory]);

  return { history, stats, isLoading, refetch: () => pondId && fetchHistory(pondId) };
}
