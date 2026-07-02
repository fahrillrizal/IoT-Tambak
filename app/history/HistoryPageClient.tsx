"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import DashboardHeader from "@/components/dashboard/DashboardHeader";
import PondSelector from "@/components/dashboard/PondSelector";
import { HistorySkeleton } from "@/components/skeletons/HistorySkeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Activity,
  Calendar,
  Database,
  AlertTriangle,
  Wrench,
  ChevronDown,
  SlidersHorizontal,
} from "lucide-react";
import { useAuth, useDeviceSelection } from "@/hooks/useDashboard";

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
  metrics?: {
    temperature?: number;
    ph?: number;
    dissolvedOxygen?: number;
    salinity?: number;
    turbidity?: number;
  };
}

interface VariableFilters {
  temperature: VariableFilterRule;
  ph: VariableFilterRule;
  dissolvedOxygen: VariableFilterRule;
  salinity: VariableFilterRule;
  turbidity: VariableFilterRule;
}

type VariableFilterOperator = "eq" | "gte" | "lte" | "range";

interface VariableFilterRule {
  operator: VariableFilterOperator;
  value: string;
  valueTo: string;
}

const PERIOD_TO_DAYS: Record<string, number> = {
  today: 1,
  "7days": 7,
  "30days": 30,
  "90days": 90,
};

const WIB_OFFSET_HOURS = 7;
const NUMBER_COMPARE_EPSILON = 0.0001;
const VARIABLE_FILTER_OPERATORS: Array<{
  value: VariableFilterOperator;
  label: string;
}> = [
  { value: "eq", label: "=" },
  { value: "gte", label: ">=" },
  { value: "lte", label: "<=" },
  { value: "range", label: "Range" },
];

const VARIABLE_FILTER_FIELDS: Array<{
  key: keyof VariableFilters;
  label: string;
  placeholder: string;
  step: string;
}> = [
  {
    key: "ph",
    label: "pH",
    placeholder: "e.g. 7",
    step: "0.01",
  },
  {
    key: "temperature",
    label: "Temperature (°C)",
    placeholder: "e.g. 29",
    step: "0.1",
  },
  {
    key: "dissolvedOxygen",
    label: "DO (mg/L)",
    placeholder: "e.g. 5.2",
    step: "0.1",
  },
  {
    key: "salinity",
    label: "Salinity (ppt)",
    placeholder: "e.g. 20",
    step: "0.1",
  },
  {
    key: "turbidity",
    label: "Turbidity (NTU)",
    placeholder: "e.g. 15",
    step: "0.1",
  },
];

function createDefaultVariableFilters(): VariableFilters {
  const baseRule: VariableFilterRule = {
    operator: "eq",
    value: "",
    valueTo: "",
  };

  return {
    temperature: { ...baseRule },
    ph: { ...baseRule },
    dissolvedOxygen: { ...baseRule },
    salinity: { ...baseRule },
    turbidity: { ...baseRule },
  };
}

function getTodayStartWIBTs(): number {
  const now = new Date();
  const wibDate = new Date(now.getTime() + WIB_OFFSET_HOURS * 60 * 60 * 1000);
  wibDate.setHours(0, 0, 0, 0);
  return wibDate.getTime() - WIB_OFFSET_HOURS * 60 * 60 * 1000;
}

function formatIndonesiaDate(dateString: string | null): string {
  if (!dateString) return "No data yet";
  return new Date(dateString).toLocaleDateString("en-US", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
  });
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatMetric(
  value: number | undefined,
  unit: string,
  fractionDigits = 1,
) {
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

  if (temperature) parts.push(`Temp ${temperature}`);
  if (ph) parts.push(`pH ${ph}`);
  if (dissolvedOxygen) parts.push(`DO ${dissolvedOxygen}`);
  if (salinity) parts.push(`Salinity ${salinity}`);
  if (turbidity) parts.push(`Turbidity ${turbidity}`);

  if (parts.length === 0) return "Sensor data received";
  return parts.join(" • ");
}

