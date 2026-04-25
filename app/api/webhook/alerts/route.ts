import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { triggerAlertEvent } from "@/lib/pusher";
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

    // ── Cek status — jika CLEARED, jangan simpan ke DB, trigger Pusher saja ─
    const rawStatus = String(
      payload?.status || details?.status || metadata?.status || "ACTIVE"
    ).toUpperCase();    

    // ── Extract parameters (nilai sensor) ─────────────────────────────────
    const rawParams =
      payload?.parameters ||
      details?.parameters ||
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

    const status = toStatus(rawStatus);
    const action = payload?.action ||
      (severity === "CRITICAL" ? "SEGERA CEK TAMBAK!" : "Perlu pengecekan");
    const eventTime = toDate(payload?.timestamp || payload?.createdTime || body?.timestamp);
    const tbAlarmId =
      String(payload?.alarmId || payload?.id?.id || metadata?.alarmId || "").trim() || null;
    const eventKey = `${tbAlarmId || tbDeviceId}:${status}:${eventTime.getTime()}`;

    // ── Cari device ────────────────────────────────────────────────────────
    const device = await prisma.device.findFirst({
      where: { thingsboardDeviceId: tbDeviceId, isActive: true },
      include: { pond: { select: { id: true, userId: true, name: true } } },
    });

    if (!device) {
      return NextResponse.json({ error: "Device not found" }, { status: 404 });
    }

    const parametersJson = hasValidParams ? (sensorParams as any) : null;
    const alertDelegate = (prisma as any).alertEvent;

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