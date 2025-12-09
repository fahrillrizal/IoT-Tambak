// hooks/useThingsBoard.ts
'use client';

import { useState, useEffect, useCallback } from 'react';
import type { SensorData } from '@/types/dashboard';

interface UseTelemetryOptions {
  deviceId: string;
  refreshInterval?: number;
  enabled?: boolean;
}

export function useTelemetry({
  deviceId,
  refreshInterval = 10000, // 10 detik
  enabled = true,
}: UseTelemetryOptions) {
  const [data, setData] = useState<SensorData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchTelemetry = useCallback(async () => {
    if (!deviceId) return;

    try {
      const response = await fetch(`/api/telemetry?deviceId=${deviceId}`);
      const result = await response.json();

      if (result.success) {
        setData(result.data);
        setLastUpdate(new Date());
        setError(null);
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError('Failed to fetch telemetry');
      console.error('Telemetry fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [deviceId]);

  useEffect(() => {
    if (!enabled) return;

    fetchTelemetry();
    const interval = setInterval(fetchTelemetry, refreshInterval);

    return () => clearInterval(interval);
  }, [fetchTelemetry, refreshInterval, enabled]);

  return { data, isLoading, error, lastUpdate, refresh: fetchTelemetry };
}

export function useAlarms(deviceId: string, limit = 10) {
  const [alarms, setAlarms] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAlarms = useCallback(async () => {
    if (!deviceId) return;

    try {
      const response = await fetch(
        `/api/alarms?deviceId=${deviceId}&limit=${limit}`
      );
      const result = await response.json();

      if (result.success) {
        setAlarms(result.data);
        setError(null);
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError('Failed to fetch alarms');
    } finally {
      setIsLoading(false);
    }
  }, [deviceId, limit]);

  const acknowledgeAlarm = async (alarmId: string) => {
    const response = await fetch('/api/alarms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alarmId, action: 'ack' }),
    });
    if (response.ok) {
      fetchAlarms();
    }
  };

  const clearAlarm = async (alarmId: string) => {
    const response = await fetch('/api/alarms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alarmId, action: 'clear' }),
    });
    if (response.ok) {
      fetchAlarms();
    }
  };

  useEffect(() => {
    fetchAlarms();
    const interval = setInterval(fetchAlarms, 30000); // Refresh setiap 30 detik
    return () => clearInterval(interval);
  }, [fetchAlarms]);

  return { alarms, isLoading, error, refresh: fetchAlarms, acknowledgeAlarm, clearAlarm };
}

export function useTelemetryHistory(deviceId: string, hours = 24) {
  const [data, setData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!deviceId) return;

    const fetchHistory = async () => {
      try {
        const response = await fetch(
          `/api/telemetry/history?deviceId=${deviceId}&hours=${hours}`
        );
        const result = await response.json();
        if (result.success) {
          setData(result.data);
        }
      } catch (err) {
        console.error('History fetch error:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchHistory();
  }, [deviceId, hours]);

  return { data, isLoading };
}

export function useWeeklyTelemetry(deviceId: string) {
  const [chartData, setChartData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchWeeklyData = useCallback(async () => {
    if (!deviceId) return;

    setIsLoading(true);
    try {
      const response = await fetch(`/api/telemetry/weekly?deviceId=${deviceId}`);
      const result = await response.json();

      if (result.success) {
        setChartData(result.data);
        setError(null);
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError('Failed to fetch weekly data');
      console.error('Weekly telemetry error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [deviceId]);

  useEffect(() => {
    fetchWeeklyData();
    // Refresh setiap 5 menit
    const interval = setInterval(fetchWeeklyData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchWeeklyData]);

  return { chartData, isLoading, error, refresh: fetchWeeklyData };
}