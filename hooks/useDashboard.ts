import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import type {
  SensorData,
  FeedingSchedule,
  SensorDevice,
} from "@/types/dashboard";
import {
  DEFAULT_SENSOR_DATA,
  DEFAULT_FEEDING_SCHEDULES,
  SENSOR_DEVICES,
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
    setIsLoading(true);
    setError(null);
    try {
      setSensorData(DEFAULT_SENSOR_DATA);
    } catch (err) {
      setError("Failed to fetch sensor data");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (deviceId) {
      fetchSensorData(deviceId);
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
  const [selectedDevice, setSelectedDevice] = useState(
    initialDevice || SENSOR_DEVICES[0].name
  );
  const [devices] = useState<SensorDevice[]>(SENSOR_DEVICES);

  const currentDevice =
    devices.find((d) => d.name === selectedDevice) || devices[0];
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
