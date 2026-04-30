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
  const parts: string[] = [];
  if (params.temperature != null) parts.push(`Suhu ${Number(params.temperature).toFixed(1)}°C`);
  if (params.ph != null) parts.push(`pH ${Number(params.ph).toFixed(2)}`);
  if (params.dissolvedOxygen != null) parts.push(`DO ${Number(params.dissolvedOxygen).toFixed(1)} mg/L`);
  if (params.salinity != null) parts.push(`Salinitas ${Number(params.salinity).toFixed(1)} ppt`);
  if (params.turbidity != null) parts.push(`Turbidity ${Number(params.turbidity).toFixed(1)} NTU`);
  if (parts.length === 0) return `${severity}: Kondisi kualitas air tidak normal`;
  return `${severity}: ${parts.join(" • ")}`;
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

  if (
    (t !== undefined && (t < 26 || t > 32)) ||
    (p !== undefined && (p < 7.5 || p > 8.5)) ||
    (d !== undefined && (d < 4 || d > 8)) ||
    (s !== undefined && (s < 10 || s > 35)) ||
    (tb !== undefined && tb > 80)
  ) return "CRITICAL";

  if (
    (t !== undefined && (t < 27 || t > 31)) ||
    (p !== undefined && (p < 7.8 || p > 8.2)) ||
    (d !== undefined && (d < 5 || d > 7.5)) ||
    (s !== undefined && (s < 15 || s > 30)) ||
    (tb !== undefined && (tb < 10 || tb > 50))
  ) return "WARNING";

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

    // ── Severity: hitung dari sensor aktual, fallback dari TB ─────────────
    let severity: "WARNING" | "CRITICAL" | null = null;
    if (hasValidParams) {
      severity = computeSeverity(sensorParams);
    }
    if (!severity) {
      severity =
        toSeverity(payload?.severity) ||
        toSeverity(details?.severity) ||
        toSeverity(metadata?.severity) ||
        toSeverity(body?.severity);
    }

    if (!severity) {
      return NextResponse.json({ success: true, skipped: "no severity" });
    }

    // ── Build message ──────────────────────────────────────────────────────
    const message = hasValidParams
      ? buildSensorMessage(severity, sensorParams)
      : String(payload?.message || `${severity} Water Quality`).trim();

    let status = toStatus(rawStatus);
    // Jika tidak ada explicit status namun ada severity + parameter valid,
    // anggap event baru sebagai ACTIVE agar notifikasi/DB tidak hilang.
    if (!explicitStatus && hasValidParams && status === "ACKNOWLEDGED") {
      status = "ACTIVE";
    }
    const action = payload?.action ||
      (severity === "CRITICAL" ? "SEGERA CEK TAMBAK!" : "Perlu pengecekan");
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
        const telegramText = buildAlertTelegramMessage({
          severity,
          pondName: device.pond.name,
          deviceId: tbDeviceId,
          message,
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