import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { thingsboardService } from "@/lib/thingsboard";
import { Prisma } from "@prisma/client";

const PERIOD_TO_DAYS: Record<string, number> = {
  today: 1,
  "7days": 7,
  "30days": 30,
  "90days": 90,
};
const WIB_OFFSET_HOURS = 7;

const TELEMETRY_KEYS = [
  "temperature",
  "ph",
  "dissolvedOxygen",
  "salinity",
  "turbidity",
] as const;

interface AlertRow {
  id: bigint | string | number;
  tbAlarmId: string | null;
  severity: "WARNING" | "CRITICAL";
  status: "ACTIVE" | "CLEARED" | "ACKNOWLEDGED";
  message: string;
  issueCount: number | null;
  parameters: Prisma.JsonValue;
  action: string | null;
  eventTime: Date;
  createdAt: Date;
}

function stripDoublePrefix(message: string): string {
  // Hapus double prefix seperti "CRITICAL: CRITICAL: ..." atau "WARNING: WARNING: ..."
  return message.replace(/^(CRITICAL|WARNING):\s*\1:\s*/i, "$1: ").trim();
}

type IssueBuckets = {
  critical: string[];
  warning: string[];
};

function buildIssuesFromParams(params: any): IssueBuckets {
  const critical: string[] = [];
  const warning: string[] = [];

  const t = params?.temperature;
  const p = params?.ph;
  const d = params?.dissolvedOxygen;
  const s = params?.salinity;
  const tb = params?.turbidity;

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

function buildMessageFromParams(severity: "WARNING" | "CRITICAL", params: any): string | null {
  const issues = buildIssuesFromParams(params);
  const list = severity === "CRITICAL" ? issues.critical : issues.warning;

  if (list.length === 0) return null;
  return `${severity}: ${list.join(" | ")}`;
}

function computeSeverityFromParams(params: any): "WARNING" | "CRITICAL" | null {
  const issues = buildIssuesFromParams(params);
  if (issues.critical.length > 0) return "CRITICAL";
  if (issues.warning.length > 0) return "WARNING";
  return null;
}

type TelemetryPoint = {
  timestamp: number;
  temperature?: number;
  ph?: number;
  dissolvedOxygen?: number;
  salinity?: number;
  turbidity?: number;
};

function mapTelemetryHistoryToPoints(history: Record<string, any[]>): TelemetryPoint[] {
  const timestamps = new Set<number>();

  for (const values of Object.values(history || {})) {
    for (const item of values || []) {
      if (typeof item?.ts === "number") timestamps.add(item.ts);
    }
  }

  return Array.from(timestamps)
    .sort((a, b) => b - a)
    .map((ts) => {
      const point: TelemetryPoint = { timestamp: ts };

      for (const key of TELEMETRY_KEYS) {
        const values = history?.[key] || [];
        const match = values.find((v: any) => v?.ts === ts);
        if (!match) continue;

        const parsed = Number.parseFloat(String(match.value));
        if (!Number.isNaN(parsed)) {
          point[key] = parsed;
        }
      }

      return point;
    });
}

function getTodayStartWIBTs(): number {
  const now = new Date();
  const wibDate = new Date(now.getTime() + WIB_OFFSET_HOURS * 60 * 60 * 1000);
  wibDate.setHours(0, 0, 0, 0);
  return wibDate.getTime() - WIB_OFFSET_HOURS * 60 * 60 * 1000;
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const deviceId = searchParams.get("deviceId");
    const period = searchParams.get("period") || "7days";
    const days = PERIOD_TO_DAYS[period] || 7;

    if (!deviceId) {
      return NextResponse.json({ error: "Device ID is required" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const device = await prisma.device.findFirst({
      where: {
        thingsboardDeviceId: deviceId,
        OR: [
          { pond: { userId: user.id } },
          { userDevices: { some: { userId: user.id } } },
        ],
      },
      select: { id: true },
    });

    if (!device) {
      return NextResponse.json({ error: "Device not found or access denied" }, { status: 404 });
    }

    if (period === "today") {
      const endTs = Date.now();
      const startTs = getTodayStartWIBTs();

      const history = await thingsboardService.getTelemetryHistory(
        deviceId,
        [...TELEMETRY_KEYS],
        startTs,
        endTs,
        5000,
      );

      const points = mapTelemetryHistoryToPoints(history || {});
      const realtimeAlerts = points
        .map((point) => {
          const params = {
            temperature: point.temperature ?? null,
            ph: point.ph ?? null,
            dissolvedOxygen: point.dissolvedOxygen ?? null,
            salinity: point.salinity ?? null,
            turbidity: point.turbidity ?? null,
          };

          const severity = computeSeverityFromParams(params);
          if (!severity) return null;

          const eventTimeIso = new Date(point.timestamp).toISOString();
          return {
            id: `rt-${point.timestamp}`,
            tbAlarmId: null,
            severity,
            status: "ACTIVE" as const,
            message: buildMessageFromParams(severity, params) || `${severity}: Water quality is abnormal`,
            issueCount: null,
            parameters: params,
            action: severity === "CRITICAL" ? "CHECK POND IMMEDIATELY!" : "Needs inspection",
            eventTime: eventTimeIso,
            createdAt: eventTimeIso,
          };
        })
        .filter(Boolean);

      const activeWarning = realtimeAlerts.filter((i) => i?.severity === "WARNING").length;
      const activeCritical = realtimeAlerts.filter((i) => i?.severity === "CRITICAL").length;

      return NextResponse.json({
        success: true,
        data: realtimeAlerts,
        summary: {
          total: realtimeAlerts.length,
          activeWarning,
          activeCritical,
          activeTotal: realtimeAlerts.length,
        },
      });
    }

    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const alertDelegate = (prisma as any).alertEvent;

    const alerts: AlertRow[] = alertDelegate
      ? await alertDelegate.findMany({
          where: {
            deviceId: device.id,
            eventTime: { gte: startDate },
            severity: { in: ["WARNING", "CRITICAL"] },
            status: { not: "CLEARED" },
          },
          orderBy: { eventTime: "desc" },
          take: 500,
          select: {
            id: true,
            tbAlarmId: true,
            severity: true,
            status: true,
            message: true,
            issueCount: true,
            parameters: true,
            action: true,
            eventTime: true,
            createdAt: true,
          },
        })
      : await prisma.$queryRaw<AlertRow[]>(Prisma.sql`
          SELECT id, tb_alarm_id AS "tbAlarmId", severity::text AS severity,
            status::text AS status, message, issue_count AS "issueCount",
            parameters, action, event_time AS "eventTime", created_at AS "createdAt"
          FROM alert_events
          WHERE device_id = ${device.id}
            AND event_time >= ${startDate}
            AND severity IN ('WARNING', 'CRITICAL')
            AND status != 'CLEARED'
          ORDER BY event_time DESC LIMIT 500
        `);

    return NextResponse.json({
      success: true,
      data: alerts.map((item: AlertRow) => {
        const params = (item.parameters as any) || {};
        const hasParams = Object.values(params).some((v) => v !== null && v !== undefined);

        const realSeverity = hasParams
          ? (computeSeverityFromParams(params) || item.severity)
          : item.severity;

        // Build dari params jika ada, fallback strip double prefix dari message lama
        const finalMessage = hasParams
          ? (buildMessageFromParams(realSeverity, params) ?? stripDoublePrefix(item.message))
          : stripDoublePrefix(item.message);

        return {
          id: String(item.id),
          tbAlarmId: item.tbAlarmId,
          severity: realSeverity,
          status: item.status,
          message: finalMessage,
          issueCount: item.issueCount,
          parameters: item.parameters,
          action: item.action,
          eventTime: item.eventTime.toISOString(),
          createdAt: item.createdAt.toISOString(),
        };
      }),
      summary: {
        total: alerts.length,
        activeWarning: alerts.filter((i: AlertRow) => i.severity === "WARNING").length,
        activeCritical: alerts.filter((i: AlertRow) => i.severity === "CRITICAL").length,
        activeTotal: alerts.length,
      },
    });
  } catch (error) {
    console.error("History alerts fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch history alerts" }, { status: 500 });
  }
}