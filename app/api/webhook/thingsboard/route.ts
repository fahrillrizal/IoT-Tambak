import { NextRequest, NextResponse } from "next/server";
import { pusher, triggerDeviceStatusUpdate } from "@/lib/pusher";
import { prisma } from "@/lib/db";

const WEBHOOK_SECRET = process.env.TB_WEBHOOK_SECRET;

export async function POST(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    if (WEBHOOK_SECRET) {
      const querySecret = searchParams.get("secret");
      if (querySecret !== WEBHOOK_SECRET) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const deviceId = searchParams.get("deviceId");
    if (!deviceId) {
      return NextResponse.json({ error: "Missing deviceId" }, { status: 400 });
    }

    const body = await request.json();

    const telemetryKeys = [
      "temperature",
      "ph",
      "dissolvedOxygen",
      "salinity",
      "turbidity",
      "battery",
      "sisaPakan",
    ];
    const telemetryData: Record<string, number> = {};

    for (const key of telemetryKeys) {
      const value = body[key];
      if (value !== undefined && value !== null) {
        const num =
          typeof value === "number" ? value : parseFloat(String(value));
        if (!isNaN(num)) telemetryData[key] = num;
      }
    }

    if (Object.keys(telemetryData).length === 0) {
      return NextResponse.json({ success: true, message: "No telemetry" });
    }

    // Update lastHeartbeat and mark device as ACTIVE when receiving telemetry
    const device = await prisma.device.findFirst({
      where: { thingsboardDeviceId: deviceId },
      select: { id: true, deviceStatus: true },
    });

    if (device) {
      const wasOffline = device.deviceStatus !== "ACTIVE";

      await prisma.device.update({
        where: { id: device.id },
        data: {
          lastHeartbeat: new Date(),
          deviceStatus: "ACTIVE",
        },
      });

      // If device was offline, notify clients it's now online
      if (wasOffline) {
        console.log(`📡 Device ${deviceId} is now ONLINE`);
        await triggerDeviceStatusUpdate(deviceId, true);
      }
    }

    const payload = {
      deviceId,
      ...telemetryData,
      timestamp: Date.now(),
    };

    await Promise.all([
      pusher.trigger(`device-${deviceId}`, "telemetry-update", payload),
      pusher.trigger("global-telemetry", "telemetry-update", payload),
    ]);

    // ═══════════════════════════════════════════════════════════════
    // ALERT DETECTION — directly from telemetry values
    // Battery: 5 min throttle, Water quality: CRITICAL 10min / WARNING 30min
    // Feed stock (sisaPakan): 5 min throttle
    // ═══════════════════════════════════════════════════════════════
    try {
      // Also read sisaPakan from telemetryData
      const sisaPakan = telemetryData.sisaPakan ?? null;

      const deviceForAlert = await prisma.device.findFirst({
        where: { thingsboardDeviceId: deviceId },
        select: {
          id: true,
          name: true,
          pondId: true,
          pond: {
            select: {
              name: true,
              userId: true,
              user: { select: { telegramChatId: true } },
            },
          },
        },
      });

      if (deviceForAlert) {
        const chatId = deviceForAlert.pond.user?.telegramChatId;
        const pondName = deviceForAlert.pond.name || "Pond";
        const deviceName = deviceForAlert.name || deviceId;

        // ── Helper: check throttle ──
        const isThrottled = async (msgPrefix: string, sev: "CRITICAL" | "WARNING", minutes: number) => {
          const since = new Date(Date.now() - minutes * 60 * 1000);
          const existing = await prisma.alertEvent.findFirst({
            where: {
              tbDeviceId: deviceId,
              severity: sev as any,
              message: { startsWith: msgPrefix },
              eventTime: { gte: since },
            },
          });
          return !!existing;
        };

        // ── Helper: create alert + send notif ──
        const createAlert = async (sev: "CRITICAL" | "WARNING", message: string, action: string, params: Record<string, any>) => {
          const eventKey = `telemetry-${deviceId}-${sev}-${Date.now()}`;
          await prisma.alertEvent.create({
            data: {
              eventKey,
              tbAlarmId: null,
              tbDeviceId: deviceId,
              userId: deviceForAlert.pond.userId,
              pondId: deviceForAlert.pondId,
              deviceId: deviceForAlert.id,
              severity: sev,
              status: "ACTIVE",
              message,
              parameters: params,
              action,
              eventTime: new Date(),
            },
          });

          // Pusher realtime
          const alertPayload = { deviceId, severity: sev, status: "ACTIVE", message, action, timestamp: Date.now() };
          await pusher.trigger(`device-${deviceId}`, "alert-event", alertPayload);
          await pusher.trigger("global-telemetry", "alert-event", alertPayload);

          // Telegram
          if (chatId) {
            const { sendTelegramMessage } = await import("@/lib/telegram");
            const emoji = sev === "CRITICAL" ? "🚨" : "⚠️";
            await sendTelegramMessage(chatId, [
              `${emoji} ${sev} — ${pondName}`,
              `Device: ${deviceName}`,
              `Message: ${message}`,
              `Action: ${action}`,
              `Time: ${new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" })}`,
            ].join("\n"));
          }
        };

        // ── 1. BATTERY LOW (<15%) — throttle 5 min ──
        if (telemetryData.battery != null && telemetryData.battery < 15) {
          const throttled = await isThrottled("Battery LOW", "WARNING", 5);
          if (!throttled) {
            await createAlert(
              "WARNING",
              `Battery LOW: ${telemetryData.battery.toFixed(0)}% (min: 15%)`,
              "Charge or replace battery",
              { battery: telemetryData.battery }
            );
          }
        }

        // ── 2. WATER QUALITY ──
        const t = telemetryData.temperature;
        const p = telemetryData.ph;
        const d = telemetryData.dissolvedOxygen;
        const s = telemetryData.salinity;
        const tb = telemetryData.turbidity;

        const critical: string[] = [];
        const warning: string[] = [];

        if (t != null) {
          if (t < 24) critical.push(`Temperature LOW: ${t.toFixed(1)}°C (min: 26°C)`);
          else if (t > 32) critical.push(`Temperature HIGH: ${t.toFixed(1)}°C (max: 32°C)`);
          else if (t < 26) warning.push(`Temperature slightly LOW: ${t.toFixed(1)}°C`);
          else if (t > 30) warning.push(`Temperature slightly HIGH: ${t.toFixed(1)}°C`);
        }
        if (p != null) {
          if (p < 6.0) critical.push(`pH LOW: ${p.toFixed(2)} (min: 7.5)`);
          else if (p > 8.5) critical.push(`pH HIGH: ${p.toFixed(2)} (max: 8.5)`);
          else if (p < 7.0) warning.push(`pH slightly LOW: ${p.toFixed(2)}`);
          else if (p > 8.0) warning.push(`pH slightly HIGH: ${p.toFixed(2)}`);
        }
        if (d != null) {
          if (d < 4) critical.push(`DO LOW: ${d.toFixed(1)} mg/L (min: 5 mg/L)`);
          else if (d < 5) warning.push(`DO slightly LOW: ${d.toFixed(1)} mg/L`);
        }
        if (s != null) {
          if (s < 8) critical.push(`Salinity LOW: ${s.toFixed(1)} ppt (min: 10 ppt)`);
          else if (s > 35) critical.push(`Salinity HIGH: ${s.toFixed(1)} ppt (max: 30 ppt)`);
          else if (s < 10) warning.push(`Salinity slightly LOW: ${s.toFixed(1)} ppt`);
          else if (s > 30) warning.push(`Salinity slightly HIGH: ${s.toFixed(1)} ppt`);
        }
        if (tb != null) {
          if (tb > 80) critical.push(`Turbidity HIGH: ${tb.toFixed(1)} NTU (max: 50 NTU)`);
          else if (tb > 50) warning.push(`Turbidity slightly HIGH: ${tb.toFixed(1)} NTU`);
        }

        // Send CRITICAL alert (throttle 10 min)
        if (critical.length > 0) {
          const msg = `CRITICAL: ${critical.join(" | ")}${warning.length > 0 ? ` | Warning: ${warning.join(" | ")}` : ""}`;
          const throttled = await isThrottled("CRITICAL:", "CRITICAL", 10);
          if (!throttled) {
            await createAlert("CRITICAL", msg, "CHECK POND IMMEDIATELY!", {
              temperature: t ?? null, ph: p ?? null, dissolvedOxygen: d ?? null,
              salinity: s ?? null, turbidity: tb ?? null, battery: telemetryData.battery ?? null,
            });
          }
        }
        // Send WARNING alert (throttle 30 min) — only if no critical
        else if (warning.length > 0) {
          const msg = `WARNING: ${warning.join(" | ")}`;
          const throttled = await isThrottled("WARNING:", "WARNING", 30);
          if (!throttled) {
            await createAlert("WARNING", msg, "Needs inspection", {
              temperature: t ?? null, ph: p ?? null, dissolvedOxygen: d ?? null,
              salinity: s ?? null, turbidity: tb ?? null, battery: telemetryData.battery ?? null,
            });
          }
        }

        // ── 3. FEED STOCK LOW (sisaPakan < 10% of capacity) — throttle 5 min ──
        // ThingsBoard rule chain sends alarm, but we also detect here from telemetry
        if (sisaPakan != null && sisaPakan >= 0) {
          // Get kapasitasPakan from device server attributes (stored in pond or device)
          // Default capacity 5000g if not configured
          const FEED_CAPACITY = 5000;
          const feedPercent = (sisaPakan / FEED_CAPACITY) * 100;

          if (feedPercent < 10) {
            const throttled = await isThrottled("Feed Stock LOW", "WARNING", 5);
            if (!throttled) {
              await createAlert(
                "WARNING",
                `Feed Stock LOW: ${sisaPakan.toFixed(0)}g (${feedPercent.toFixed(1)}% remaining)`,
                "Refill feed hopper",
                { sisaPakan, feedPercent: parseFloat(feedPercent.toFixed(1)) }
              );
            }
          }
        }
      }
    } catch (alertErr) {
      console.error("[Telemetry Webhook] Alert detection error:", alertErr);
    }

    return NextResponse.json({
      success: true,
      deviceId,
      telemetry: telemetryData,
    });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ status: "ok" });
}
