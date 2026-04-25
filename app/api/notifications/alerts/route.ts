import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

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

function parseAlertId(targetId?: string): bigint | null {
  if (!targetId || !targetId.startsWith("alarm-")) return null;
  const raw = targetId.replace("alarm-", "").trim();
  if (!raw) return null;
  try {
    return BigInt(raw);
  } catch {
    return null;
  }
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
      ? await alertDelegate.findMany({
          where: {
            userId: user.id,
            status: "ACTIVE",
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
        }).then((items: any[]) =>
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
            AND ae.status = 'ACTIVE'
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

    return NextResponse.json({
      success: true,
      data: notifications,
      total: notifications.length,
    });
  } catch (error) {
    console.error("Notifications alerts fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch notifications" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
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

    const body = await request.json();
    const mode = String(body?.mode || "").toLowerCase();
    const alertId = parseAlertId(body?.targetId);

    const alertDelegate = (prisma as any).alertEvent;

    if (mode === "one") {
      if (!alertId) {
        return NextResponse.json(
          { error: "Invalid targetId" },
          { status: 400 },
        );
      }

      if (alertDelegate) {
        await alertDelegate.updateMany({
          where: {
            id: alertId,
            userId: user.id,
            status: "ACTIVE",
          },
          data: { status: "ACKNOWLEDGED" },
        });
      } else {
        await prisma.$executeRaw(Prisma.sql`
          UPDATE alert_events
          SET status = 'ACKNOWLEDGED', updated_at = NOW()
          WHERE id = ${alertId}
            AND user_id = ${user.id}
            AND status = 'ACTIVE'
        `);
      }

      return NextResponse.json({ success: true });
    }

    if (mode === "all") {
      if (alertDelegate) {
        await alertDelegate.updateMany({
          where: {
            userId: user.id,
            status: "ACTIVE",
            severity: { in: ["WARNING", "CRITICAL"] },
          },
          data: { status: "ACKNOWLEDGED" },
        });
      } else {
        await prisma.$executeRaw(Prisma.sql`
          UPDATE alert_events
          SET status = 'ACKNOWLEDGED', updated_at = NOW()
          WHERE user_id = ${user.id}
            AND status = 'ACTIVE'
            AND severity IN ('WARNING', 'CRITICAL')
        `);
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
  } catch (error) {
    console.error("Notifications alerts patch error:", error);
    return NextResponse.json(
      { error: "Failed to update notifications" },
      { status: 500 },
    );
  }
}