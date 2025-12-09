import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import type {
  SensorData,
  FeedingSchedule,
  SensorDevice,
  ChartData,
} from "@/types/dashboard";
import {
  DEFAULT_SENSOR_DATA,
  DEFAULT_FEEDING_SCHEDULES,
  SENSOR_DEVICES,
  TREND_CHART_DATA,
} from "@/constants/dashboard";

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
  const [sensorData, setSensorData] = useState<SensorData>(DEFAULT_SENSOR_DATA);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSensorData = useCallback(async (id?: string) => {
    if (!id) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/telemetry?deviceId=${id}`);
      const result = await response.json();

      if (result.success) {
        setSensorData({
          temperature: result.data.temperature || 0,
          ph: result.data.ph || 0,
          dissolvedOxygen: result.data.dissolvedOxygen || 0,
          salinity: result.data.salinity || 0,
          turbidity: result.data.turbidity || 0,
          status: result.data.status || "Normal",
        });
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError("Failed to fetch sensor data");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (deviceId) {
      // Initial fetch
      fetchSensorData(deviceId);
      
      // Polling fallback (setiap 10 detik)
      const interval = setInterval(() => fetchSensorData(deviceId), 10000);
      
      // Pusher realtime (opsional, akan ditambahkan jika ada PUSHER_KEY)
      if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_PUSHER_KEY) {
        import('@/lib/pusher-client').then(({ subscribeToDeviceTelemetry }) => {
          const unsubscribe = subscribeToDeviceTelemetry(deviceId, (data) => {
            console.log('📡 Realtime update from Pusher:', data);
            setSensorData({
              temperature: data.temperature || 0,
              ph: data.ph || 0,
              dissolvedOxygen: data.dissolvedOxygen || 0,
              salinity: data.salinity || 0,
              turbidity: data.turbidity || 0,
              status: data.status || "Normal",
            });
          });
          
          return () => unsubscribe();
        });
      }
      
      return () => clearInterval(interval);
    }
  }, [deviceId, fetchSensorData]);

  return { sensorData, isLoading, error, fetchSensorData, setSensorData };
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

export function useDeviceSelection(initialDevice?: string) {
  const [devices, setDevices] = useState<SensorDevice[]>(SENSOR_DEVICES);
  const [selectedDevice, setSelectedDevice] = useState(
    initialDevice || devices[0]?.deviceId || ""
  );
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchDevices = async () => {
      try {
        const response = await fetch('/api/devices');
        const result = await response.json();
        
        if (result.success && result.data.length > 0) {
          setDevices(result.data);
          if (!selectedDevice) {
            setSelectedDevice(result.data[0].deviceId);
          }
        }
      } catch (error) {
        console.error('Failed to fetch devices:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDevices();
  }, []);

  const currentDevice =
    devices.find((d) => d.deviceId === selectedDevice) || devices[0];
  const totalNotifications = devices.reduce(
    (sum, d) => sum + d.notifications,
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

export function useWeeklyChart(deviceId?: string) {
  const [chartData, setChartData] = useState<ChartData>(TREND_CHART_DATA);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchWeeklyData = useCallback(async (id?: string) => {
    if (!id) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/telemetry/weekly?deviceId=${id}`);
      const result = await response.json();

      if (result.success) {
        setChartData(result.data);
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError('Failed to fetch weekly chart data');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (deviceId) {
      fetchWeeklyData(deviceId);
      // Refresh setiap 5 menit
      const interval = setInterval(() => fetchWeeklyData(deviceId), 5 * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [deviceId, fetchWeeklyData]);

  return { chartData, isLoading, error, refresh: fetchWeeklyData };
}
