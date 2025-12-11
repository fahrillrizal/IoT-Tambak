import { prisma } from "@/lib/db";
import { thingsboardService } from "@/lib/thingsboard";

const DAILY_RETENTION_DAYS = 90;

type HourlyAgg = {
  avg: number;
  min: number;
  max: number;
  count: number;
};

function weightedAverage(items: HourlyAgg[]): number {
  const totalCount = items.reduce((acc, it) => acc + it.count, 0);
  if (!totalCount) return 0;
  const sum = items.reduce((acc, it) => acc + it.avg * it.count, 0);
  return parseFloat((sum / totalCount).toFixed(2));
}

function minFrom(items: HourlyAgg[]): number {
  if (!items.length) return 0;
  return Math.min(...items.map((it) => it.min));
}

function maxFrom(items: HourlyAgg[]): number {
  if (!items.length) return 0;
  return Math.max(...items.map((it) => it.max));
}

export async function saveDailySummaryForYesterday() {
  try {
    console.log("🕐 Starting daily summary save job...");

    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    yesterday.setUTCHours(0, 0, 0, 0);
    const yesterdayStr = yesterday.toISOString().split("T")[0];
    const yesterdayDate = new Date(yesterdayStr);

    const startOfDay = new Date(yesterday);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date(yesterday);
    endOfDay.setUTCHours(23, 59, 59, 999);

    console.log(`📊 Daily summary for date: ${yesterdayStr}`);
    console.log(
      `   Time range (UTC): ${startOfDay.toISOString()} to ${endOfDay.toISOString()}`
    );

    const ponds = await prisma.pond.findMany({
      where: {
        devices: {
          some: {
            isActive: true,
            thingsboardDeviceId: { not: null },
          },
        },
      },
      include: {
        devices: {
          where: {
            isActive: true,
            thingsboardDeviceId: { not: null },
          },
          select: { id: true, thingsboardDeviceId: true, name: true },
        },
      },
    });

    console.log(`📊 Processing ${ponds.length} ponds for ${yesterdayStr}`);

    for (const pond of ponds) {
      try {
        const hourly = await prisma.hourlySummary.findMany({
          where: {
            pondId: pond.id,
            timestamp: { gte: startOfDay, lte: endOfDay },
          },
          orderBy: { timestamp: "asc" },
        });

        console.log(
          `   📈 Found ${hourly.length} hourly records for pond ${pond.id} (${pond.name}) - ${pond.devices.length} devices`
        );

        let tempStats: HourlyAgg;
        let phStats: HourlyAgg;
        let doStats: HourlyAgg;
        let salStats: HourlyAgg;
        let turbStats: HourlyAgg;
        let dataPoints = 0;

        if (hourly.length > 0) {
          const toAgg = (picker: (h: any) => HourlyAgg) =>
            hourly.map(picker).filter((x) => x.count > 0);

          const tItems = toAgg((h) => ({
            avg: Number(h.avgTemperature),
            min: Number(h.minTemperature),
            max: Number(h.maxTemperature),
            count: h.dataPoints,
          }));
          const pItems = toAgg((h) => ({
            avg: Number(h.avgPh),
            min: Number(h.minPh),
            max: Number(h.maxPh),
            count: h.dataPoints,
          }));
          const dItems = toAgg((h) => ({
            avg: Number(h.avgDissolvedOxygen),
            min: Number(h.minDissolvedOxygen),
            max: Number(h.maxDissolvedOxygen),
            count: h.dataPoints,
          }));
          const sItems = toAgg((h) => ({
            avg: Number(h.avgSalinity),
            min: Number(h.avgSalinity),
            max: Number(h.avgSalinity),
            count: h.dataPoints,
          }));
          const tbItems = toAgg((h) => ({
            avg: Number(h.avgTurbidity),
            min: Number(h.avgTurbidity),
            max: Number(h.avgTurbidity),
            count: h.dataPoints,
          }));

          tempStats = {
            avg: weightedAverage(tItems),
            min: minFrom(tItems),
            max: maxFrom(tItems),
            count: tItems.reduce((a, b) => a + b.count, 0),
          };
          phStats = {
            avg: weightedAverage(pItems),
            min: minFrom(pItems),
            max: maxFrom(pItems),
            count: pItems.reduce((a, b) => a + b.count, 0),
          };
          doStats = {
            avg: weightedAverage(dItems),
            min: minFrom(dItems),
            max: maxFrom(dItems),
            count: dItems.reduce((a, b) => a + b.count, 0),
          };
          salStats = {
            avg: weightedAverage(sItems),
            min: minFrom(sItems),
            max: maxFrom(sItems),
            count: sItems.reduce((a, b) => a + b.count, 0),
          };
          turbStats = {
            avg: weightedAverage(tbItems),
            min: minFrom(tbItems),
            max: maxFrom(tbItems),
            count: tbItems.reduce((a, b) => a + b.count, 0),
          };

          dataPoints = tempStats.count;
        } else {
          console.log(
            `   🔄 No hourly summaries, fetching from ThingsBoard for ${pond.devices.length} devices`
          );

          const keys = [
            "temperature",
            "ph",
            "dissolvedOxygen",
            "salinity",
            "turbidity",
          ];
          const allStats: Record<string, number[]> = {
            temperature: [],
            ph: [],
            dissolvedOxygen: [],
            salinity: [],
            turbidity: [],
          };

          for (const device of pond.devices) {
            try {
              const history = await thingsboardService.getTelemetryHistory(
                device.thingsboardDeviceId!,
                keys,
                startOfDay.getTime(),
                endOfDay.getTime(),
                2000
              );

              for (const [key, values] of Object.entries(history)) {
                if (Array.isArray(values) && key in allStats) {
                  for (const item of values) {
                    allStats[key as keyof typeof allStats].push(
                      parseFloat(item.value)
                    );
                  }
                }
              }
              console.log(
                `      📡 Fetched data from device ${device.name} (${device.thingsboardDeviceId})`
              );
            } catch (deviceError) {
              console.warn(
                `      ⚠️ Failed to fetch from device ${device.name}:`,
                deviceError
              );
            }
          }

          const calc = (arr: number[]) => {
            if (!arr.length) return { avg: 0, min: 0, max: 0, count: 0 };
            const sum = arr.reduce((a, b) => a + b, 0);
            return {
              avg: parseFloat((sum / arr.length).toFixed(2)),
              min: Math.min(...arr),
              max: Math.max(...arr),
              count: arr.length,
            };
          };

          tempStats = calc(allStats.temperature);
          phStats = calc(allStats.ph);
          doStats = calc(allStats.dissolvedOxygen);
          salStats = calc(allStats.salinity);
          turbStats = calc(allStats.turbidity);
          dataPoints = tempStats.count;
        }

        if (dataPoints === 0) {
          console.log(`   ⏭️ Skipping pond ${pond.id} - no data points`);
          continue;
        }

        await prisma.dailySummary.upsert({
          where: {
            pondId_date: {
              pondId: pond.id,
              date: yesterdayDate,
            },
          },
          create: {
            pondId: pond.id,
            date: yesterdayDate,
            avgTemperature: tempStats.avg,
            minTemperature: tempStats.min,
            maxTemperature: tempStats.max,
            avgPh: phStats.avg,
            minPh: phStats.min,
            maxPh: phStats.max,
            avgDissolvedOxygen: doStats.avg,
            minDissolvedOxygen: doStats.min,
            maxDissolvedOxygen: doStats.max,
            avgSalinity: salStats.avg,
            minSalinity: salStats.min,
            maxSalinity: salStats.max,
            avgTurbidity: turbStats.avg,
            minTurbidity: turbStats.min,
            maxTurbidity: turbStats.max,
            dataPoints,
          },
          update: {
            avgTemperature: tempStats.avg,
            minTemperature: tempStats.min,
            maxTemperature: tempStats.max,
            avgPh: phStats.avg,
            minPh: phStats.min,
            maxPh: phStats.max,
            avgDissolvedOxygen: doStats.avg,
            minDissolvedOxygen: doStats.min,
            maxDissolvedOxygen: doStats.max,
            avgSalinity: salStats.avg,
            minSalinity: salStats.min,
            maxSalinity: salStats.max,
            avgTurbidity: turbStats.avg,
            minTurbidity: turbStats.min,
            maxTurbidity: turbStats.max,
            dataPoints,
          },
        });

        console.log(
          `✅ Saved daily summary for pond ${pond.id} (${pond.name}) - ${pond.devices.length} devices, ${dataPoints} data points`
        );

        try {
          const deletedCount = await prisma.hourlySummary.deleteMany({
            where: {
              pondId: pond.id,
              timestamp: { gte: startOfDay, lte: endOfDay },
            },
          });
          if (deletedCount.count > 0) {
            console.log(
              `🗑️  Deleted ${deletedCount.count} hourly records for pond ${pond.id}`
            );
          }
        } catch (deleteError) {
          console.warn(
            `⚠️  Failed to cleanup hourly summaries for pond ${pond.id}:`,
            deleteError
          );
        }
      } catch (error) {
        console.error(`❌ Error processing pond ${pond.id}:`, error);
      }
    }

    await cleanupOldDailySummaries();

    console.log("✨ Daily summary save job completed!");
  } catch (error) {
    console.error("🚨 Daily summary scheduler error:", error);
  }
}

export async function cleanupOldDailySummaries() {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - DAILY_RETENTION_DAYS);
  cutoffDate.setHours(0, 0, 0, 0);

  try {
    const result = await prisma.dailySummary.deleteMany({
      where: {
        date: {
          lt: cutoffDate,
        },
      },
    });

    if (result.count > 0) {
      console.log(
        `🗑️ Cleaned up ${result.count} daily summaries older than ${DAILY_RETENTION_DAYS} days`
      );
    }

    return result.count;
  } catch (error) {
    console.error("Failed to cleanup daily summaries:", error);
    return 0;
  }
}
