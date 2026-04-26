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
}): "CRITICAL" | "WARNING" | null {
  const t = data.temperature ?? undefined;
  const p = data.ph ?? undefined;
  const d = data.dissolvedOxygen ?? undefined;
  const s = data.salinity ?? undefined;
  const tb = data.turbidity ?? undefined;

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

function buildMessageFromParams(
  severity: "WARNING" | "CRITICAL",
  params: Record<string, unknown>,
): string | null {
  const parts: string[] = [];
  if (typeof params.temperature === "number") {
    parts.push(`Suhu ${params.temperature.toFixed(1)}°C`);
  }
  if (typeof params.ph === "number") {
    parts.push(`pH ${params.ph.toFixed(2)}`);
  }
  if (typeof params.dissolvedOxygen === "number") {
    parts.push(`DO ${params.dissolvedOxygen.toFixed(1)} mg/L`);
  }
  if (typeof params.salinity === "number") {
    parts.push(`Salinitas ${params.salinity.toFixed(1)} ppt`);
  }
  if (typeof params.turbidity === "number") {
    parts.push(`Turbidity ${params.turbidity.toFixed(1)} NTU`);
  }

  if (parts.length === 0) return null;
  return `${severity}: ${parts.join(" • ")}`;
}

function stripDoublePrefix(message: string): string {
  return message
    .replace(/^(CRITICAL|WARNING):\s*(CRITICAL|WARNING):\s*/i, "$1: ")
    .trim();
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
              pondName: item.pond?.name || "Kolam",
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
      const computedMessage = buildMessageFromParams(row.severity, params);

      return {
        id: `notif-db-${String(row.id)}`,
        targetId: `alarm-${String(row.id)}`,
        severity: row.severity === "CRITICAL" ? "critical" : "warning",
        message: computedMessage || stripDoublePrefix(row.message),
        pondName: row.pondName || "Kolam",
        action:
          row.action ||
          (row.severity === "CRITICAL"
            ? "SEGERA CEK TAMBAK!"
            : "Perlu pengecekan"),
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
          };

          const severity = evaluateSeverity(data);
          if (!severity) return;

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
            id: `notif-rt-${tbDeviceId}-${latestTs || Date.now()}`,
            targetId: `rt-${tbDeviceId}-${latestTs || Date.now()}`,
            severity: severity === "CRITICAL" ? "critical" : "warning",
            message:
              paramsMessage || `${severity}: Kondisi kualitas air tidak normal`,
            pondName: device.pond?.name || "Kolam",
            action:
              severity === "CRITICAL"
                ? "SEGERA CEK TAMBAK!"
                : "Perlu pengecekan",
            timestamp: new Date(latestTs || Date.now()).toISOString(),
            deviceId: tbDeviceId,
          });
        } catch {}
      }),
    );

    notifications.sort((a, b) => {
      if (a.severity !== b.severity) {
        return a.severity === "critical" ? -1 : 1;
      }
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });

    return NextResponse.json({
      success: true,
      data: notifications,
      total: notifications.length,
    });
  } catch (error) {
    console.error("Notifications alerts fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch notifications" },
      { status: 500 },
    );
  }
}
