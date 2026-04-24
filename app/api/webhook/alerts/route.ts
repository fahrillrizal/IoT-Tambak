import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { triggerAlertEvent } from "@/lib/pusher";

const ALERT_WEBHOOK_SECRET = process.env.TB_WEBHOOK_SECRET || "";

function toStatus(raw: unknown): "ACTIVE" | "CLEARED" | "ACKNOWLEDGED" {
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

export async function POST(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    if (ALERT_WEBHOOK_SECRET) {
      const querySecret = searchParams.get("secret");
      if (querySecret !== ALERT_WEBHOOK_SECRET) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const body = await request.json();

    const queryDeviceId = searchParams.get("deviceId");
    const bodyDeviceId = body?.deviceId || body?.metadata?.deviceId;
    const tbDeviceId = String(queryDeviceId || bodyDeviceId || "").trim();

    if (!tbDeviceId) {
      return NextResponse.json(
        { error: "Missing deviceId" },
        { status: 400 }
      );
    }

    const detailObject =
      typeof body?.details === "object" && body?.details !== null
        ? body.details
        : body;

    const severity =
      toSeverity(detailObject?.severity) ||
      toSeverity(body?.severity) ||
      toSeverity(body?.metadata?.severity);

    if (!severity) {
      return NextResponse.json({ success: true, skipped: "non warning/critical" });
    }

    const status = toStatus(detailObject?.status || body?.status);

    const message =
      String(
        detailObject?.message ||
          body?.message ||
          body?.metadata?.criticalMessage ||
          body?.metadata?.warningMessage ||
          `${severity} Water Quality`
      ).trim() || `${severity} Water Quality`;

    const action =
      detailObject?.action ||
      body?.action ||
      (severity === "CRITICAL" ? "SEGERA CEK TAMBAK!" : "Warning");

    const issueCountRaw =
      detailObject?.issueCount || body?.issueCount || body?.metadata?.criticalCount;
    const issueCount =
      issueCountRaw === undefined || issueCountRaw === null
        ? null
        : Number(issueCountRaw);

    const parameters =
      detailObject?.parameters && typeof detailObject.parameters === "object"
        ? detailObject.parameters
        : null;

    const eventTime = toDate(
      detailObject?.timestamp || body?.timestamp || body?.createdTime
    );

    const tbAlarmId =
      String(
        body?.alarmId ||
          body?.id?.id ||
          body?.id ||
          body?.metadata?.alarmId ||
          ""
      ).trim() || null;

    const eventKey = `${tbAlarmId || tbDeviceId}:${status}:${eventTime.getTime()}`;

    const device = await prisma.device.findFirst({
      where: {
        thingsboardDeviceId: tbDeviceId,
        isActive: true,
      },
      include: {
        pond: {
          select: {
            id: true,
            userId: true,
          },
        },
      },
    });

    if (!device) {
      return NextResponse.json(
        { error: "Device not found" },
        { status: 404 }
      );
    }

    const saved = await prisma.alertEvent.upsert({
      where: { eventKey },
      update: {
        status,
        severity,
        message,
        issueCount: Number.isNaN(issueCount as number) ? null : issueCount,
        parameters,
        action,
        eventTime,
      },
      create: {
        eventKey,
        tbAlarmId,
        tbDeviceId,
        userId: device.pond.userId,
        pondId: device.pond.id,
        deviceId: device.id,
        severity,
        status,
        message,
        issueCount: Number.isNaN(issueCount as number) ? null : issueCount,
        parameters,
        action,
        eventTime,
      },
    });

    await triggerAlertEvent({
      deviceId: tbDeviceId,
      severity,
      status,
      message,
      action: action || undefined,
      eventTime: eventTime.getTime(),
    });

    return NextResponse.json({
      success: true,
      id: saved.id.toString(),
      eventKey,
    });
  } catch (error) {
    console.error("Alert webhook error:", error);
    return NextResponse.json(
      { error: "Failed to process alert webhook" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ status: "ok" });
}
