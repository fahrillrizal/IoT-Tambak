import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { thingsboardService } from "@/lib/thingsboard";

const AI_API = process.env.AI_API_URL ?? "https://ai.hehehe.tech";
const AI_KEY = process.env.AI_API_KEY ?? "";

interface AIManualResponse {
  approved: boolean;
  feed_amount_g: number;
  requested_g: number;
  water_quality: string;
  reason: string;
  warnings: string[];
  confidence: number;
  timestamp: string;
}

interface ManualFeedingBody {
  pondId: number;
  requestedAmount: number;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = parseInt(session.user.id as string, 10);
    if (isNaN(userId)) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const body = (await req.json()) as ManualFeedingBody;
    const { pondId, requestedAmount } = body;

    if (!pondId || !requestedAmount || requestedAmount <= 0) {
      return NextResponse.json(
        { error: "pondId and requestedAmount (> 0) are required" },
        { status: 400 },
      );
    }

    // Verify pond access: owner OR shared via UserDevice
    const pond = await prisma.pond.findFirst({
      where: {
        id: pondId,
        OR: [
          { userId },
          { devices: { some: { userDevices: { some: { userId } } } } },
        ],
      },
      include: {
        devices: {
          where: { isActive: true, thingsboardDeviceId: { not: null } },
          select: { id: true, thingsboardDeviceId: true, name: true },
          take: 1,
        },
      },
    });

    if (!pond) {
      return NextResponse.json(
        { error: "Pond not found" },
        { status: 404 },
      );
    }

    const feederDevice = pond.devices[0];
    if (!feederDevice?.thingsboardDeviceId) {
      return NextResponse.json(
        { error: "No active device in this pond" },
        { status: 400 },
      );
    }

    // ── Kumpulkan warnings (non-blocking) ──────────────────────
    const warnings: string[] = [];

    // 1. Cek apakah terlalu dekat dengan feeding terakhir
    const lastFeeding = await prisma.feedingHistory.findFirst({
      where: { pondId, feedingStatus: "COMPLETED" },
      orderBy: { executedAt: "desc" },
      select: { amount: true, executedAt: true, feedingType: true },
    });

    if (lastFeeding) {
      const minutesAgo = Math.round(
        (Date.now() - lastFeeding.executedAt.getTime()) / 1000 / 60,
      );
      if (minutesAgo < 10) {
        warnings.push(
          `Peringatan: Pakan terakhir diberikan ${minutesAgo} menit lalu (${lastFeeding.feedingType}). Risiko overfeeding.`,
        );
      }
    }

    // 2. Panggil AI untuk cek kualitas air & jumlah wajar (non-blocking)
    let aiWarnings: string[] = [];
    let waterQuality = "unknown";
    let confidence = 0;
    let aiReason = "";

    const latestSensor = await prisma.hourlySummary.findFirst({
      where: { pondId },
      orderBy: { timestamp: "desc" },
    });

    if (latestSensor) {
      try {
        const aiRes = await fetch(`${AI_API}/predict/manual`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(AI_KEY ? { "X-API-Key": AI_KEY } : {}),
          },
          body: JSON.stringify({
            pond_id: pondId,
            device_id: feederDevice.id,
            temperature: Number(latestSensor.avgTemperature),
            ph: Number(latestSensor.avgPh),
            dissolved_oxygen: Number(latestSensor.avgDissolvedOxygen),
            salinity: Number(latestSensor.avgSalinity),
            turbidity: Number(latestSensor.avgTurbidity),
            requested_amount: requestedAmount,
          }),
          signal: AbortSignal.timeout(8000),
        });

        if (aiRes.ok) {
          const aiResult = (await aiRes.json()) as AIManualResponse;
          waterQuality = aiResult.water_quality;
          confidence = aiResult.confidence;
          aiReason = aiResult.reason;
          aiWarnings = aiResult.warnings || [];

          // Jika AI menolak, jadikan peringatan (bukan blocking)
          if (!aiResult.approved) {
            warnings.push(`Peringatan AI: ${aiResult.reason}`);
          }
        } else {
          console.warn(`[Manual Feed] AI API returned ${aiRes.status}, proceeding without AI validation`);
        }
      } catch (aiErr) {
        console.warn("[Manual Feed] AI API unreachable, proceeding without AI validation:", aiErr);
      }
    } else {
      warnings.push("Belum ada data sensor. Pemberian pakan tetap dilanjutkan tanpa validasi kualitas air.");
    }

    // Gabung semua warnings
    const allWarnings = [...warnings, ...aiWarnings];

    // ── Selalu kirim RPC (user override) ─────────────────────────
    let rpcSent = false;
    try {
      await thingsboardService.sendRPCOneway(
        feederDevice.thingsboardDeviceId,
        "triggerFeeding",
        {
          amount_g: requestedAmount,
          source: "manual_override",
          ts: Date.now(),
        },
      );
      rpcSent = true;
    } catch (rpcErr) {
      console.error("[RPC Error]", rpcErr);

      await prisma.feedingHistory.create({
        data: {
          deviceId: feederDevice.id,
          pondId,
          feedingType: "MANUAL",
          feedingStatus: "FAILED",
          amount: requestedAmount,
          plannedAmount: requestedAmount,
          temperature: latestSensor?.avgTemperature ?? null,
          ph: latestSensor?.avgPh ?? null,
          dissolvedOxygen: latestSensor?.avgDissolvedOxygen ?? null,
          salinity: latestSensor?.avgSalinity ?? null,
          turbidity: latestSensor?.avgTurbidity ?? null,
          executedAt: new Date(),
          triggeredBy: userId,
          notes: `Manual override — RPC failed: ${String(rpcErr)}`,
        },
      });

      return NextResponse.json(
        {
          error: "Failed to send command to device",
          rpc_sent: false,
          warnings: allWarnings,
        },
        { status: 502 },
      );
    }

    // ── Catat feeding berhasil ───────────────────────────────────
    const feedRecord = await prisma.feedingHistory.create({
      data: {
        deviceId: feederDevice.id,
        pondId,
        feedingType: "MANUAL",
        feedingStatus: "COMPLETED",
        amount: requestedAmount,
        plannedAmount: requestedAmount,
        temperature: latestSensor?.avgTemperature ?? null,
        ph: latestSensor?.avgPh ?? null,
        dissolvedOxygen: latestSensor?.avgDissolvedOxygen ?? null,
        salinity: latestSensor?.avgSalinity ?? null,
        turbidity: latestSensor?.avgTurbidity ?? null,
        executedAt: new Date(),
        triggeredBy: userId,
        notes: allWarnings.length > 0
          ? `Manual override dengan peringatan: ${allWarnings.join("; ")}`
          : `Manual override via dashboard.`,
      },
    });

    return NextResponse.json({
      success: true,
      rpc_sent: rpcSent,
      feed_amount_g: requestedAmount,
      water_quality: waterQuality,
      confidence,
      reason: aiReason || "Manual override — pakan diberikan sesuai permintaan user.",
      warnings: allWarnings,
      feeding_id: feedRecord.id.toString(),
      device_name: feederDevice.name,
    });
  } catch (err) {
    console.error("[Manual Feeding]", err);
    return NextResponse.json(
      { error: "Internal server error", details: String(err) },
      { status: 500 },
    );
  }
}
