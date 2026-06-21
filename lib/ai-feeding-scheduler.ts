import { prisma } from "@/lib/db";
import { thingsboardService } from "@/lib/thingsboard";

const AI_API = process.env.AI_API_URL ?? "https://ai.hehehe.tech";
const AI_KEY = process.env.AI_API_KEY ?? "";
const AUTO_FEEDING_ENABLED =
  (process.env.AI_AUTO_FEEDING_ENABLED ?? "false").toLowerCase() === "true";
const COOLDOWN_MINUTES = Number.parseInt(
  process.env.AI_AUTO_FEEDING_COOLDOWN_MINUTES ?? "60",
  10,
);

interface AIAutoResponse {
  should_feed: boolean;
  confidence: number;
  feed_amount_g: number;
  water_quality: string;
  recommendation: string;
  warnings: string[];
  timestamp: string;
}

function minutesSince(date: Date) {
  const diffMs = Date.now() - date.getTime();
  return diffMs / 1000 / 60;
}

async function sendAIPrediction(pondId: number, deviceId: number) {
  const latestSensor = await prisma.hourlySummary.findFirst({
    where: { pondId },
    orderBy: { timestamp: "desc" },
  });

  if (!latestSensor) {
    console.log(`⏭️  AI feeding skipped: no sensor data for pond ${pondId}`);
    return null;
  }

  const aiRes = await fetch(`${AI_API}/predict`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(AI_KEY ? { "X-API-Key": AI_KEY } : {}),
    },
    body: JSON.stringify({
      pond_id: pondId,
      device_id: deviceId,
      temperature: Number(latestSensor.avgTemperature),
      ph: Number(latestSensor.avgPh),
      dissolved_oxygen: Number(latestSensor.avgDissolvedOxygen),
      salinity: Number(latestSensor.avgSalinity),
      turbidity: Number(latestSensor.avgTurbidity),
    }),
    signal: AbortSignal.timeout(8000),
  });

  if (!aiRes.ok) {
    console.error(
      `❌ AI API failed for pond ${pondId}: ${aiRes.status} ${aiRes.statusText}`,
    );
    return null;
  }

  return (await aiRes.json()) as AIAutoResponse;
}

async function sendAIPredictionWithSensor(
  pondId: number,
  deviceId: number,
  sensor: {
    temperature: number | null;
    ph: number | null;
    dissolvedOxygen: number | null;
    salinity: number | null;
    turbidity: number | null;
  },
) {
  if (
    sensor.temperature === null ||
    sensor.ph === null ||
    sensor.dissolvedOxygen === null ||
    sensor.salinity === null ||
    sensor.turbidity === null
  ) {
    console.log(`⏭️  AI feeding skipped: incomplete sensor data for pond ${pondId}`);
    return null;
  }

  const aiRes = await fetch(`${AI_API}/predict`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(AI_KEY ? { "X-API-Key": AI_KEY } : {}),
    },
    body: JSON.stringify({
      pond_id: pondId,
      device_id: deviceId,
      temperature: sensor.temperature,
      ph: sensor.ph,
      dissolved_oxygen: sensor.dissolvedOxygen,
      salinity: sensor.salinity,
      turbidity: sensor.turbidity,
    }),
    signal: AbortSignal.timeout(8000),
  });

  if (!aiRes.ok) {
    console.error(
      `❌ AI API failed for pond ${pondId}: ${aiRes.status} ${aiRes.statusText}`,
    );
    return null;
  }

  return (await aiRes.json()) as AIAutoResponse;
}

async function recordFeeding(
  pondId: number,
  deviceId: number,
  payload: {
    status: "COMPLETED" | "FAILED";
    amount: number;
    notes: string;
    temperature: number | null;
    ph: number | null;
    dissolvedOxygen: number | null;
    salinity: number | null;
    turbidity: number | null;
  },
) {
  await prisma.feedingHistory.create({
    data: {
      pondId,
      deviceId,
      feedingType: "AI",
      feedingStatus: payload.status,
      amount: payload.amount,
      plannedAmount: payload.amount,
      temperature: payload.temperature,
      ph: payload.ph,
      dissolvedOxygen: payload.dissolvedOxygen,
      salinity: payload.salinity,
      turbidity: payload.turbidity,
      executedAt: new Date(),
      notes: payload.notes,
    },
  });
}

