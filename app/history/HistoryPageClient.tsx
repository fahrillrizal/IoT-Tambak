"use client";

import { useEffect, useRef, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import DashboardHeader from "@/components/dashboard/DashboardHeader";
import PondSelector from "@/components/dashboard/PondSelector";
import { HistorySkeleton } from "@/components/skeletons/HistorySkeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Activity, Calendar, Database, AlertTriangle, Wrench, ChevronDown } from "lucide-react";
import { useAuth, useDeviceSelection } from "@/hooks/useDashboard";
import type { NotificationItem } from "@/components/layout/DashboardLayout";

const SEVERITY_STYLES = {
  high: "bg-red-100 text-red-700",
  medium: "bg-yellow-100 text-yellow-700",
  normal: "bg-green-100 text-green-700",
  info: "bg-blue-100 text-blue-700",
};

const TYPE_ICONS = {
  alert: AlertTriangle,
  reading: Activity,
  maintenance: Wrench,
};

interface HistoryPageClientProps {
  defaultCollapsed?: boolean;
}

interface HistoryStats {
  activeDays: number;
  firstDataAt: string | null;
  totalData: number;
}

interface AlertHistoryItem {
  id: string;
  severity: "CRITICAL" | "WARNING";
  status: "ACTIVE" | "CLEARED" | "ACKNOWLEDGED";
  message: string;
  issueCount?: number | null;
  parameters?: Record<string, number> | null;
  action?: string | null;
  eventTime: string;
}

interface TelemetryPoint {
  timestamp: number;
  temperature?: number;
  ph?: number;
  dissolvedOxygen?: number;
  salinity?: number;
  turbidity?: number;
}

interface HistoryLogItem {
  id: string;
  date: string;
  time: string;
  type: "alert" | "reading" | "maintenance";
  message: string;
  severity: "high" | "medium" | "normal" | "info";
  timestampMs: number;
}

const PERIOD_TO_DAYS: Record<string, number> = {
  "7days": 7,
  "30days": 30,
  "90days": 90,
};

function formatIndonesiaDate(dateString: string | null): string {
  if (!dateString) return "Belum ada data";

  return new Date(dateString).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
  });
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("id-ID").format(value);
}

function formatMetric(value: number | undefined, unit: string, fractionDigits = 1) {
  if (value === undefined || value === null || Number.isNaN(value)) return null;
  return `${value.toFixed(fractionDigits)}${unit}`;
}

function buildReadingMessage(point: TelemetryPoint): string {
  const parts: string[] = [];

  const temperature = formatMetric(point.temperature, "°C", 1);
  const ph = formatMetric(point.ph, "", 2);
  const dissolvedOxygen = formatMetric(point.dissolvedOxygen, " mg/L", 1);
  const salinity = formatMetric(point.salinity, " ppt", 1);
  const turbidity = formatMetric(point.turbidity, " NTU", 1);

  if (temperature) parts.push(`Suhu ${temperature}`);
  if (ph) parts.push(`pH ${ph}`);
  if (dissolvedOxygen) parts.push(`DO ${dissolvedOxygen}`);
  if (salinity) parts.push(`Salinitas ${salinity}`);
  if (turbidity) parts.push(`Turbidity ${turbidity}`);

  if (parts.length === 0) {
    return "Data sensor diterima";
  }

  return parts.join(" • ");
}

function getTelemetrySeverity(point: TelemetryPoint): "high" | "medium" | "normal" {
  const t = point.temperature;
  const p = point.ph;
  const d = point.dissolvedOxygen;
  const s = point.salinity;
  const tb = point.turbidity;

  if (
    (t !== undefined && (t < 26 || t > 32)) ||
    (p !== undefined && (p < 7.5 || p > 8.5)) ||
    (d !== undefined && (d < 4 || d > 8)) ||
    (s !== undefined && (s < 10 || s > 35)) ||
    (tb !== undefined && tb > 80)
  ) {
    return "high";
  }

  if (
    (t !== undefined && (t < 27 || t > 31)) ||
    (p !== undefined && (p < 7.8 || p > 8.2)) ||
    (d !== undefined && (d < 5 || d > 7.5)) ||
    (s !== undefined && (s < 15 || s > 30)) ||
    (tb !== undefined && (tb < 10 || tb > 50))
  ) {
    return "medium";
  }

  return "normal";
}

