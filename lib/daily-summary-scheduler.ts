import { prisma } from "@/lib/db";
import { thingsboardService } from "@/lib/thingsboard";

const DAILY_RETENTION_DAYS = 90;

// WIB Timezone helper (UTC+7)
const WIB_OFFSET_HOURS = 7;

function getWIBDate(date: Date = new Date()): Date {
  // Convert UTC to WIB by adding 7 hours
  const wibDate = new Date(date.getTime() + WIB_OFFSET_HOURS * 60 * 60 * 1000);
  return wibDate;
}

function wibToUTC(wibDate: Date): Date {
  // Convert WIB back to UTC by subtracting 7 hours
  return new Date(wibDate.getTime() - WIB_OFFSET_HOURS * 60 * 60 * 1000);
}

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
    console.log("🕐 Starting daily summary save job (WIB timezone)...");

    // Use WIB timezone (UTC+7)
    const nowWIB = getWIBDate();
    const yesterdayWIB = new Date(nowWIB);
    yesterdayWIB.setDate(yesterdayWIB.getDate() - 1);
    yesterdayWIB.setHours(0, 0, 0, 0);
    
    const yesterdayStr = yesterdayWIB.toISOString().split("T")[0];
    const yesterdayDate = new Date(yesterdayStr);

    // Query hourly summaries for yesterday in WIB (00:00 - 23:59 WIB)
    const startOfDayWIB = new Date(yesterdayWIB);
    startOfDayWIB.setHours(0, 0, 0, 0);
    const endOfDayWIB = new Date(yesterdayWIB);
    endOfDayWIB.setHours(23, 59, 59, 999);

    console.log(`📊 Daily summary for: ${yesterdayStr} (WIB)`);
    console.log(`   Query range: ${startOfDayWIB.toISOString()} to ${endOfDayWIB.toISOString()}`);

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
        // Query hourly summaries using WIB timestamps
        const hourly = await prisma.hourlySummary.findMany({
          where: {
            pondId: pond.id,
            timestamp: { gte: startOfDayWIB, lte: endOfDayWIB },
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
              // Convert WIB to UTC for ThingsBoard API
              const startUTC = wibToUTC(startOfDayWIB);
              const endUTC = wibToUTC(endOfDayWIB);
              
              const history = await thingsboardService.getTelemetryHistory(
                device.thingsboardDeviceId!,
                keys,
                startUTC.getTime(),
                endUTC.getTime(),
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
          `✅ Saved daily summary for pond ${pond.id} (${pond.name}) - ${dataPoints} data points for ${yesterdayStr} (WIB)`
        );

        try {
          // Cleanup hourly summaries using WIB timestamps
          const deletedCount = await prisma.hourlySummary.deleteMany({
            where: {
              pondId: pond.id,
              timestamp: { gte: startOfDayWIB, lte: endOfDayWIB },
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

// Save partial daily summary for TODAY (updated every 3 hours)
// This keeps the weekly chart showing current day data
export async function saveTodayPartialSummary() {
  try {
    console.log("📊 Updating today's partial daily summary (WIB)...");

    const nowWIB = getWIBDate();
    const todayStr = nowWIB.toISOString().split("T")[0];
    const todayDate = new Date(todayStr);

    // Query hourly summaries for today (00:00 WIB until now)
    const startOfDayWIB = new Date(nowWIB);
    startOfDayWIB.setHours(0, 0, 0, 0);

    console.log(`   Today: ${todayStr} (WIB)`);
    console.log(`   Query from: ${startOfDayWIB.toISOString()} to now`);

    const ponds = await prisma.pond.findMany({
      where: {
        devices: {
          some: {
            isActive: true,
            thingsboardDeviceId: { not: null },
          },
        },
      },
      select: { id: true, name: true },
    });

    for (const pond of ponds) {
      try {
        const hourly = await prisma.hourlySummary.findMany({
          where: {
            pondId: pond.id,
            timestamp: { gte: startOfDayWIB },
          },
          orderBy: { timestamp: "asc" },
        });

        if (hourly.length === 0) {
          console.log(`   ⏭️ No hourly data for pond ${pond.id} today`);
          continue;
        }

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

        const tempStats = {
          avg: weightedAverage(tItems),
          min: minFrom(tItems),
          max: maxFrom(tItems),
          count: tItems.reduce((a, b) => a + b.count, 0),
        };
        const phStats = {
          avg: weightedAverage(pItems),
          min: minFrom(pItems),
          max: maxFrom(pItems),
          count: pItems.reduce((a, b) => a + b.count, 0),
        };
        const doStats = {
          avg: weightedAverage(dItems),
          min: minFrom(dItems),
          max: maxFrom(dItems),
          count: dItems.reduce((a, b) => a + b.count, 0),
        };
        const salStats = {
          avg: weightedAverage(sItems),
          min: minFrom(sItems),
          max: maxFrom(sItems),
          count: sItems.reduce((a, b) => a + b.count, 0),
        };
        const turbStats = {
          avg: weightedAverage(tbItems),
          min: minFrom(tbItems),
          max: maxFrom(tbItems),
          count: tbItems.reduce((a, b) => a + b.count, 0),
        };

        const dataPoints = tempStats.count;

        await prisma.dailySummary.upsert({
          where: {
            pondId_date: {
              pondId: pond.id,
              date: todayDate,
            },
          },
          create: {
            pondId: pond.id,
            date: todayDate,
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
          `   ✅ Updated today's summary for pond ${pond.id} (${pond.name}) - ${hourly.length} hours, ${dataPoints} points`
        );
      } catch (error) {
        console.error(`   ❌ Error updating pond ${pond.id}:`, error);
      }
    }

    console.log("✨ Today's partial summary updated!");
  } catch (error) {
    console.error("🚨 Today's partial summary error:", error);
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
