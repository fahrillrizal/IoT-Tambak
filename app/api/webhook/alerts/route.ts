import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { triggerAlertEvent } from "@/lib/pusher";
import { buildAlertTelegramMessage, sendTelegramMessage } from "@/lib/telegram";
import { Prisma } from "@prisma/client";

const ALERT_WEBHOOK_SECRET = process.env.TB_WEBHOOK_SECRET || "";

function normalizeSecret(value: string): string {
  return value.trim().replace(/ /g, "+");
}

function toStatus(raw: unknown): "ACTIVE" | "ACKNOWLEDGED" | "CLEARED" {
  const value = String(raw || "ACTIVE").toUpperCase();
  if (value.includes("CLEAR")) return "CLEARED";
  if (value.includes("ACK")) return "ACKNOWLEDGED";
  return "ACTIVE";
}

function toSeverity(raw: unknown): "WARNING" | "CRITICAL" | null {
  const value = String(raw || "").toUpperCase();
  if (value === "CRITICAL") return "CRITICAL";
  if (value === "WARNING") return "WARNING";
  return null;
}

function toDate(raw: unknown): Date {
  if (typeof raw === "number") return new Date(raw);
  if (typeof raw === "string") {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

type IssueBuckets = {
  critical: string[];
  warning: string[];
};

function buildIssuesFromParams(params: {
  temperature?: number | null;
  ph?: number | null;
  dissolvedOxygen?: number | null;
  salinity?: number | null;
  turbidity?: number | null;
}): IssueBuckets {
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

function buildSensorMessage(
  severity: "WARNING" | "CRITICAL",
  params: {
    temperature?: number | null;
    ph?: number | null;
    dissolvedOxygen?: number | null;
    salinity?: number | null;
    turbidity?: number | null;
  }
): string {
  const issues = buildIssuesFromParams(params);
  const list = severity === "CRITICAL" ? issues.critical : issues.warning;
  if (list.length === 0) return `${severity}: Water quality is not normal`;

  if (severity === "CRITICAL" && issues.warning.length > 0) {
    return `${severity}: ${list.join(" | ")} | Warning: ${issues.warning.join(" | ")}`;
  }

  return `${severity}: ${list.join(" | ")}`;
}

type SensorParams = {
  temperature?: number | null;
  ph?: number | null;
  dissolvedOxygen?: number | null;
  salinity?: number | null;
  turbidity?: number | null;
};

function normalizeParams(params: SensorParams): Record<string, number | null> {
  return {
    temperature:
      typeof params.temperature === "number" && Number.isFinite(params.temperature)
        ? params.temperature
        : null,
    ph: typeof params.ph === "number" && Number.isFinite(params.ph) ? params.ph : null,
    dissolvedOxygen:
      typeof params.dissolvedOxygen === "number" && Number.isFinite(params.dissolvedOxygen)
        ? params.dissolvedOxygen
        : null,
    salinity:
      typeof params.salinity === "number" && Number.isFinite(params.salinity)
        ? params.salinity
        : null,
    turbidity:
      typeof params.turbidity === "number" && Number.isFinite(params.turbidity)
        ? params.turbidity
        : null,
  };
}

function isSameParams(
  a: Record<string, number | null>,
  b: Record<string, number | null>,
): boolean {
  return (
    a.temperature === b.temperature &&
    a.ph === b.ph &&
    a.dissolvedOxygen === b.dissolvedOxygen &&
    a.salinity === b.salinity &&
    a.turbidity === b.turbidity
  );
}

// Hitung severity yang benar dari nilai sensor aktual
function computeSeverity(params: {
  temperature?: number | null;
  ph?: number | null;
  dissolvedOxygen?: number | null;
  salinity?: number | null;
  turbidity?: number | null;
}): "WARNING" | "CRITICAL" | null {
  const t = params.temperature ?? undefined;
  const p = params.ph ?? undefined;
  const d = params.dissolvedOxygen ?? undefined;
  const s = params.salinity ?? undefined;
  const tb = params.turbidity ?? undefined;

  const issues = buildIssuesFromParams({
    temperature: t,
    ph: p,
    dissolvedOxygen: d,
    salinity: s,
    turbidity: tb,
  });
  if (issues.critical.length > 0) return "CRITICAL";
  if (issues.warning.length > 0) return "WARNING";

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    if (ALERT_WEBHOOK_SECRET) {
      const querySecret = searchParams.get("secret");
      if (!querySecret || normalizeSecret(querySecret) !== normalizeSecret(ALERT_WEBHOOK_SECRET)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const body = await request.json();
    const payload =
      body?.msg && typeof body.msg === "object"
        ? body.msg
        : body;
    const metadata =
      body?.metadata && typeof body.metadata === "object"
        ? body.metadata
        : {};
    let details: Record<string, any> = {};
    if (payload?.details) {
      if (typeof payload.details === "string") {
        try {
          details = JSON.parse(payload.details);
        } catch {
          details = {};
        }
      } else if (typeof payload.details === "object") {
        details = payload.details;
      }
    }

    const queryDeviceId = searchParams.get("deviceId");
    const bodyDeviceId = payload?.deviceId || metadata?.deviceId || body?.deviceId;
    const tbDeviceId = String(queryDeviceId || bodyDeviceId || "").trim();

    if (!tbDeviceId) {
      return NextResponse.json({ error: "Missing deviceId" }, { status: 400 });
    }

    // Status dari metadata sering stale (mis. ACK lama), jadi jangan dijadikan prioritas.
    const explicitStatus =
      payload?.status ?? details?.status ?? body?.status ?? null;
    const rawStatus = String(explicitStatus || "ACTIVE").toUpperCase();

    // ── Extract parameters (nilai sensor) ─────────────────────────────────
    const rawParams =
      payload?.parameters ||
      details?.parameters ||
      body?.parameters ||
      {};

    const sensorParams = {
      temperature: rawParams.temperature != null ? Number(rawParams.temperature) : null,
      ph: rawParams.ph != null ? Number(rawParams.ph) : null,
      dissolvedOxygen: rawParams.dissolvedOxygen != null ? Number(rawParams.dissolvedOxygen) : null,
      salinity: rawParams.salinity != null ? Number(rawParams.salinity) : null,
      turbidity: rawParams.turbidity != null ? Number(rawParams.turbidity) : null,
    };

    // Jika parameters kosong, coba dari root body
    const hasParams = Object.values(sensorParams).some((v) => v !== null && !isNaN(v as number));
    if (!hasParams) {
      if (payload.temperature != null) sensorParams.temperature = Number(payload.temperature);
      if (payload.ph != null) sensorParams.ph = Number(payload.ph);
      if (payload.dissolvedOxygen != null) sensorParams.dissolvedOxygen = Number(payload.dissolvedOxygen);
      if (payload.salinity != null) sensorParams.salinity = Number(payload.salinity);
      if (payload.turbidity != null) sensorParams.turbidity = Number(payload.turbidity);
    }

    const hasValidParams = Object.values(sensorParams).some((v) => v !== null && !isNaN(v as number));

    // ── Severity: trust payload first, fallback to computed ───────────────
    let severity: "WARNING" | "CRITICAL" | null =
      toSeverity(payload?.severity) ||
      toSeverity(details?.severity) ||
      toSeverity(metadata?.severity) ||
      toSeverity(body?.severity);

    if (!severity && hasValidParams) {
      severity = computeSeverity(sensorParams);
    }

    if (!severity) {
      return NextResponse.json({ success: true, skipped: "no severity" });
    }

    // ── Build message ──────────────────────────────────────────────────────
    const message = String(
      payload?.message ||
        (hasValidParams
          ? buildSensorMessage(severity, sensorParams)
          : `${severity} Water Quality`),
    ).trim();

    let status = toStatus(rawStatus);
    // Jika tidak ada explicit status namun ada severity + parameter valid,
    // anggap event baru sebagai ACTIVE agar notifikasi/DB tidak hilang.
    if (!explicitStatus && hasValidParams && status === "ACKNOWLEDGED") {
      status = "ACTIVE";
    }
    const action =
      payload?.action ||
      (severity === "CRITICAL" ? "CHECK POND IMMEDIATELY!" : "Needs inspection");
    const eventTime = toDate(payload?.timestamp || payload?.createdTime || body?.timestamp);
    const tbAlarmId =
      String(payload?.alarmId || payload?.id?.id || metadata?.alarmId || "").trim() || null;
    const eventKey = tbAlarmId
      ? `${tbAlarmId}:${status}:${eventTime.getTime()}`
      : `${tbDeviceId}:${status}:${eventTime.getTime()}:${Date.now()}`;

    // ── Cari device ────────────────────────────────────────────────────────
    const device = await prisma.device.findFirst({
      where: { thingsboardDeviceId: tbDeviceId, isActive: true },
      include: { pond: { select: { id: true, userId: true, name: true } } },
    });

    if (!device) {
      return NextResponse.json({ error: "Device not found" }, { status: 404 });
    }

    const normalizedParams = normalizeParams(sensorParams);
    const parametersJson = hasValidParams ? (normalizedParams as any) : null;
    const alertDelegate = (prisma as any).alertEvent;

    // Dedup 1 menit: untuk device + severity yang sama, jika parameter telemetry
    // sama persis dalam 60 detik terakhir, skip insert agar tidak spam DB.
    if (hasValidParams) {
      const dedupSince = new Date(Date.now() - 60 * 1000);
      const recentRows = alertDelegate
        ? await alertDelegate.findMany({
            where: {
              deviceId: device.id,
              severity,
              eventTime: { gte: dedupSince },
            },
            select: {
              id: true,
              parameters: true,
              eventTime: true,
            },
            orderBy: { eventTime: "desc" },
            take: 20,
          })
        : await prisma.$queryRaw<Array<{ id: bigint; parameters: Prisma.JsonValue; eventTime: Date }>>(Prisma.sql`
            SELECT id, parameters, event_time AS "eventTime"
            FROM alert_events
            WHERE device_id = ${device.id}
              AND severity = ${severity}::alert_severity
              AND event_time >= ${dedupSince}
            ORDER BY event_time DESC
            LIMIT 20
          `);

      const hasDuplicateInLastMinute = recentRows.some((row: any) => {
        const rowParams =
          row?.parameters && typeof row.parameters === "object"
            ? normalizeParams(row.parameters as SensorParams)
            : normalizeParams({});
        return isSameParams(rowParams, normalizedParams);
      });

      if (hasDuplicateInLastMinute) {
        return NextResponse.json({
          success: true,
          deduped: true,
          severity,
          status,
          message,
        });
      }
    }

    // ── Simpan ke DB ───────────────────────────────────────────────────────
    const saved = alertDelegate
      ? await alertDelegate.upsert({
          where: { eventKey },
          update: { status, severity, message, parameters: parametersJson, action, eventTime },
          create: {
            eventKey, tbAlarmId, tbDeviceId,
            userId: device.pond.userId,
            pondId: device.pond.id,
            deviceId: device.id,
            severity, status, message,
            parameters: parametersJson,
            action, eventTime,
          },
        })
      : (await prisma.$queryRaw<Array<{ id: bigint }>>(Prisma.sql`
          INSERT INTO alert_events (
            event_key, tb_alarm_id, tb_device_id, user_id, pond_id, device_id,
            severity, status, message, parameters, action, event_time, updated_at
          ) VALUES (
            ${eventKey}, ${tbAlarmId}, ${tbDeviceId},
            ${device.pond.userId}, ${device.pond.id}, ${device.id},
            ${severity}::alert_severity, ${status}::alert_status,
            ${message},
            ${parametersJson ? JSON.stringify(parametersJson) : null}::jsonb,
            ${action || null}, ${eventTime}, NOW()
          )
          ON CONFLICT (event_key) DO UPDATE SET
            status = EXCLUDED.status, severity = EXCLUDED.severity,
            message = EXCLUDED.message, parameters = EXCLUDED.parameters,
            action = EXCLUDED.action, event_time = EXCLUDED.event_time,
            updated_at = NOW()
          RETURNING id
        `))[0] || { id: BigInt(0) };

    // ── Trigger Pusher ─────────────────────────────────────────────────────
    await triggerAlertEvent({
      alertId: String(saved.id),
      deviceId: tbDeviceId,
      severity,
      status,
      message,
      action: action || undefined,
      eventTime: eventTime.getTime(),
    });

    // ── Telegram notification ─────────────────────────────────────────────
    try {
      const sharedUsers = await prisma.userDevice.findMany({
        where: { deviceId: device.id },
        select: { userId: true },
      });

      const userIds = new Set<number>([device.pond.userId]);
      sharedUsers.forEach((item) => userIds.add(item.userId));

      const users = await prisma.user.findMany({
        where: {
          id: { in: Array.from(userIds) },
          telegramChatId: { not: null },
        },
        select: { telegramChatId: true },
      });

      const fallbackChatId =
        process.env.NODE_ENV === "development"
          ? process.env.TELEGRAM_CHAT_ID
          : undefined;

      const chatIds = users
        .map((item) => item.telegramChatId)
        .filter((value): value is string => Boolean(value));

      if (chatIds.length === 0 && fallbackChatId) {
        chatIds.push(fallbackChatId);
      }

      if (chatIds.length > 0) {
        const telegramMessage = hasValidParams
          ? buildSensorMessage(severity, sensorParams)
          : message;
        const telegramText = buildAlertTelegramMessage({
          severity,
          pondName: device.pond.name,
          deviceId: tbDeviceId,
          deviceName: device.name,
          message: telegramMessage,
          action,
          status,
          eventTime,
        });

        await Promise.all(
          chatIds.map((chatId) => sendTelegramMessage(chatId, telegramText)),
        );
      }
    } catch (error) {
      console.error("Telegram notification error:", error);
    }

    console.log(`✅ Alert saved: ${severity} ${status} | ${message}`);

    return NextResponse.json({
      success: true,
      id: String(saved.id),
      severity, status, message,
    });
  } catch (error) {
    console.error("Alert webhook error:", error);
    return NextResponse.json({ error: "Failed to process alert webhook" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ status: "ok" });
}