function buildAlertMessage(item: AlertHistoryItem): string {
  const parameterParts: string[] = [];
  const params = item.parameters || {};

  if (typeof params.temperature === "number") {
    parameterParts.push(`Suhu ${params.temperature.toFixed(1)}°C`);
  }
  if (typeof params.ph === "number") {
    parameterParts.push(`pH ${params.ph.toFixed(2)}`);
  }
  if (typeof params.dissolvedOxygen === "number") {
    parameterParts.push(`DO ${params.dissolvedOxygen.toFixed(1)} mg/L`);
  }
  if (typeof params.salinity === "number") {
    parameterParts.push(`Salinitas ${params.salinity.toFixed(1)} ppt`);
  }
  if (typeof params.turbidity === "number") {
    parameterParts.push(`Turbidity ${params.turbidity.toFixed(1)} NTU`);
  }

  const base = `${item.severity}: ${item.message}`;

  if (parameterParts.length === 0) {
    return base;
  }

  return `${base} • ${parameterParts.join(" • ")}`;
}

export default function HistoryPageClient({ defaultCollapsed }: HistoryPageClientProps) {
  const { status } = useAuth();
  const { selectedDevice, setSelectedDevice, devices } = useDeviceSelection();
  const [period, setPeriod] = useState("7days");
  const [filterType, setFilterType] = useState<string>("all");
  const [stats, setStats] = useState<HistoryStats>({
    activeDays: 0,
    firstDataAt: null,
    totalData: 0,
  });
  const [isStatsLoading, setIsStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [alarmLogs, setAlarmLogs] = useState<HistoryLogItem[]>([]);
  const [readingLogs, setReadingLogs] = useState<HistoryLogItem[]>([]);
  const [notificationItems, setNotificationItems] = useState<NotificationItem[]>([]);
  const [alertCount, setAlertCount] = useState(0);
  const [visibleCount, setVisibleCount] = useState(20);
  const [activityRefreshKey, setActivityRefreshKey] = useState(0);
  const lastRealtimeTsRef = useRef<number | null>(null);

  const mergedLogs = [...alarmLogs, ...readingLogs].sort(
    (a, b) => b.timestampMs - a.timestampMs
  );
  const filteredLogs = filterType === "all"
    ? mergedLogs
    : mergedLogs.filter(log => log.type === filterType);
  const visibleLogs = filteredLogs.slice(0, visibleCount);

  useEffect(() => {
    const fetchHistoryStats = async () => {
      if (!selectedDevice) {
        setStats({ activeDays: 0, firstDataAt: null, totalData: 0 });
        return;
      }

      setIsStatsLoading(true);
      setStatsError(null);

      try {
        const response = await fetch(`/api/history/stats?deviceId=${selectedDevice}&period=${period}`);
        const result = await response.json();

        if (result.success && result.data) {
          setStats({
            activeDays: result.data.activeDays ?? 0,
            firstDataAt: result.data.firstDataAt ?? null,
            totalData: result.data.totalData ?? 0,
          });
        } else {
          setStatsError(result.error || "Gagal memuat statistik");
        }
      } catch (error) {
        setStatsError("Gagal memuat statistik");
        console.error("Failed to fetch history stats:", error);
      } finally {
        setIsStatsLoading(false);
      }
    };

    fetchHistoryStats();
  }, [selectedDevice, period]);

  useEffect(() => {
    const fetchActivity = async () => {
      if (!selectedDevice) {
        setAlarmLogs([]);
        setReadingLogs([]);
        setNotificationItems([]);
        setAlertCount(0);
        return;
      }

      try {
        const days = PERIOD_TO_DAYS[period] || 7;
        const hours = days * 24;
        const startTs = Date.now() - hours * 60 * 60 * 1000;

        const [telemetryResponse, alertHistoryResponse] = await Promise.all([
          fetch(`/api/telemetry/history?deviceId=${selectedDevice}&hours=${hours}&limit=5000`),
          fetch(`/api/history/alerts?deviceId=${selectedDevice}&period=${period}`),
        ]);

        const telemetryResult = await telemetryResponse.json();
        const alertHistoryResult = await alertHistoryResponse.json();

        if (!telemetryResult.success || !Array.isArray(telemetryResult.data)) {
          setReadingLogs([]);
        } else {
          const telemetryPoints = (telemetryResult.data as TelemetryPoint[])
            .filter((point) => point.timestamp >= startTs)
            .sort((a, b) => b.timestamp - a.timestamp);

          const nextReadingLogs: HistoryLogItem[] = telemetryPoints.map((point) => {
            const createdAt = new Date(point.timestamp);
            const severity = getTelemetrySeverity(point);
            return {
              id: `reading-${point.timestamp}`,
              date: createdAt.toLocaleDateString("id-ID"),
              time: createdAt.toLocaleTimeString("id-ID", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              }),
              type: "reading",
              message: buildReadingMessage(point),
              severity,
              timestampMs: point.timestamp,
            };
          });

          setReadingLogs(nextReadingLogs);

          const fallbackAlertLogs: HistoryLogItem[] = telemetryPoints
            .filter((point) => getTelemetrySeverity(point) !== "normal")
            .slice(0, 200)
            .map((point) => {
              const createdAt = new Date(point.timestamp);
              const severity = getTelemetrySeverity(point);
              return {
                id: `derived-alert-${point.timestamp}`,
                date: createdAt.toLocaleDateString("id-ID"),
                time: createdAt.toLocaleTimeString("id-ID", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                }),
                type: "alert",
                message: `${severity === "high" ? "CRITICAL" : "WARNING"}: ${buildReadingMessage(point)}`,
                severity,
                timestampMs: point.timestamp,
              };
            });

          const alerts = Array.isArray(alertHistoryResult.data)
            ? (alertHistoryResult.data as AlertHistoryItem[])
            : [];

          if (alerts.length === 0) {
            setAlarmLogs(fallbackAlertLogs);
            setAlertCount(fallbackAlertLogs.length);
            setNotificationItems(
              fallbackAlertLogs.slice(0, 20).map((log) => ({
                id: `notif-${log.id}`,
                severity: log.severity === "high" ? "critical" : "warning",
                message: log.message,
                timestamp: new Date(log.timestampMs).toISOString(),
                action: log.severity === "high" ? "SEGERA CEK TAMBAK!" : "Perlu pengecekan",
              }))
            );
            return;
          }
        }

        const alerts = Array.isArray(alertHistoryResult.data)
          ? (alertHistoryResult.data as AlertHistoryItem[])
          : [];

        if (alerts.length === 0) {
          setAlarmLogs([]);
          setNotificationItems([]);
          setAlertCount(0);
          return;
        }

        const sortedAlerts = [...alerts].sort(
          (a, b) =>
            new Date(b.eventTime).getTime() - new Date(a.eventTime).getTime()
        );

        const nextAlarmLogs: HistoryLogItem[] = sortedAlerts.map((alert) => {
          const createdAt = new Date(alert.eventTime);
          const isCritical = alert.severity === "CRITICAL";

          return {
            id: `alarm-${alert.id}`,
            date: createdAt.toLocaleDateString("id-ID"),
            time: createdAt.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }),
            type: "alert" as const,
            message: buildAlertMessage(alert),
            severity: isCritical ? "high" as const : "medium" as const,
            timestampMs: createdAt.getTime(),
          };
        });

        const alarmNotifications = sortedAlerts
          .filter(
            (alert) =>
              alert.status === "ACTIVE" &&
              (alert.severity === "WARNING" || alert.severity === "CRITICAL")
          )
          .map((alert) => {
            return {
              id: `notif-${alert.id}`,
              severity:
                alert.severity === "CRITICAL"
                  ? ("critical" as const)
                  : ("warning" as const),
              message: buildAlertMessage(alert),
              timestamp: new Date(alert.eventTime).toISOString(),
              action:
                alert.action ||
                (alert.severity === "CRITICAL"
                  ? "SEGERA CEK TAMBAK!"
                  : "Perlu pengecekan"),
            };
          });

        setAlarmLogs(nextAlarmLogs);
        setNotificationItems(alarmNotifications);
        setAlertCount(alertHistoryResult.summary?.total ?? nextAlarmLogs.length);
      } catch (error) {
        console.error("Failed to fetch activity:", error);
      }
    };

    fetchActivity();
    const interval = setInterval(fetchActivity, 5000);

    return () => clearInterval(interval);
  }, [selectedDevice, period, activityRefreshKey]);

  useEffect(() => {
    setVisibleCount(20);
  }, [selectedDevice, period, filterType]);

  useEffect(() => {
    if (!selectedDevice || typeof window === "undefined") {
      return;
    }

    let unsubscribe: (() => void) | undefined;
    const isDev = process.env.NODE_ENV === "development";

    const handleRealtimeIncrement = (payload: { deviceId: string; timestamp?: number }) => {
      if (payload.deviceId !== selectedDevice) return;

      const eventTimestamp = payload.timestamp ?? Date.now();
      if (lastRealtimeTsRef.current === eventTimestamp) return;

      lastRealtimeTsRef.current = eventTimestamp;

      setStats((prev) => ({
        ...prev,
        totalData: prev.totalData + 1,
        activeDays: prev.activeDays || 1,
        firstDataAt: prev.firstDataAt || new Date(eventTimestamp).toISOString(),
      }));
    };

    if (isDev) {
      import("@/lib/socket-client").then(({ subscribeToGlobalWebSocket }) => {
        unsubscribe = subscribeToGlobalWebSocket(handleRealtimeIncrement);
      });
    } else if (process.env.NEXT_PUBLIC_PUSHER_KEY) {
      import("@/lib/pusher-client").then(({ subscribeToDeviceTelemetry }) => {
        unsubscribe = subscribeToDeviceTelemetry(selectedDevice, handleRealtimeIncrement);
      });
    }

    return () => {
      if (unsubscribe) unsubscribe();
      lastRealtimeTsRef.current = null;
    };
  }, [selectedDevice]);

  useEffect(() => {
    if (!selectedDevice || typeof window === "undefined") {
      return;
    }

    let unsubscribe: (() => void) | undefined;

    if (process.env.NODE_ENV !== "development" && process.env.NEXT_PUBLIC_PUSHER_KEY) {
      import("@/lib/pusher-client").then(({ subscribeToDeviceAlertEvents }) => {
        unsubscribe = subscribeToDeviceAlertEvents(selectedDevice, () => {
          setActivityRefreshKey((prev) => prev + 1);
        });
      });
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [selectedDevice]);

  // Loading - tampilkan skeleton di dalam layout
  if (status === "loading") {
    return (
      <DashboardLayout activeMenu="history" defaultCollapsed={defaultCollapsed}>
        <HistorySkeleton />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      activeMenu="history"
      notificationCount={notificationItems.length}
      notificationItems={notificationItems}
      defaultCollapsed={defaultCollapsed}
    >
      <div className="mb-20 lg:mb-0">
        <DashboardHeader title="History Alat" subtitle="Riwayat lengkap aktivitas dan data monitoring alat IoT" />

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="flex-1">
            <label className="text-sm font-medium text-gray-700 mb-2 block">Perangkat</label>
            <PondSelector devices={devices} selectedDevice={selectedDevice} onDeviceChange={setSelectedDevice} />
          </div>
          <div className="w-full sm:w-48">
            <label className="text-sm font-medium text-gray-700 mb-2 block">Periode</label>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7days">7 Hari Terakhir</SelectItem>
                <SelectItem value="30days">30 Hari Terakhir</SelectItem>
                <SelectItem value="90days">90 Hari Terakhir</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card className="bg-white">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-cyan-100 rounded-lg"><Calendar className="h-5 w-5 text-cyan-600" /></div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">
                    {isStatsLoading ? "..." : formatNumber(stats.activeDays)}
                  </p>
                  <p className="text-sm text-gray-500">Hari Aktif</p>
                  <p className="text-xs text-gray-400">
                    Sejak {formatIndonesiaDate(stats.firstDataAt)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg"><Database className="h-5 w-5 text-blue-600" /></div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">
                    {isStatsLoading ? "..." : formatNumber(stats.totalData)}
                  </p>
                  <p className="text-sm text-gray-500">Total Data</p>
                  {statsError ? (
                    <p className="text-xs text-red-500">{statsError}</p>
                  ) : null}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-yellow-100 rounded-lg"><AlertTriangle className="h-5 w-5 text-yellow-600" /></div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{formatNumber(alertCount)}</p>
                  <p className="text-sm text-gray-500">Alert</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 rounded-lg"><Wrench className="h-5 w-5 text-purple-600" /></div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">3</p>
                  <p className="text-sm text-gray-500">Maintenance</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Activity Log */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <CardTitle className="text-lg">Riwayat Aktivitas</CardTitle>
              <div className="flex gap-2 flex-wrap">
                {["all", "alert", "reading", "maintenance"].map((type) => (
                  <Button
                    key={type}
                    variant={filterType === type ? "default" : "outline"}
                    size="sm"
                    onClick={() => setFilterType(type)}
                    className={filterType === type ? "bg-cyan-600 hover:bg-cyan-700" : ""}
                  >
                    {type === "all" ? "Semua" : type.charAt(0).toUpperCase() + type.slice(1)}
                  </Button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {visibleLogs.length === 0 ? (
                <div className="p-6 rounded-lg border border-dashed border-gray-300 text-center text-sm text-gray-500">
                  Tidak ada data untuk periode ini.
                </div>
              ) : null}

              {visibleLogs.map((log) => {
                const Icon = TYPE_ICONS[log.type as keyof typeof TYPE_ICONS];
                return (
                  <div key={log.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className={`p-2 rounded-lg ${log.type === "alert" ? "bg-yellow-100" : log.type === "reading" ? "bg-blue-100" : "bg-purple-100"}`}>
                        <Icon className={`h-4 w-4 ${log.type === "alert" ? "text-yellow-600" : log.type === "reading" ? "text-blue-600" : "text-purple-600"}`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          <span>{log.date}</span><span>•</span><span>{log.time}</span>
                        </div>
                        <p className="font-medium text-gray-900">{log.message}</p>
                      </div>
                    </div>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${SEVERITY_STYLES[log.severity as keyof typeof SEVERITY_STYLES]}`}>
                      {log.severity === "high" ? "Tinggi" : log.severity === "medium" ? "Sedang" : log.severity === "normal" ? "Normal" : "Info"}
                    </span>
                  </div>
                );
              })}
            </div>
            {filteredLogs.length > visibleCount ? (
              <div className="mt-4 text-center">
                <Button
                  variant="outline"
                  className="w-full sm:w-auto"
                  onClick={() => setVisibleCount((prev) => prev + 20)}
                >
                  <ChevronDown className="h-4 w-4 mr-2" />Muat Lebih Banyak
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
