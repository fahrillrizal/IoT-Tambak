import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { thingsboardService } from "@/lib/thingsboard";

const AI_API = process.env.AI_API_URL ?? "https://hehehe.tech";
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

    if (!pondId || !requestedAmount) {
      return NextResponse.json(
        { error: "pondId and requestedAmount are required" },
        { status: 400 },
      );
    }

    const pond = await prisma.pond.findFirst({
      where: {
        id: pondId,
        userId: userId,
      },
      include: {
        devices: {
          where: { isActive: true, deviceType: { in: ["FEEDER", "HYBRID"] } },
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
        { error: "No active feeder device in this pond" },
        { status: 400 },
      );
    }

    const latestSensor = await prisma.hourlySummary.findFirst({
      where: { pondId },
      orderBy: { timestamp: "desc" },
    });

    if (!latestSensor) {
      return NextResponse.json(
        { error: "No sensor data yet." },
        { status: 400 },
      );
    }

    const lastFeeding = await prisma.feedingHistory.findFirst({
      where: { pondId, feedingStatus: "COMPLETED" },
      orderBy: { executedAt: "desc" },
      select: { amount: true },
    });

    const aiRes = await fetch(`${AI_API}/predict/manual`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(AI_KEY ? { "X-API-Key": AI_KEY } : {}),
      },
      body: JSON.stringify({
        temperature: Number(latestSensor.avgTemperature),
        ph: Number(latestSensor.avgPh),
        dissolved_oxygen: Number(latestSensor.avgDissolvedOxygen),
        salinity: Number(latestSensor.avgSalinity),
        turbidity: Number(latestSensor.avgTurbidity),
        shrimp_age_days: pond.shrimpAgeDays ?? 0,
        feeding_history_g: lastFeeding ? Number(lastFeeding.amount) : 0,
        requested_amount: requestedAmount,
        pond_id: pondId,
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!aiRes.ok) {
      return NextResponse.json(
        { error: "AI API is unreachable", details: await aiRes.text() },
        { status: 502 },
      );
    }

    const aiResult = (await aiRes.json()) as AIManualResponse;

    if (!aiResult.approved) {
      return NextResponse.json({
        success: false,
        approved: false,
        water_quality: aiResult.water_quality,
        reason: aiResult.reason,
        warnings: aiResult.warnings,
        confidence: aiResult.confidence,
      });
    }

    let rpcSent = false;
    try {
      await thingsboardService.sendRPCOneway(
        feederDevice.thingsboardDeviceId,
        "triggerFeeding",
        {
          amount_g: aiResult.feed_amount_g,
          source: "manual",
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
          amount: aiResult.feed_amount_g,
          plannedAmount: requestedAmount,
          temperature: latestSensor.avgTemperature,
          ph: latestSensor.avgPh,
          dissolvedOxygen: latestSensor.avgDissolvedOxygen,
          salinity: latestSensor.avgSalinity,
          turbidity: latestSensor.avgTurbidity,
          executedAt: new Date(),
          triggeredBy: userId,
          notes: `Manual feeding — RPC failed: ${String(rpcErr)}`,
        },
      });

      return NextResponse.json(
        {
          error: "Failed to send command to device",
          approved: true,
          rpc_sent: false,
        },
        { status: 502 },
      );
    }

    const feedRecord = await prisma.feedingHistory.create({
      data: {
        deviceId: feederDevice.id,
        pondId,
        feedingType: "MANUAL",
        feedingStatus: "COMPLETED",
        amount: aiResult.feed_amount_g,
        plannedAmount: requestedAmount,
        temperature: latestSensor.avgTemperature,
        ph: latestSensor.avgPh,
        dissolvedOxygen: latestSensor.avgDissolvedOxygen,
        salinity: latestSensor.avgSalinity,
        turbidity: latestSensor.avgTurbidity,
        executedAt: new Date(),
        triggeredBy: userId,
        notes: `Manual feeding via dashboard. Confidence: ${aiResult.confidence}`,
      },
    });

    return NextResponse.json({
      success: true,
      approved: true,
      rpc_sent: rpcSent,
      feed_amount_g: aiResult.feed_amount_g,
      requested_g: requestedAmount,
      water_quality: aiResult.water_quality,
      reason: aiResult.reason,
      warnings: aiResult.warnings,
      confidence: aiResult.confidence,
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