function getTelemetrySeverity(
  point: TelemetryPoint,
): "high" | "medium" | "normal" {
  const t = point.temperature;
  const p = point.ph;
  const d = point.dissolvedOxygen;
  const s = point.salinity;
  const tb = point.turbidity;

  if (
    (t !== undefined && (t < 24 || t > 32)) ||
    (p !== undefined && (p < 6.0 || p > 8.4)) ||
    (d !== undefined && d < 4.9) ||
    (s !== undefined && (s < 8 || s > 35)) ||
    (tb !== undefined && tb > 40)
  ) {
    return "high";
  }

  if (
    (t !== undefined && (t === 25 || t === 31)) ||
    (p !== undefined && (p < 7.0 || p > 8.0)) ||
    (d !== undefined && d < 5 && d >= 4.9) ||
    (s !== undefined && (s < 10 || (s > 30 && s <= 35))) ||
    (tb !== undefined && tb > 25 && tb <= 40)
  ) {
    return "medium";
  }

  return "normal";
}

function buildIssuesFromParams(params: Record<string, number | null | undefined>) {
  const critical: string[] = [];
  const warning: string[] = [];

  const t = params.temperature;
  const p = params.ph;
  const d = params.dissolvedOxygen;
  const s = params.salinity;
  const tb = params.turbidity;

  if (typeof t === "number") {
    if (t < 24) critical.push(`Temperature LOW: ${t.toFixed(1)}°C (min: 26°C)`);
    else if (t > 32) critical.push(`Temperature HIGH: ${t.toFixed(1)}°C (max: 32°C)`);
    else if (t === 25) warning.push(`Temperature slightly LOW: ${t.toFixed(1)}°C (min: 26°C)`);
    else if (t === 31) warning.push(`Temperature slightly HIGH: ${t.toFixed(1)}°C (max: 30°C)`);
  }

  if (typeof p === "number") {
    if (p < 6.0) critical.push(`pH LOW: ${p.toFixed(2)} (min: 7.5)`);
    else if (p > 8.4) critical.push(`pH HIGH: ${p.toFixed(2)} (max: 8.5)`);
    else if (p < 7.0) warning.push(`pH slightly LOW: ${p.toFixed(2)} (min: 7.0)`);
    else if (p > 8.0) warning.push(`pH slightly HIGH: ${p.toFixed(2)} (max: 8.0)`);
  }

  if (typeof d === "number") {
    if (d < 4.9) critical.push(`Dissolved Oxygen LOW: ${d.toFixed(1)} mg/L (min: 5 mg/L)`);
    else if (d < 5 && d >= 4.9)
      warning.push(`Dissolved Oxygen slightly LOW: ${d.toFixed(1)} mg/L (min: 5 mg/L)`);
  }

  if (typeof s === "number") {
    if (s < 8) critical.push(`Salinity LOW: ${s.toFixed(1)} ppt (min: 10 ppt)`);
    else if (s > 35) critical.push(`Salinity HIGH: ${s.toFixed(1)} ppt (max: 30 ppt)`);
    else if (s < 10) warning.push(`Salinity slightly LOW: ${s.toFixed(1)} ppt (min: 10 ppt)`);
    else if (s > 30 && s <= 35)
      warning.push(`Salinity slightly HIGH: ${s.toFixed(1)} ppt (max: 30 ppt)`);
  }

  if (typeof tb === "number") {
    if (tb > 40) critical.push(`Turbidity HIGH: ${tb.toFixed(1)} NTU (max: 15 NTU)`);
    else if (tb > 25 && tb <= 40)
      warning.push(`Turbidity slightly HIGH: ${tb.toFixed(1)} NTU (min: 10 NTU)`);
  }

  return { critical, warning };
}

function buildAlertMessage(item: AlertHistoryItem): string {
  const params = item.parameters || {};
  const issues = buildIssuesFromParams(params);
  const list = item.severity === "CRITICAL" ? issues.critical : issues.warning;

  if (list.length > 0) {
    if (item.severity === "CRITICAL" && issues.warning.length > 0) {
      return `${item.severity}: ${list.join(" | ")} | Warning: ${issues.warning.join(" | ")}`;
    }
    return `${item.severity}: ${list.join(" | ")}`;
  }

  return item.message.replace(/^(CRITICAL|WARNING):\s*(CRITICAL|WARNING):\s*/i, "$1: ");
}

function parseFilterNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function isSameNumber(left: number, right: number): boolean {
  return Math.abs(left - right) < NUMBER_COMPARE_EPSILON;
}

function isRuleFilled(rule: VariableFilterRule): boolean {
  if (rule.operator === "range") {
    return rule.value.trim() !== "" || rule.valueTo.trim() !== "";
  }
  return rule.value.trim() !== "";
}

