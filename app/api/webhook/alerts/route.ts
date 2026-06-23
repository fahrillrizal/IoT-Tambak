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
  };
  timestamp: string;
  action: string;
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

    // Upsert AlertEvent — jika alarmId sama, update; jika baru, insert
    const alertEvent = await prisma.alertEvent.upsert({
      where: { eventKey },
      update: {
        status: "ACTIVE",
        message: body.message || `${severity} alarm triggered`,
        parameters: body.parameters ?? {},
        action: body.action || "",
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
        message: body.message || `${severity} alarm triggered`,
        parameters: body.parameters ?? {},
        action: body.action || "",
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
      parameters: body.parameters ?? {},
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
        body.parameters?.battery != null &&
        body.parameters.battery < 15 &&
        !body.parameters.temperature &&
        !body.parameters.ph &&
        !body.parameters.dissolvedOxygen &&
        !body.parameters.salinity &&
        !body.parameters.turbidity;

      const telegramMessage = isBatteryAlarm
        ? [
            `🔋 BATTERY LOW ALERT`,
            `Pond: ${device.pond.name || "Pond"}`,
            `Device: ${device.name || tbDeviceId}`,
            `Battery: ${body.parameters.battery}%`,
            `Action: Charge or replace battery`,
            `Time: ${new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" })}`,
          ].join("\n")
        : buildAlertTelegramMessage({
            severity,
            pondName: device.pond.name,
            deviceId: tbDeviceId,
            deviceName: device.name,
            message: alertEvent.message,
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