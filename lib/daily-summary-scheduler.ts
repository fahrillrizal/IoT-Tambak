import { prisma } from '@/lib/db';
import { thingsboardService } from '@/lib/thingsboard';

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
    console.log('🕐 Starting daily summary save job...');

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    const startOfDay = new Date(yesterday);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(yesterday);
    endOfDay.setHours(23, 59, 59, 999);

    const devices = await prisma.device.findMany({
      where: { isActive: true, thingsboardDeviceId: { not: null } },
      select: { id: true, thingsboardDeviceId: true, pondId: true },
    });

    console.log(`📊 Processing ${devices.length} devices for ${yesterdayStr}`);

    for (const device of devices) {
      try {
        // 1) Gunakan hourly_summaries jika tersedia
        const hourly = await prisma.hourlySummary.findMany({
          where: {
            pondId: device.pondId,
            timestamp: { gte: startOfDay, lte: endOfDay },
          },
        });

        let tempStats: HourlyAgg;
        let phStats: HourlyAgg;
        let doStats: HourlyAgg;
        let salStats: HourlyAgg;
        let turbStats: HourlyAgg;
        let dataPoints = 0;

        if (hourly.length > 0) {
          const toAgg = (picker: (h: any) => HourlyAgg) => hourly.map(picker).filter((x) => x.count > 0);

          const tItems = toAgg((h) => ({ avg: Number(h.avgTemperature), min: Number(h.minTemperature), max: Number(h.maxTemperature), count: h.dataPoints }));
          const pItems = toAgg((h) => ({ avg: Number(h.avgPh), min: Number(h.minPh), max: Number(h.maxPh), count: h.dataPoints }));
          const dItems = toAgg((h) => ({ avg: Number(h.avgDissolvedOxygen), min: Number(h.minDissolvedOxygen), max: Number(h.maxDissolvedOxygen), count: h.dataPoints }));
          const sItems = toAgg((h) => ({ avg: Number(h.avgSalinity), min: Number(h.avgSalinity), max: Number(h.avgSalinity), count: h.dataPoints }));
          const tbItems = toAgg((h) => ({ avg: Number(h.avgTurbidity), min: Number(h.avgTurbidity), max: Number(h.avgTurbidity), count: h.dataPoints }));

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
          // 2) Fallback: langsung hitung dari ThingsBoard
          const keys = ['temperature', 'ph', 'dissolvedOxygen', 'salinity', 'turbidity'];
          const history = await thingsboardService.getTelemetryHistory(
            device.thingsboardDeviceId!,
            keys,
            startOfDay.getTime(),
            endOfDay.getTime(),
            2000
          );

          const stats: Record<string, number[]> = { temperature: [], ph: [], dissolvedOxygen: [], salinity: [], turbidity: [] };
          for (const [key, values] of Object.entries(history)) {
            if (Array.isArray(values)) {
              for (const item of values) {
                stats[key as keyof typeof stats].push(parseFloat(item.value));
              }
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

          tempStats = calc(stats.temperature);
          phStats = calc(stats.ph);
          doStats = calc(stats.dissolvedOxygen);
          salStats = calc(stats.salinity);
          turbStats = calc(stats.turbidity);
          dataPoints = tempStats.count;
        }

        await prisma.dailySummary.upsert({
          where: {
            pondId_date: {
              pondId: device.pondId,
              date: yesterdayStr,
            },
          },
          create: {
            pondId: device.pondId,
            date: yesterdayStr,
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

        console.log(`✅ Saved daily summary for pond ${device.pondId} (${device.thingsboardDeviceId})`);
      } catch (error) {
        console.error(`❌ Error processing device ${device.id}:`, error);
      }
    }

    console.log('✨ Daily summary save job completed!');
  } catch (error) {
    console.error('🚨 Daily summary scheduler error:', error);
  }
}