export async function runAIAutoFeeding() {
  if (!AUTO_FEEDING_ENABLED) {
    console.log("⏭️  AI auto feeding disabled");
    return;
  }

  const ponds = await prisma.pond.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      devices: {
        where: {
          isActive: true,
          deviceType: { in: ["FEEDER", "HYBRID"] },
          thingsboardDeviceId: { not: null },
        },
        select: { id: true, thingsboardDeviceId: true, name: true },
        take: 1,
      },
    },
  });

  for (const pond of ponds) {
    const feederDevice = pond.devices[0];
    if (!feederDevice?.thingsboardDeviceId) {
      console.log(`⏭️  AI feeding skipped: no feeder device for pond ${pond.id}`);
      continue;
    }

    const latestSensor = await prisma.hourlySummary.findFirst({
      where: { pondId: pond.id },
      orderBy: { timestamp: "desc" },
    });

    if (!latestSensor) {
      console.log(
        `⏭️  AI feeding skipped: no sensor data for pond ${pond.id}`,
      );
      continue;
    }

    const lastFeeding = await prisma.feedingHistory.findFirst({
      where: {
        pondId: pond.id,
        feedingStatus: "COMPLETED",
      },
      orderBy: { executedAt: "desc" },
    });

    if (lastFeeding && minutesSince(lastFeeding.executedAt) < COOLDOWN_MINUTES) {
      console.log(
        `⏭️  Feeding cooldown active for pond ${pond.id} (${pond.name}) — last feed was ${lastFeeding.feedingType} at ${lastFeeding.executedAt.toISOString()}`,
      );
      continue;
    }

    const aiResult = await sendAIPrediction(pond.id, feederDevice.id);
    if (!aiResult) continue;

    if (!aiResult.should_feed || aiResult.feed_amount_g <= 0) {
      console.log(
        `ℹ️  AI decided not to feed pond ${pond.id} (${pond.name})`,
      );
      continue;
    }

    try {
      await thingsboardService.sendRPCOneway(
        feederDevice.thingsboardDeviceId,
        "triggerFeeding",
        {
          amount_g: aiResult.feed_amount_g,
          source: "ai",
          ts: Date.now(),
          confidence: aiResult.confidence,
        },
      );

      await recordFeeding(pond.id, feederDevice.id, {
        status: "COMPLETED",
        amount: aiResult.feed_amount_g,
        notes: `AI auto feeding. ${aiResult.recommendation}`,
        temperature: Number(latestSensor.avgTemperature),
        ph: Number(latestSensor.avgPh),
        dissolvedOxygen: Number(latestSensor.avgDissolvedOxygen),
        salinity: Number(latestSensor.avgSalinity),
        turbidity: Number(latestSensor.avgTurbidity),
      });

      console.log(
        `✅ AI auto feeding sent for pond ${pond.id} (${pond.name}) - ${aiResult.feed_amount_g}g`,
      );
    } catch (error) {
      console.error(`❌ AI auto feeding RPC failed for pond ${pond.id}`, error);

      await recordFeeding(pond.id, feederDevice.id, {
        status: "FAILED",
        amount: aiResult.feed_amount_g,
        notes: `AI auto feeding failed: ${String(error)}`,
        temperature: Number(latestSensor.avgTemperature),
        ph: Number(latestSensor.avgPh),
        dissolvedOxygen: Number(latestSensor.avgDissolvedOxygen),
        salinity: Number(latestSensor.avgSalinity),
        turbidity: Number(latestSensor.avgTurbidity),
      });
    }
  }
}

export async function runAIAutoFeedingFromWebhook(params: {
  tbDeviceId: string;
  sensor: {
    temperature: number | null;
    ph: number | null;
    dissolvedOxygen: number | null;
    salinity: number | null;
    turbidity: number | null;
  };
}) {
  if (!AUTO_FEEDING_ENABLED) {
    console.log("⏭️  AI auto feeding disabled");
    return { skipped: "disabled" };
  }

  const device = await prisma.device.findFirst({
    where: { thingsboardDeviceId: params.tbDeviceId, isActive: true },
    include: { pond: { select: { id: true, name: true } } },
  });

  if (!device) {
    return { skipped: "device_not_found" };
  }

  if (!device.thingsboardDeviceId) {
    return { skipped: "missing_tb_device_id" };
  }

  const lastFeeding = await prisma.feedingHistory.findFirst({
    where: {
      pondId: device.pondId,
      feedingStatus: "COMPLETED",
    },
    orderBy: { executedAt: "desc" },
  });

  if (lastFeeding && minutesSince(lastFeeding.executedAt) < COOLDOWN_MINUTES) {
    return { skipped: "cooldown", lastFeedType: lastFeeding.feedingType };
  }

  const aiResult = await sendAIPredictionWithSensor(
    device.pondId,
    device.id,
    params.sensor,
  );
  if (!aiResult) return { skipped: "ai_failed" };

  if (!aiResult.should_feed || aiResult.feed_amount_g <= 0) {
    return { skipped: "ai_rejected", recommendation: aiResult.recommendation };
  }

  try {
    await thingsboardService.sendRPCOneway(
      device.thingsboardDeviceId,
      "triggerFeeding",
      {
        amount_g: aiResult.feed_amount_g,
        source: "ai",
        ts: Date.now(),
        confidence: aiResult.confidence,
      },
    );

    await recordFeeding(device.pondId, device.id, {
      status: "COMPLETED",
      amount: aiResult.feed_amount_g,
      notes: `AI auto feeding. ${aiResult.recommendation}`,
      temperature: params.sensor.temperature,
      ph: params.sensor.ph,
      dissolvedOxygen: params.sensor.dissolvedOxygen,
      salinity: params.sensor.salinity,
      turbidity: params.sensor.turbidity,
    });

    return {
      success: true,
      feed_amount_g: aiResult.feed_amount_g,
      recommendation: aiResult.recommendation,
      confidence: aiResult.confidence,
    };
  } catch (error) {
    await recordFeeding(device.pondId, device.id, {
      status: "FAILED",
      amount: aiResult.feed_amount_g,
      notes: `AI auto feeding failed: ${String(error)}`,
      temperature: params.sensor.temperature,
      ph: params.sensor.ph,
      dissolvedOxygen: params.sensor.dissolvedOxygen,
      salinity: params.sensor.salinity,
      turbidity: params.sensor.turbidity,
    });

    return { skipped: "rpc_failed" };
  }
}