function getNormalizedRange(first: number, second: number): [number, number] {
  return first <= second ? [first, second] : [second, first];
}

function metricMatchesRule(metricValue: number, rule: VariableFilterRule): boolean {
  const primary = parseFilterNumber(rule.value);

  if (rule.operator === "range") {
    const secondary = parseFilterNumber(rule.valueTo);
    if (primary === null || secondary === null) return true;

    const [minValue, maxValue] = getNormalizedRange(primary, secondary);
    return (
      metricValue + NUMBER_COMPARE_EPSILON >= minValue &&
      metricValue - NUMBER_COMPARE_EPSILON <= maxValue
    );
  }

  if (primary === null) return true;

  if (rule.operator === "eq") {
    return isSameNumber(metricValue, primary);
  }

  if (rule.operator === "gte") {
    return metricValue + NUMBER_COMPARE_EPSILON >= primary;
  }

  return metricValue - NUMBER_COMPARE_EPSILON <= primary;
}

function logMatchesVariableFilters(
  log: HistoryLogItem,
  variableFilters: VariableFilters,
): boolean {
  const filterEntries = Object.entries(variableFilters) as Array<
    [keyof VariableFilters, VariableFilterRule]
  >;

  for (const [metricKey, rule] of filterEntries) {
    if (!isRuleFilled(rule)) continue;

    const metricValue = log.metrics?.[metricKey];
    if (typeof metricValue !== "number") return false;
    if (!metricMatchesRule(metricValue, rule)) return false;
  }

  return true;
}

