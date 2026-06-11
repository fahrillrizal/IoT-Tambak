import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { thingsboardService } from "@/lib/thingsboard";

const TELEMETRY_KEYS = [
  "temperature",
  "ph",
  "dissolvedOxygen",
  "salinity",
  "turbidity",
  "batteryLevel",
];

interface NotificationRow {
  id: bigint;
  severity: "WARNING" | "CRITICAL";
  message: string;
  action: string | null;
  eventTime: Date;
  parameters: Prisma.JsonValue;
  tbDeviceId: string;
  pondName: string;
}

function getLatestValue(arr?: any[]): number | null {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const parsed = Number.parseFloat(String(arr[0]?.value));
  return Number.isNaN(parsed) ? null : parsed;
}

function getLatestTimestamp(arr?: any[]): number | null {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const ts = Number(arr[0]?.ts);
  return Number.isFinite(ts) ? ts : null;
}

function evaluateSeverity(data: {
  temperature?: number | null;
  ph?: number | null;
  dissolvedOxygen?: number | null;
  salinity?: number | null;
  turbidity?: number | null;
  batteryLevel?: number | null;
}): "CRITICAL" | "WARNING" | null {
  const t = data.temperature ?? undefined;
  const p = data.ph ?? undefined;
  const d = data.dissolvedOxygen ?? undefined;
  const s = data.salinity ?? undefined;
  const tb = data.turbidity ?? undefined;

  // Water quality only — battery is handled separately
  if (
    (t !== undefined && (t < 26 || t > 32)) ||
    (p !== undefined && (p < 7.5 || p > 8.5)) ||
    (d !== undefined && (d < 4 || d > 8)) ||
    (s !== undefined && (s < 10 || s > 35)) ||
    (tb !== undefined && tb > 80)
  ) {
    return "CRITICAL";
  }

  if (
    (t !== undefined && (t < 27 || t > 31)) ||
    (p !== undefined && (p < 7.8 || p > 8.2)) ||
    (d !== undefined && (d < 5 || d > 7.5)) ||
    (s !== undefined && (s < 15 || s > 30)) ||
    (tb !== undefined && (tb < 10 || tb > 50))
  ) {
    return "WARNING";
  }

  return null;
}

function isBatteryLow(batteryLevel?: number | null): boolean {
  return batteryLevel !== undefined && batteryLevel !== null && batteryLevel < 15;
}

type IssueBuckets = {
  critical: string[];
  warning: string[];
};

