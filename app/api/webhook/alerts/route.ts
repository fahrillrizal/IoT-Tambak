import { NextRequest, NextResponse } from "next/server";
import { pusher } from "@/lib/pusher";
import { prisma } from "@/lib/db";
import { sendTelegramMessage, buildAlertTelegramMessage } from "@/lib/telegram";

const ALERT_WEBHOOK_SECRET = process.env.TB_WEBHOOK_SECRET;

type AlarmSeverity = "CRITICAL" | "WARNING";
type AlarmStatus = "ACTIVE" | "CLEARED";

interface AlarmPayload {
  alarmId: string;
  deviceId: string;
  severity: AlarmSeverity;
  status: AlarmStatus;
  message: string;
  parameters: {
    temperature?: number | null;
    ph?: number | null;
    dissolvedOxygen?: number | null;
    salinity?: number | null;
    turbidity?: number | null;
    battery?: number | null;
    // Feed stock (from ThingsBoard rule chain)
    sisaPakan?: number | null;
    persenSisa?: string | null;
    kapasitas?: string | null;
    persenPakan?: string | null;
  };
  timestamp: string;
  action: string;
}

/**
 * Build a detailed human-readable message from sensor parameters.
 * Shows ALL latest telemetry values and marks which are WARNING/CRITICAL.
 * Example output:
 * "CRITICAL: pH HIGH: 9.81 (max: 8.5) | DO LOW: 1.6 mg/L (min: 5 mg/L) | Warning: Salinity slightly LOW: 8.8 ppt (min: 10 ppt)"
 */
function buildDetailedMessage(
  severity: AlarmSeverity,
  params: AlarmPayload["parameters"]
): string {
  const critical: string[] = [];
  const warning: string[] = [];

  const t = params.temperature;
  const p = params.ph;
  const d = params.dissolvedOxygen;
  const s = params.salinity;
  const tb = params.turbidity;
  const bat = params.battery;

  // Temperature (optimal: 26-30, critical: <24 or >32)
  if (t != null) {
    if (t < 24) critical.push(`Temperature LOW: ${t.toFixed(1)}°C (min: 26°C)`);
    else if (t > 32) critical.push(`Temperature HIGH: ${t.toFixed(1)}°C (max: 32°C)`);
    else if (t < 26) warning.push(`Temperature slightly LOW: ${t.toFixed(1)}°C (min: 26°C)`);
    else if (t > 30) warning.push(`Temperature slightly HIGH: ${t.toFixed(1)}°C (max: 30°C)`);
  }

  // pH (optimal: 7.5-8.0, critical: <6.0 or >8.5)
  if (p != null) {
    if (p < 6.0) critical.push(`pH LOW: ${p.toFixed(2)} (min: 7.5)`);
    else if (p > 8.5) critical.push(`pH HIGH: ${p.toFixed(2)} (max: 8.5)`);
    else if (p < 7.0) warning.push(`pH slightly LOW: ${p.toFixed(2)} (min: 7.5)`);
    else if (p > 8.0) warning.push(`pH slightly HIGH: ${p.toFixed(2)} (max: 8.0)`);
  }

  // Dissolved Oxygen (optimal: ≥5, critical: <4)
  if (d != null) {
    if (d < 4) critical.push(`DO LOW: ${d.toFixed(1)} mg/L (min: 5 mg/L)`);
    else if (d < 5) warning.push(`DO slightly LOW: ${d.toFixed(1)} mg/L (min: 5 mg/L)`);
  }

  // Salinity (optimal: 15-30, critical: <8 or >35)
  if (s != null) {
    if (s < 8) critical.push(`Salinity LOW: ${s.toFixed(1)} ppt (min: 10 ppt)`);
    else if (s > 35) critical.push(`Salinity HIGH: ${s.toFixed(1)} ppt (max: 30 ppt)`);
    else if (s < 10) warning.push(`Salinity slightly LOW: ${s.toFixed(1)} ppt (min: 10 ppt)`);
    else if (s > 30) warning.push(`Salinity slightly HIGH: ${s.toFixed(1)} ppt (max: 30 ppt)`);
  }

  // Turbidity (optimal: <50, critical: >80)
  if (tb != null) {
    if (tb > 80) critical.push(`Turbidity HIGH: ${tb.toFixed(1)} NTU (max: 50 NTU)`);
    else if (tb > 50) warning.push(`Turbidity slightly HIGH: ${tb.toFixed(1)} NTU (max: 50 NTU)`);
  }

  // Battery (critical: <15%)
  if (bat != null && bat < 15) {
    critical.push(`Battery LOW: ${bat.toFixed(0)}% (min: 15%)`);
  }

  const parts: string[] = [];
  if (critical.length > 0) parts.push(`CRITICAL: ${critical.join(" | ")}`);
  if (warning.length > 0) parts.push(`Warning: ${warning.join(" | ")}`);

  if (parts.length > 0) return parts.join(" | ");

  // Fallback if no specific issues detected from params
  return `${severity} alarm triggered`;
}