export default function HistoryPageClient({
  defaultCollapsed,
}: HistoryPageClientProps) {
  const searchParams = useSearchParams();
  const { status } = useAuth();
  const { selectedDevice, setSelectedDevice, devices } = useDeviceSelection();
  const [period, setPeriod] = useState("today");
  const [filterType, setFilterType] = useState<string>("all");
  const [showVariableFilters, setShowVariableFilters] = useState(false);
  const [variableFilters, setVariableFilters] = useState<VariableFilters>(
    createDefaultVariableFilters,
  );
  const [stats, setStats] = useState<HistoryStats>({
    activeDays: 0,
    firstDataAt: null,
    totalData: 0,
  });
  const [isStatsLoading, setIsStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [alarmLogs, setAlarmLogs] = useState<HistoryLogItem[]>([]);
  const [readingLogs, setReadingLogs] = useState<HistoryLogItem[]>([]);
  const [alertCount, setAlertCount] = useState(0);
  const [visibleCount, setVisibleCount] = useState(20);
  const [activityRefreshKey, setActivityRefreshKey] = useState(0);
  const [highlightedLogId, setHighlightedLogId] = useState<string | null>(null);
  const lastRealtimeTsRef = useRef<number | null>(null);

  const mergedLogs = [...alarmLogs, ...readingLogs].sort(
    (a, b) => b.timestampMs - a.timestampMs,
  );
  const typeFilteredLogs =
    filterType === "all"
      ? mergedLogs
      : mergedLogs.filter((log) => log.type === filterType);
  const filteredLogs = typeFilteredLogs.filter((log) =>
    logMatchesVariableFilters(log, variableFilters),
  );
  const visibleLogs = filteredLogs.slice(0, visibleCount);
  const hasActiveVariableFilters = Object.values(variableFilters).some((rule) =>
    isRuleFilled(rule),
  );
  const activeVariableFilterCount = Object.values(variableFilters).filter((rule) =>
    isRuleFilled(rule),
  ).length;

  const updateVariableFilterOperator = (
    key: keyof VariableFilters,
    operator: VariableFilterOperator,
  ) => {
    setVariableFilters((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        operator,
      },
    }));
  };

  const updateVariableFilterValue = (
    key: keyof VariableFilters,
    value: string,
  ) => {
    setVariableFilters((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        value,
      },
    }));
  };

  const updateVariableFilterValueTo = (
    key: keyof VariableFilters,
    valueTo: string,
  ) => {
    setVariableFilters((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        valueTo,
      },
    }));
  };

  const clearVariableFilters = () => {
    setVariableFilters(createDefaultVariableFilters());
  };

  useEffect(() => {
    const filter = searchParams.get("filter");
    const highlight = searchParams.get("highlight");
    const deviceParam = searchParams.get("device");
    const periodParam = searchParams.get("period");

    if (filter === "alert") setFilterType("alert");
    if (
      periodParam === "today" ||
      periodParam === "7days" ||
      periodParam === "30days" ||
      periodParam === "90days"
    ) {
      setPeriod(periodParam);
    }

    if (highlight) {
      try {
        setHighlightedLogId(decodeURIComponent(highlight));
      } catch {
        setHighlightedLogId(highlight);
      }
    }

    if (deviceParam && devices.length > 0) {
      const found = devices.find(
        (d) =>
          d.thingsboardDeviceId === deviceParam ||
          (d as any).deviceId === deviceParam,
      );
      if (found) setSelectedDevice(found.thingsboardDeviceId);
    }
  }, [searchParams, devices]);

  useEffect(() => {
    if (!highlightedLogId) return;
    const element = document.getElementById(`history-log-${highlightedLogId}`);
    if (!element) return;
    element.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightedLogId, visibleLogs.length]);

  useEffect(() => {
    const fetchHistoryStats = async () => {
      if (!selectedDevice) {
        setStats({ activeDays: 0, firstDataAt: null, totalData: 0 });
        return;
      }

      setIsStatsLoading(true);
      setStatsError(null);

      try {
        const response = await fetch(
          `/api/history/stats?deviceId=${selectedDevice}&period=${period}`,
        );
        const result = await response.json();

        if (result.success && result.data) {
          setStats({
            activeDays: result.data.activeDays ?? 0,
            firstDataAt: result.data.firstDataAt ?? null,
            totalData: result.data.totalData ?? 0,
          });
        } else {
          setStatsError(result.error || "Failed to load statistics");
        }
      } catch (error) {
        setStatsError("Failed to load statistics");
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
        setAlertCount(0);
        return;
      }

      try {
        const isToday = period === "today";
        const days = PERIOD_TO_DAYS[period] || 7;
        const hours = isToday ? 24 : days * 24;
        const startTs = isToday
          ? getTodayStartWIBTs()
          : Date.now() - hours * 60 * 60 * 1000;

        const [telemetryResponse, alertHistoryResponse] = await Promise.all([
          fetch(
            `/api/telemetry/history?deviceId=${selectedDevice}&hours=${hours}&limit=5000`,
          ),
          fetch(
            `/api/history/alerts?deviceId=${selectedDevice}&period=${period}`,
          ),
        ]);

        const telemetryResult = await telemetryResponse.json();
        const alertHistoryResult = await alertHistoryResponse.json();

        if (!telemetryResult.success || !Array.isArray(telemetryResult.data)) {
          setReadingLogs([]);
        } else {
          const telemetryPoints = (telemetryResult.data as TelemetryPoint[])
            .filter((point) => point.timestamp >= startTs)
            .sort((a, b) => b.timestamp - a.timestamp);

          const nextReadingLogs: HistoryLogItem[] = telemetryPoints.map(
            (point) => {
              const createdAt = new Date(point.timestamp);
              const severity = getTelemetrySeverity(point);
              return {
                id: `reading-${point.timestamp}`,
                date: createdAt.toLocaleDateString("en-US"),
                time: createdAt.toLocaleTimeString("en-US", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                }),
                type: "reading",
                message: buildReadingMessage(point),
                severity,
                timestampMs: point.timestamp,
                metrics: {
                  temperature: point.temperature,
                  ph: point.ph,
                  dissolvedOxygen: point.dissolvedOxygen,
                  salinity: point.salinity,
                  turbidity: point.turbidity,
                },
              };
            },
          );

          setReadingLogs(nextReadingLogs);

          const alerts = Array.isArray(alertHistoryResult.data)
            ? (alertHistoryResult.data as AlertHistoryItem[])
            : [];

          if (alerts.length === 0) {
            setAlarmLogs([]);
            setAlertCount(0);
            return;
          }
        }

        const alerts = Array.isArray(alertHistoryResult.data)
          ? (alertHistoryResult.data as AlertHistoryItem[])
          : [];

        if (alerts.length === 0) {
          setAlarmLogs([]);
          setAlertCount(0);
          return;
        }

        const sortedAlerts = [...alerts].sort(
          (a, b) =>
            new Date(b.eventTime).getTime() - new Date(a.eventTime).getTime(),
        );

        const nextAlarmLogs: HistoryLogItem[] = sortedAlerts.map((alert) => {
          const createdAt = new Date(alert.eventTime);
          const isCritical = alert.severity === "CRITICAL";
          const params = alert.parameters || {};

          return {
            id: `alarm-${alert.id}`,
            date: createdAt.toLocaleDateString("en-US"),
            time: createdAt.toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
            }),
            type: "alert" as const,
            message: buildAlertMessage(alert),
            severity: isCritical ? ("high" as const) : ("medium" as const),
            timestampMs: createdAt.getTime(),
            metrics: {
              temperature:
                typeof params.temperature === "number"
                  ? params.temperature
                  : undefined,
              ph: typeof params.ph === "number" ? params.ph : undefined,
              dissolvedOxygen:
                typeof params.dissolvedOxygen === "number"
                  ? params.dissolvedOxygen
                  : undefined,
              salinity:
                typeof params.salinity === "number"
                  ? params.salinity
                  : undefined,
              turbidity:
                typeof params.turbidity === "number"
                  ? params.turbidity
                  : undefined,
            },
          };
        });

        setAlarmLogs(nextAlarmLogs);
        setAlertCount(
          alertHistoryResult.summary?.total ?? nextAlarmLogs.length,
        );
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
  }, [selectedDevice, period, filterType, variableFilters]);

  useEffect(() => {
    if (!selectedDevice || typeof window === "undefined") return;

    let unsubscribe: (() => void) | undefined;
    const isDev = process.env.NODE_ENV === "development";

    const handleRealtimeIncrement = (payload: {
      deviceId: string;
      timestamp?: number;
    }) => {
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
        unsubscribe = subscribeToDeviceTelemetry(
          selectedDevice,
          handleRealtimeIncrement,
        );
      });
    }

    return () => {
      if (unsubscribe) unsubscribe();
      lastRealtimeTsRef.current = null;
    };
  }, [selectedDevice]);

  useEffect(() => {
    if (!selectedDevice || typeof window === "undefined") return;

    let unsubscribe: (() => void) | undefined;

    if (
      process.env.NODE_ENV !== "development" &&
      process.env.NEXT_PUBLIC_PUSHER_KEY
    ) {
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

  if (status === "loading") {
    return (
      <DashboardLayout activeMenu="history" defaultCollapsed={defaultCollapsed}>
        <HistorySkeleton />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout activeMenu="history" defaultCollapsed={defaultCollapsed}>
      <div className="mb-20 lg:mb-0">
        <DashboardHeader
          title="Device History"
          subtitle="Full history of activity and IoT device monitoring data"
        />

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="flex-1">
            <label className="text-sm font-medium text-gray-700 mb-2 block">
              Device
            </label>
            <PondSelector
              devices={devices}
              selectedDevice={selectedDevice}
              onDeviceChange={setSelectedDevice}
            />
          </div>
          <div className="w-full sm:w-48">
            <label className="text-sm font-medium text-gray-700 mb-2 block">
              Period
            </label>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today (Realtime)</SelectItem>
                <SelectItem value="7days">Last 7 Days</SelectItem>
                <SelectItem value="30days">Last 30 Days</SelectItem>
                <SelectItem value="90days">Last 90 Days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mb-6">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <Button
              variant="outline"
              onClick={() => setShowVariableFilters((prev) => !prev)}
              className="w-full sm:w-auto"
            >
              <SlidersHorizontal className="h-4 w-4 mr-2" />
              {showVariableFilters ? "Hide Filter" : "Show Filter"}
              {activeVariableFilterCount > 0
                ? ` (${activeVariableFilterCount} active)`
                : ""}
            </Button>

            {showVariableFilters ? (
              <Button
                variant="outline"
                size="sm"
                onClick={clearVariableFilters}
                disabled={!hasActiveVariableFilters}
              >
                Reset Variable Filter
              </Button>
            ) : null}
          </div>

          {!showVariableFilters && hasActiveVariableFilters ? (
            <p className="text-xs text-gray-500 mt-2">
              Variable filter is active. Open filter to adjust values.
            </p>
          ) : null}
        </div>

        {showVariableFilters ? (
          <Card className="mb-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Variable Filter</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
                {VARIABLE_FILTER_FIELDS.map((field) => (
                  <div key={field.key}>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">
                      {field.label}
                    </label>
                    <div className="flex flex-col gap-2">
                      <Select
                        value={variableFilters[field.key].operator}
                        onValueChange={(value) =>
                          updateVariableFilterOperator(
                            field.key,
                            value as VariableFilterOperator,
                          )
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {VARIABLE_FILTER_OPERATORS.map((operator) => (
                            <SelectItem key={operator.value} value={operator.value}>
                              {operator.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Input
                        type="number"
                        inputMode="decimal"
                        step={field.step}
                        placeholder={field.placeholder}
                        value={variableFilters[field.key].value}
                        onChange={(event) =>
                          updateVariableFilterValue(field.key, event.target.value)
                        }
                      />

                      {variableFilters[field.key].operator === "range" ? (
                        <Input
                          type="number"
                          inputMode="decimal"
                          step={field.step}
                          placeholder="to"
                          value={variableFilters[field.key].valueTo}
                          onChange={(event) =>
                            updateVariableFilterValueTo(field.key, event.target.value)
                          }
                        />
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-3">
                Example: set pH with operator = and value 7 to show only pH value 7.
                You can also use &gt;=, &lt;=, or range (min-max).
                Variable filter can be combined with period and activity type filters.
              </p>
            </CardContent>
          </Card>
        ) : null}

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card className="bg-white">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-cyan-100 rounded-lg">
                  <Calendar className="h-5 w-5 text-cyan-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">
                    {isStatsLoading ? "..." : formatNumber(stats.activeDays)}
                  </p>
                  <p className="text-sm text-gray-500">Active Days</p>
                  <p className="text-xs text-gray-400">
                    Since {formatIndonesiaDate(stats.firstDataAt)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Database className="h-5 w-5 text-blue-600" />
                </div>
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
                <div className="p-2 bg-yellow-100 rounded-lg">
                  <AlertTriangle className="h-5 w-5 text-yellow-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">
                    {formatNumber(alertCount)}
                  </p>
                  <p className="text-sm text-gray-500">Alert</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Wrench className="h-5 w-5 text-purple-600" />
                </div>
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
              <CardTitle className="text-lg">Activity History</CardTitle>
              <div className="flex gap-2 flex-wrap">
                {["all", "alert", "reading", "maintenance"].map((type) => (
                  <Button
                    key={type}
                    variant={filterType === type ? "default" : "outline"}
                    size="sm"
                    onClick={() => setFilterType(type)}
                    className={
                      filterType === type ? "bg-cyan-600 hover:bg-cyan-700" : ""
                    }
                  >
                    {type === "all"
                      ? "All"
                      : type.charAt(0).toUpperCase() + type.slice(1)}
                  </Button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {visibleLogs.length === 0 ? (
                <div className="p-6 rounded-lg border border-dashed border-gray-300 text-center text-sm text-gray-500">
                  No data for this period.
                </div>
              ) : null}

              {visibleLogs.map((log) => {
                const Icon = TYPE_ICONS[log.type as keyof typeof TYPE_ICONS];
                return (
                  <div
                    id={`history-log-${log.id}`}
                    key={log.id}
                    className={`flex items-center justify-between p-4 rounded-lg transition-colors ${
                      highlightedLogId === log.id
                        ? "bg-cyan-50 ring-2 ring-cyan-300"
                        : "bg-gray-50 hover:bg-gray-100"
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className={`p-2 rounded-lg ${
                          log.type === "alert"
                            ? "bg-yellow-100"
                            : log.type === "reading"
                              ? "bg-blue-100"
                              : "bg-purple-100"
                        }`}
                      >
                        <Icon
                          className={`h-4 w-4 ${
                            log.type === "alert"
                              ? "text-yellow-600"
                              : log.type === "reading"
                                ? "text-blue-600"
                                : "text-purple-600"
                          }`}
                        />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          <span>{log.date}</span>
                          <span>•</span>
                          <span>{log.time}</span>
                        </div>
                        <p className="font-medium text-gray-900">
                          {log.message}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        SEVERITY_STYLES[
                          log.severity as keyof typeof SEVERITY_STYLES
                        ]
                      }`}
                    >
                      {log.severity === "high"
                        ? "High"
                        : log.severity === "medium"
                          ? "Medium"
                          : log.severity === "normal"
                            ? "Normal"
                            : "Info"}
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
                  <ChevronDown className="h-4 w-4 mr-2" />
                  Load More
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
