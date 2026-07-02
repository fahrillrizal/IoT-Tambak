import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import type {
  TelemetryData,
  FeedingSchedule,
  SensorDevice,
  ChartData,
} from "@/types/dashboard";
import {
  DEFAULT_SENSOR_DATA,
  DEFAULT_FEEDING_SCHEDULES,
} from "@/constants/dashboard";

function calculateStatus(
  data: Partial<TelemetryData>
): TelemetryData["status"] {
  const t = data.temperature;
  const p = data.ph;
  const d = data.dissolvedOxygen;
  const s = data.salinity;

  if (t === null && p === null && d === null && s === null) {
    return "Offline";
  }

  // Water quality — Critical
  if (
    (t !== undefined && t !== null && (t < 24 || t > 32)) ||
    (p !== undefined && p !== null && (p < 6.0 || p > 8.4)) ||
    (d !== undefined && d !== null && d < 4.9) ||
    (s !== undefined && s !== null && (s < 8 || s > 35)) ||
    (data.turbidity !== undefined &&
      data.turbidity !== null &&
      data.turbidity > 40)
  ) {
    return "Critical";
  }

  // Water quality — Warning
  if (
    (t !== undefined && t !== null && (t === 25 || t === 31)) ||
    (p !== undefined && p !== null && (p < 7.0 || p > 8.0)) ||
    (d !== undefined && d !== null && d < 5 && d >= 4.9) ||
    (s !== undefined &&
      s !== null &&
      (s < 10 || (s > 30 && s <= 35))) ||
    (data.turbidity !== undefined &&
      data.turbidity !== null &&
      data.turbidity > 25 &&
      data.turbidity <= 40)
  ) {
    return "Warning";
  }

  return "Normal";
}

export function useAuth() {
  const { data: session, status, update: updateSession } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  return { session, status, updateSession };
}

export function usePasswordCheck() {
  const { status } = useSession();
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    const checkPassword = async () => {
      if (status !== "authenticated") return;

      const skipped = sessionStorage.getItem("skippedSetPassword") === "true";
      if (skipped) return;

      try {
        const res = await fetch("/api/settings/check-password");
        const data = await res.json();
        if (data.needsPassword === true) {
          setShowModal(true);
        }
      } catch (e) {
        console.error("Failed to check password status", e);
      }
    };

    checkPassword();
  }, [status]);

  const handlePasswordSet = useCallback(() => {
    setShowModal(false);
  }, []);

  const handleClose = useCallback(() => {
    setShowModal(false);
  }, []);

  return { showModal, handlePasswordSet, handleClose };
}