export async function POST(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    if (ALERT_WEBHOOK_SECRET) {
      const querySecret = searchParams.get("secret");
      if (querySecret !== ALERT_WEBHOOK_SECRET) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const tbDeviceId = searchParams.get("deviceId");
    if (!tbDeviceId) {
      return NextResponse.json({ error: "Missing deviceId" }, { status: 400 });
    }

    const body = await request.json() as AlarmPayload;

    const severityRaw = String(body.severity || "").toUpperCase();
    const status = (String(body.status || "ACTIVE")).toUpperCase() as AlarmStatus;

    if (!["CRITICAL", "WARNING"].includes(severityRaw)) {
      return NextResponse.json({ success: true, message: "Ignored: not an alarm" });
    }

    const severity = severityRaw as AlarmSeverity;

    // Cari device + pond + user dari thingsboardDeviceId
    const device = await prisma.device.findFirst({
      where: { thingsboardDeviceId: tbDeviceId },
      select: {
        id: true,
        name: true,
        pondId: true,
        pond: {
          select: {
            name: true,
            userId: true,
            user: {
              select: {
                telegramChatId: true,
              },
            },
          },
        },
      },
    });

    if (!device) {
      return NextResponse.json({ error: "Device not found" }, { status: 404 });
    }

    const isCleared = status === "CLEARED" || status === "CLEARED_ACK" as string;

    // Jika CLEARED — update AlertEvent existing, jangan buat baru
    if (isCleared) {
      if (body.alarmId) {
        await prisma.alertEvent.updateMany({
          where: {
            tbAlarmId: body.alarmId,
            status: "ACTIVE",
          },
          data: {
            status: "CLEARED",
            updatedAt: new Date(),
          },
        });
      }

      await pusher.trigger(`device-${tbDeviceId}`, "alarm-cleared", {
        deviceId: tbDeviceId,
        alarmId: body.alarmId,
        timestamp: Date.now(),
      });

      return NextResponse.json({ success: true, message: "Alarm cleared" });
    }

    // Buat eventKey unik agar tidak duplikat
    const eventKey = body.alarmId
      ? `alarm-${body.alarmId}`
      : `alarm-${tbDeviceId}-${severityRaw}-${Date.now()}`;

    // ALWAYS fetch latest telemetry from ThingsBoard for detailed message
    // (ThingsBoard alarm often sends empty or minimal parameters)
    let params: AlarmPayload["parameters"] = {};
    try {
      const { thingsboardService } = await import("@/lib/thingsboard");
      const keys = ["temperature", "ph", "dissolvedOxygen", "salinity", "turbidity", "battery"];
      const latest = await thingsboardService.getDeviceTelemetry(tbDeviceId, keys);

      const getVal = (arr?: any[]) => {
        if (Array.isArray(arr) && arr.length > 0) return parseFloat(arr[0].value);
        return null;
      };

      params = {
        temperature: getVal(latest.temperature),
        ph: getVal(latest.ph),
        dissolvedOxygen: getVal(latest.dissolvedOxygen),
        salinity: getVal(latest.salinity),
        turbidity: getVal(latest.turbidity),
        battery: getVal(latest.battery),
      };
    } catch (fetchErr) {
      console.error("[Alert Webhook] Failed to fetch latest telemetry:", fetchErr);
      // Fallback to body parameters if fetch fails
      params = body.parameters || {};
    }

    // Build detailed message from parameters
    const detailedMessage = buildDetailedMessage(severity, params);

    // Throttle: CRITICAL = 10 min, WARNING = 30 min
    const throttleMinutes = severity === "CRITICAL" ? 10 : 30;
    const throttleSince = new Date(Date.now() - throttleMinutes * 60 * 1000);

    const recentAlert = await prisma.alertEvent.findFirst({
      where: {
        tbDeviceId,
        severity,
        status: "ACTIVE",
        eventTime: { gte: throttleSince },
      },
      orderBy: { eventTime: "desc" },
    });

    // If recent alert exists, just update it (don't send new Telegram/Pusher)
    if (recentAlert) {
      await prisma.alertEvent.update({
        where: { id: recentAlert.id },
        data: {
          message: detailedMessage,
          parameters: params,
          updatedAt: new Date(),
        },
      });

      return NextResponse.json({
        success: true,
        throttled: true,
        message: `Throttled: last ${severity} alert was ${throttleMinutes} min ago`,
      });
    }

    // Upsert AlertEvent — jika alarmId sama, update; jika baru, insert
    const alertEvent = await prisma.alertEvent.upsert({
      where: { eventKey },
      update: {
        status: "ACTIVE",
        message: detailedMessage,
        parameters: params,
        action: body.action || (severity === "CRITICAL" ? "CHECK POND IMMEDIATELY!" : "Needs inspection"),
        updatedAt: new Date(),
      },
      create: {
        eventKey,
        tbAlarmId: body.alarmId || null,
        tbDeviceId,
        userId: device.pond.userId,
        pondId: device.pondId,
        deviceId: device.id,
        severity: severity === "CRITICAL" ? "CRITICAL" : "WARNING",
        status: "ACTIVE",
        message: detailedMessage,
        parameters: params,
        action: body.action || (severity === "CRITICAL" ? "CHECK POND IMMEDIATELY!" : "Needs inspection"),
        eventTime: new Date(),
      },
    });

    // Trigger Pusher
    const pusherPayload = {
      id: String(alertEvent.id),
      deviceId: tbDeviceId,
      alarmId: body.alarmId,
      severity,
      status: "ACTIVE",
      message: alertEvent.message,
      parameters: params,
      action: alertEvent.action,
      timestamp: Date.now(),
    };

    await Promise.all([
      pusher.trigger(`device-${tbDeviceId}`, "alarm-triggered", pusherPayload),
      pusher.trigger("global-alerts", "alarm-triggered", pusherPayload),
    ]);

    // Send Telegram notification
    const telegramChatId = device.pond.user?.telegramChatId;
    if (telegramChatId) {
      const isBatteryAlarm =
        params.battery != null &&
        params.battery < 15 &&
        !params.temperature &&
        !params.ph &&
        !params.dissolvedOxygen &&
        !params.salinity &&
        !params.turbidity;

      const telegramMessage = isBatteryAlarm
        ? [
            `🔋 BATTERY LOW ALERT`,
            `Pond: ${device.pond.name || "Pond"}`,
            `Device: ${device.name || tbDeviceId}`,
            `Battery: ${params.battery}%`,
            `Action: Charge or replace battery`,
            `Time: ${new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" })}`,
          ].join("\n")
        : buildAlertTelegramMessage({
            severity,
            pondName: device.pond.name,
            deviceId: tbDeviceId,
            deviceName: device.name,
            message: detailedMessage,
            action: alertEvent.action,
            status: "ACTIVE",
            eventTime: new Date(),
          });

      await sendTelegramMessage(telegramChatId, telegramMessage);
    }

    return NextResponse.json({
      success: true,
      alertEventId: String(alertEvent.id),
      deviceId: tbDeviceId,
      severity,
    });

  } catch (error) {
    console.error("Alert webhook error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ status: "ok" });
}