function buildIssuesFromParams(params: Record<string, unknown>): IssueBuckets {
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

function buildMessageFromParams(
  severity: "WARNING" | "CRITICAL",
  params: Record<string, unknown>,
): string | null {
  const issues = buildIssuesFromParams(params);
  const list = severity === "CRITICAL" ? issues.critical : issues.warning;

  if (list.length === 0) return null;
  if (severity === "CRITICAL" && issues.warning.length > 0) {
    return `${severity}: ${list.join(" | ")} | Warning: ${issues.warning.join(" | ")}`;
  }
  return `${severity}: ${list.join(" | ")}`;
}

function stripDoublePrefix(message: string): string {
  return message
    .replace(/^(CRITICAL|WARNING):\s*(CRITICAL|WARNING):\s*/i, "$1: ")
    .trim();
}

function normalizeMessage(message: string): string {
  return stripDoublePrefix(message).replace(/\s+/g, " ").trim();
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const alertDelegate = (prisma as any).alertEvent;
    const rows: NotificationRow[] = alertDelegate
      ? await alertDelegate
          .findMany({
            where: {
              userId: user.id,
              status: { not: "CLEARED" },
              severity: { in: ["WARNING", "CRITICAL"] },
            },
            orderBy: { eventTime: "desc" },
            take: 300,
            select: {
              id: true,
              severity: true,
              message: true,
              action: true,
              eventTime: true,
              parameters: true,
              tbDeviceId: true,
              pond: { select: { name: true } },
            },
          })
          .then((items: any[]) =>
            items.map((item) => ({
              id: item.id,
              severity: item.severity,
              message: item.message,
              action: item.action,
              eventTime: item.eventTime,
              parameters: item.parameters,
              tbDeviceId: item.tbDeviceId,
              pondName: item.pond?.name || "Pond",
            })),
          )
      : await prisma.$queryRaw<NotificationRow[]>(Prisma.sql`
          SELECT
            ae.id,
            ae.severity::text AS severity,
            ae.message,
            ae.action,
            ae.event_time AS "eventTime",
            ae.parameters,
            ae.tb_device_id AS "tbDeviceId",
            p.name AS "pondName"
          FROM alert_events ae
          INNER JOIN ponds p ON p.id = ae.pond_id
          WHERE ae.user_id = ${user.id}
            AND ae.status != 'CLEARED'
            AND ae.severity IN ('WARNING', 'CRITICAL')
          ORDER BY ae.event_time DESC
          LIMIT 300
        `);

    const notifications = rows.map((row) => {
      const params =
        row.parameters && typeof row.parameters === "object"
          ? (row.parameters as Record<string, unknown>)
          : {};

      // Detect if this is a battery-only alarm
      const hasBattery =
        typeof params.batteryLevel === "number" && params.batteryLevel < 15;
      const hasWaterQuality =
        params.temperature != null ||
        params.ph != null ||
        params.dissolvedOxygen != null ||
        params.salinity != null ||
        params.turbidity != null;
      const isBatteryOnly = hasBattery && !hasWaterQuality;

      const computedMessage = isBatteryOnly
        ? `Battery LOW: ${(params.batteryLevel as number).toFixed(0)}% (min: 15%)`
        : buildMessageFromParams(row.severity, params);

      return {
        id: `notif-db-${String(row.id)}`,
        targetId: `alarm-${String(row.id)}`,
        severity: row.severity === "CRITICAL" ? "critical" : "warning",
        message: computedMessage || stripDoublePrefix(row.message),
        pondName: row.pondName || "Pond",
        action:
          isBatteryOnly
            ? "Charge or replace battery"
            : row.action ||
              (row.severity === "CRITICAL"
                ? "CHECK POND IMMEDIATELY!"
                : "Needs inspection"),
        timestamp: new Date(row.eventTime).toISOString(),
        deviceId: row.tbDeviceId,
      };
    });

    const devices = await prisma.device.findMany({
      where: {
        isActive: true,
        thingsboardDeviceId: { not: null },
        OR: [
          { pond: { userId: user.id } },
          { userDevices: { some: { userId: user.id } } },
        ],
      },
      select: {
        thingsboardDeviceId: true,
        pond: { select: { name: true } },
      },
      take: 20,
    });

    const dbDeviceIds = new Set(notifications.map((n) => n.deviceId));

    await Promise.all(
      devices.map(async (device) => {
        const tbDeviceId = device.thingsboardDeviceId;
        if (!tbDeviceId) return;
        if (dbDeviceIds.has(tbDeviceId)) return;

        try {
          const latest = await thingsboardService.getDeviceTelemetry(
            tbDeviceId,
            TELEMETRY_KEYS,
          );

          const data = {
            temperature: getLatestValue(latest.temperature),
            ph: getLatestValue(latest.ph),
            dissolvedOxygen: getLatestValue(latest.dissolvedOxygen),
            salinity: getLatestValue(latest.salinity),
            turbidity: getLatestValue(latest.turbidity),
            batteryLevel: getLatestValue(latest.batteryLevel),
          };

          const severity = evaluateSeverity(data);
          const batteryLow = isBatteryLow(data.batteryLevel);

          if (!severity && !batteryLow) return;

          // Water quality notification (separate from battery)
          if (severity) {
            const paramsMessage = buildMessageFromParams(severity, {
              temperature: data.temperature,
              ph: data.ph,
              dissolvedOxygen: data.dissolvedOxygen,
              salinity: data.salinity,
              turbidity: data.turbidity,
            });

            const latestTs = Math.max(
              getLatestTimestamp(latest.temperature) ?? 0,
              getLatestTimestamp(latest.ph) ?? 0,
              getLatestTimestamp(latest.dissolvedOxygen) ?? 0,
              getLatestTimestamp(latest.salinity) ?? 0,
              getLatestTimestamp(latest.turbidity) ?? 0,
            );

            notifications.push({
              id: `notif-rt-${tbDeviceId}-wq-${latestTs || Date.now()}`,
              targetId: `rt-${tbDeviceId}-wq-${latestTs || Date.now()}`,
              severity: severity === "CRITICAL" ? "critical" : "warning",
              message:
                paramsMessage || `${severity}: Water quality is not normal`,
              pondName: device.pond?.name || "Pond",
              action:
                severity === "CRITICAL"
                  ? "CHECK POND IMMEDIATELY!"
                  : "Needs inspection",
              timestamp: new Date(latestTs || Date.now()).toISOString(),
              deviceId: tbDeviceId,
            });
          }

          // Battery low notification (separate from water quality)
          if (batteryLow) {
            const batTs = getLatestTimestamp(latest.batteryLevel) ?? Date.now();

            notifications.push({
              id: `notif-rt-${tbDeviceId}-bat-${batTs}`,
              targetId: `rt-${tbDeviceId}-bat-${batTs}`,
              severity: "warning",
              message: `Battery LOW: ${data.batteryLevel?.toFixed(0)}% (min: 15%)`,
              pondName: device.pond?.name || "Pond",
              action: "Charge or replace battery",
              timestamp: new Date(batTs).toISOString(),
              deviceId: tbDeviceId,
            });
          }
        } catch {}
      }),
    );

    const dedupedNotifications = new Map<string, (typeof notifications)[number]>();
    for (const item of notifications) {
      const key = `${item.severity}|${item.pondName}|${normalizeMessage(item.message)}`;
      const existing = dedupedNotifications.get(key);
      if (!existing) {
        dedupedNotifications.set(key, item);
        continue;
      }

      if (new Date(item.timestamp).getTime() > new Date(existing.timestamp).getTime()) {
        dedupedNotifications.set(key, item);
      }
    }

    const finalNotifications = Array.from(dedupedNotifications.values());

    finalNotifications.sort((a, b) => {
      if (a.severity !== b.severity) {
        return a.severity === "critical" ? -1 : 1;
      }
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });

    return NextResponse.json({
      success: true,
      data: finalNotifications,
      total: finalNotifications.length,
    });
  } catch (error) {
    console.error("Notifications alerts fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch notifications" },
      { status: 500 },
    );
  }
}