export function useSensorData(deviceId?: string) {
  const [sensorData, setSensorData] = useState<TelemetryData>({
    temperature: null,
    ph: null,
    dissolvedOxygen: null,
    salinity: null,
    turbidity: null,
    battery: null,
    status: "Offline",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);

  const unsubscribeRef = useRef<(() => void) | null>(null);
  const deviceIdRef = useRef<string | undefined>(deviceId);

  const fetchSensorData = useCallback(async (id?: string) => {
    if (!id) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/telemetry?deviceId=${id}`);
      const result = await response.json();

      if (result.success && result.data) {
        const partialData = {
          temperature: result.data.temperature ?? null,
          ph: result.data.ph ?? null,
          dissolvedOxygen: result.data.dissolvedOxygen ?? null,
          salinity: result.data.salinity ?? null,
          turbidity: result.data.turbidity ?? null,
          battery: result.data.battery ?? null,
        };

        setSensorData({
          ...partialData,
          status: calculateStatus(partialData),
        });
        setLastUpdate(Date.now());
      } else {
        setError(result.error || "Failed to fetch data");
      }
    } catch (err) {
      setError("Failed to fetch sensor data");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    deviceIdRef.current = deviceId;

    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }

    if (!deviceId) {
      setSensorData({
        temperature: null,
        ph: null,
        dissolvedOxygen: null,
        salinity: null,
        turbidity: null,
        battery: null,
        status: "Offline",
      });
      setIsConnected(false);
      return;
    }

    fetchSensorData(deviceId);

    if (typeof window !== "undefined") {
      const isDev = process.env.NODE_ENV === "development";
      const hasPusher = !!process.env.NEXT_PUBLIC_PUSHER_KEY;

      console.log(
        `🔌 Setting up realtime: isDev=${isDev}, hasPusher=${hasPusher}`
      );

      const handleTelemetryUpdate = (data: any) => {
        if (deviceIdRef.current !== deviceId) {
          console.log("⏭️ Ignoring update for old device");
          return;
        }

        console.log("📡 Realtime update received:", data);

        const partialData = {
          temperature: data.temperature ?? null,
          ph: data.ph ?? null,
          dissolvedOxygen: data.dissolvedOxygen ?? null,
          salinity: data.salinity ?? null,
          turbidity: data.turbidity ?? null,
          battery: data.battery ?? null,
        };

        setSensorData({
          ...partialData,
          status: calculateStatus(partialData),
        });
        setLastUpdate(data.timestamp || Date.now());
        setIsConnected(true);
      };

      if (isDev) {
        import("@/lib/socket-client")
          .then(({ subscribeToDeviceWebSocket }) => {
            unsubscribeRef.current = subscribeToDeviceWebSocket(
              deviceId,
              handleTelemetryUpdate
            );
            setIsConnected(true);
          })
          .catch((err) => {
            console.error("Failed to setup WebSocket:", err);
            setIsConnected(false);
          });
      } else if (hasPusher) {
        import("@/lib/pusher-client")
          .then(({ subscribeToDeviceTelemetry }) => {
            unsubscribeRef.current = subscribeToDeviceTelemetry(
              deviceId,
              handleTelemetryUpdate
            );
            setIsConnected(true);
          })
          .catch((err) => {
            console.error("Failed to setup Pusher:", err);
            setIsConnected(false);
          });
      } else {
        console.warn("⚠️ No realtime provider configured");
        setIsConnected(false);
      }
    }

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [deviceId, fetchSensorData]);

  return {
    sensorData,
    isLoading,
    error,
    isConnected,
    lastUpdate,
    fetchSensorData,
    setSensorData,
  };
}

export function useFeedingSchedule() {
  const [schedules, setSchedules] = useState<FeedingSchedule[]>(
    DEFAULT_FEEDING_SCHEDULES
  );
  const [isLoading, setIsLoading] = useState(false);

  const updateSchedule = useCallback(
    (index: number, updates: Partial<FeedingSchedule>) => {
      setSchedules((prev) =>
        prev.map((schedule, i) =>
          i === index ? { ...schedule, ...updates } : schedule
        )
      );
    },
    []
  );

  const addSchedule = useCallback((schedule: FeedingSchedule) => {
    setSchedules((prev) => [...prev, schedule]);
  }, []);

  const removeSchedule = useCallback((index: number) => {
    setSchedules((prev) => prev.filter((_, i) => i !== index));
  }, []);

  return {
    schedules,
    isLoading,
    updateSchedule,
    addSchedule,
    removeSchedule,
    setSchedules,
  };
}

const DEVICE_OFFLINE_TIMEOUT = 60 * 1000;

export function useDeviceSelection(initialDevice?: string) {
  const [devices, setDevices] = useState<SensorDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState(initialDevice || "");
  const [isLoading, setIsLoading] = useState(true);

  const lastTelemetryRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const fetchDevices = async () => {
      try {
        const response = await fetch("/api/devices");
        const result = await response.json();

        if (result.success) {
          const fetchedDevices = result.data || [];

          setDevices(fetchedDevices);

          if (fetchedDevices.length && !selectedDevice) {
            setSelectedDevice(fetchedDevices[0].thingsboardDeviceId || "");
          }
          if (!fetchedDevices.length) {
            setSelectedDevice("");
          }
        }
      } catch (error) {
        console.error("Failed to fetch devices:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDevices();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let unsubscribeStatus: (() => void) | undefined;
    let unsubscribeTelemetry: (() => void) | undefined;
    const isDev = process.env.NODE_ENV === "development";

    const handleDeviceStatus = (data: {
      deviceId: string;
      isOnline: boolean;
    }) => {
      console.log("📡 Device status update received:", data);
      setDevices((prevDevices) =>
        prevDevices.map((device) =>
          device.thingsboardDeviceId === data.deviceId
            ? { ...device, isOnline: data.isOnline }
            : device
        )
      );
    };

    const handleTelemetry = (data: { deviceId: string }) => {
      const now = Date.now();

      lastTelemetryRef.current.set(data.deviceId, now);
      console.log(
        `📡 Telemetry received for ${data.deviceId}, updating timestamp`
      );

      setDevices((prevDevices) =>
        prevDevices.map((device) =>
          device.thingsboardDeviceId === data.deviceId
            ? { ...device, isOnline: true }
            : device
        )
      );
    };

    if (isDev) {
      import("@/lib/socket-client").then(
        ({ subscribeToDeviceStatus, subscribeToGlobalWebSocket }) => {
          unsubscribeStatus = subscribeToDeviceStatus(handleDeviceStatus);
          unsubscribeTelemetry = subscribeToGlobalWebSocket(handleTelemetry);
        }
      );
    } else if (process.env.NEXT_PUBLIC_PUSHER_KEY) {
      import("@/lib/pusher-client").then(
        ({ subscribeToDeviceStatus, subscribeToGlobalTelemetry }) => {
          unsubscribeStatus = subscribeToDeviceStatus(handleDeviceStatus);
          unsubscribeTelemetry = subscribeToGlobalTelemetry(handleTelemetry);
        }
      );
    }

    return () => {
      if (unsubscribeStatus) unsubscribeStatus();
      if (unsubscribeTelemetry) unsubscribeTelemetry();
    };
  }, []);

  useEffect(() => {
    const checkOfflineDevices = () => {
      const now = Date.now();

      setDevices((prevDevices) =>
        prevDevices.map((device) => {
          if (!device.thingsboardDeviceId) return device;

          const lastTime = lastTelemetryRef.current.get(
            device.thingsboardDeviceId
          );

          if (device.isOnline && lastTime) {
            const timeSinceLastTelemetry = now - lastTime;
            if (timeSinceLastTelemetry >= DEVICE_OFFLINE_TIMEOUT) {
              console.log(
                `⚠️ Device ${device.name} marked offline (no data for ${Math.round(timeSinceLastTelemetry / 1000)}s)`
              );
              return { ...device, isOnline: false };
            }
          }

          return device;
        })
      );
    };

    checkOfflineDevices();
    const interval = setInterval(checkOfflineDevices, 10000);

    return () => clearInterval(interval);
  }, [devices.length]);

  const currentDevice =
    devices.find((d) => d.thingsboardDeviceId === selectedDevice) || devices[0];
  const totalNotifications = devices.reduce(
    (sum, d) => sum + (d.notifications ?? 0),
    0
  );

  return {
    selectedDevice,
    setSelectedDevice,
    devices,
    currentDevice,
    totalNotifications,
    isLoading,
  };
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<number>(2);

  const addNotification = useCallback(() => {
    setNotifications((prev) => prev + 1);
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications(0);
  }, []);

  return { notifications, addNotification, clearNotifications };
}

export function useWeeklyChart(deviceIdOrPondId?: string | number) {
  const [chartData, setChartData] = useState<ChartData>({
    labels: [],
    datasets: [],
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<number>(0);

  const fetchWeeklyData = useCallback(async (id?: string | number) => {
    if (!id) {
      setChartData({ labels: [], datasets: [] });
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/telemetry/weekly?pondId=${id}`);
      const result = await response.json();

      if (result.success) {
        setChartData(result.data);
        setLastUpdate(Date.now());
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError("Failed to fetch weekly chart data");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!deviceIdOrPondId) return;

    fetchWeeklyData(deviceIdOrPondId);

    let unsubscribe: (() => void) | undefined;

    if (typeof window !== "undefined") {
      const isDev = process.env.NODE_ENV === "development";

      const handleSummaryUpdate = (data: { type: string }) => {
        if (data.type === "daily") {
          console.log("📊 Refreshing weekly chart due to daily summary update");
          fetchWeeklyData(deviceIdOrPondId);
        }
      };

      if (isDev) {
        import("@/lib/socket-client").then(({ subscribeToSummaryUpdates }) => {
          unsubscribe = subscribeToSummaryUpdates(handleSummaryUpdate);
        });
      } else if (process.env.NEXT_PUBLIC_PUSHER_KEY) {
        import("@/lib/pusher-client").then(({ subscribeToSummaryUpdates }) => {
          unsubscribe = subscribeToSummaryUpdates(handleSummaryUpdate);
        });
      }
    }

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [deviceIdOrPondId, fetchWeeklyData]);

  return { chartData, isLoading, error, lastUpdate, refresh: fetchWeeklyData };
}

export function useHourlyChart(deviceId?: string) {
  const [chartData, setChartData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<number>(0);

  const fetchHourlyData = useCallback(async (id?: string) => {
    if (!id) {
      setChartData([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/telemetry/history?deviceId=${id}&hours=24`
      );
      const result = await response.json();

      if (result.success) {
        setChartData(result.data);
        setLastUpdate(Date.now());
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError("Failed to fetch hourly chart data");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!deviceId) return;

    fetchHourlyData(deviceId);

    let unsubscribe: (() => void) | undefined;

    if (typeof window !== "undefined") {
      const isDev = process.env.NODE_ENV === "development";

      let lastRefresh = 0;
      const REFRESH_DEBOUNCE = 5 * 60 * 1000;

      const handleTelemetryUpdate = () => {
        const now = Date.now();
        if (now - lastRefresh >= REFRESH_DEBOUNCE) {
          lastRefresh = now;
          console.log("📊 Refreshing hourly chart due to new telemetry");
          fetchHourlyData(deviceId);
        }
      };

      if (isDev) {
        import("@/lib/socket-client").then(({ subscribeToDeviceWebSocket }) => {
          unsubscribe = subscribeToDeviceWebSocket(
            deviceId,
            handleTelemetryUpdate
          );
        });
      } else if (process.env.NEXT_PUBLIC_PUSHER_KEY) {
        import("@/lib/pusher-client").then(({ subscribeToDeviceTelemetry }) => {
          unsubscribe = subscribeToDeviceTelemetry(
            deviceId,
            handleTelemetryUpdate
          );
        });
      }
    }

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [deviceId, fetchHourlyData]);

  return { chartData, isLoading, error, lastUpdate, refresh: fetchHourlyData };
}

export function useDailySummary(pondId?: number) {
  const [summaries, setSummaries] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<number>(0);

  const fetchDailySummary = useCallback(async (id?: number) => {
    if (!id) {
      setSummaries([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/telemetry/daily-summary?pondId=${id}&days=7`
      );
      const result = await response.json();

      if (result.success) {
        setSummaries(result.data);
        setLastUpdate(Date.now());
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError("Failed to fetch daily summary");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!pondId) return;

    fetchDailySummary(pondId);

    let unsubscribe: (() => void) | undefined;

    if (typeof window !== "undefined") {
      const isDev = process.env.NODE_ENV === "development";

      const handleSummaryUpdate = (data: { type: string }) => {
        if (data.type === "daily") {
          console.log("📊 Refreshing daily summary due to cron update");
          fetchDailySummary(pondId);
        }
      };

      if (isDev) {
        import("@/lib/socket-client").then(({ subscribeToSummaryUpdates }) => {
          unsubscribe = subscribeToSummaryUpdates(handleSummaryUpdate);
        });
      } else if (process.env.NEXT_PUBLIC_PUSHER_KEY) {
        import("@/lib/pusher-client").then(({ subscribeToSummaryUpdates }) => {
          unsubscribe = subscribeToSummaryUpdates(handleSummaryUpdate);
        });
      }
    }

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [pondId, fetchDailySummary]);

  return {
    summaries,
    isLoading,
    error,
    lastUpdate,
    refresh: fetchDailySummary,
  };
}

/**
 * Hook for fetching real feeding frequency chart data (7-day bar chart)
 */
export function useFeedingChart(pondId?: number) {
  const [chartData, setChartData] = useState<ChartData>({
    labels: [],
    datasets: [],
  });
  const [isLoading, setIsLoading] = useState(false);

  const fetchFeedingChart = useCallback(async (id?: number) => {
    if (!id) {
      setChartData({ labels: [], datasets: [] });
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`/api/history/feeding-chart?pondId=${id}`);
      const result = await response.json();
      if (result.success) {
        setChartData(result.data);
      }
    } catch (err) {
      console.error("Failed to fetch feeding chart:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (pondId) {
      fetchFeedingChart(pondId);
    }
  }, [pondId, fetchFeedingChart]);

  return { chartData, isLoading, refresh: fetchFeedingChart };
}

interface ScheduleItem {
  id: number;
  pondId: number;
  name: string;
  time: string;
  amount: number;
  daysOfWeek: string;
  isActive: boolean;
  status: "completed" | "pending" | "skipped";
}

/**
 * Hook for fetching real feeding schedules from DB with CRUD support
 */
export function useRealFeedingSchedule(pondId?: number) {
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchSchedules = useCallback(async (id?: number) => {
    if (!id) {
      setSchedules([]);
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`/api/feeding-schedules?pondId=${id}`);
      const result = await response.json();
      if (result.success) {
        setSchedules(result.data);
      }
    } catch (err) {
      console.error("Failed to fetch feeding schedules:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const addSchedule = useCallback(
    async (data: { time: string; amount: number; name?: string; daysOfWeek?: string; forceAmount?: boolean }) => {
      if (!pondId) return null;
      try {
        const response = await fetch("/api/feeding-schedules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pondId, ...data }),
        });
        const result = await response.json();
        if (result.success) {
          await fetchSchedules(pondId);
          return result; // includes data + ai_recommendation
        }
        return result; // includes error + ai_recommendation (for blocked case)
      } catch (err) {
        console.error("Failed to add schedule:", err);
        return null;
      }
    },
    [pondId, fetchSchedules]
  );

  const deleteSchedule = useCallback(
    async (id: number) => {
      try {
        const response = await fetch("/api/feeding-schedules", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        });
        const result = await response.json();
        if (result.success) {
          setSchedules((prev) => prev.filter((s) => s.id !== id));
          return true;
        }
        return false;
      } catch (err) {
        console.error("Failed to delete schedule:", err);
        return false;
      }
    },
    []
  );

  useEffect(() => {
    if (pondId) {
      fetchSchedules(pondId);
    }
  }, [pondId, fetchSchedules]);

  return { schedules, isLoading, addSchedule, deleteSchedule, refetch: () => pondId && fetchSchedules(pondId) };
}
