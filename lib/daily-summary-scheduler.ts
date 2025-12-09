import { prisma } from '@/lib/db';
import { thingsboardService } from '@/lib/thingsboard';

export async function saveDailySummaryForYesterday() {
  try {
    console.log('🕐 Starting daily summary save job...');

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    const devices = await prisma.device.findMany({
      where: {
        isActive: true,
        thingsboardDeviceId: { not: null },
      },
      select: {
        id: true,
        thingsboardDeviceId: true,
        pondId: true,
      },
    });

    console.log(`📊 Processing ${devices.length} devices for ${yesterdayStr}`);

    for (const device of devices) {
      try {
        const startOfDay = new Date(yesterday);
        startOfDay.setHours(0, 0, 0, 0);

        const endOfDay = new Date(yesterday);
        endOfDay.setHours(23, 59, 59, 999);

        const keys = ['temperature', 'ph', 'dissolvedOxygen', 'salinity', 'turbidity'];

        const history = await thingsboardService.getTelemetryHistory(
          device.thingsboardDeviceId!,
          keys,
          startOfDay.getTime(),
          endOfDay.getTime(),
          1000
        );

        const stats: Record<string, { values: number[] }> = {};
        for (const key of keys) {
          stats[key] = { values: [] };
        }

        for (const [key, values] of Object.entries(history)) {
          if (Array.isArray(values)) {
            for (const item of values) {
              if (stats[key]) {
                stats[key].values.push(parseFloat(item.value));
              }
            }
          }
        }

        const calculateStats = (values: number[]) => {
          if (values.length === 0) return { avg: 0, min: 0, max: 0 };
          const avg = values.reduce((a, b) => a + b) / values.length;
          const min = Math.min(...values);
          const max = Math.max(...values);
          return { avg: parseFloat(avg.toFixed(2)), min, max };
        };

        const tempStats = calculateStats(stats.temperature.values);
        const phStats = calculateStats(stats.ph.values);
        const doStats = calculateStats(stats.dissolvedOxygen.values);
        const salStats = calculateStats(stats.salinity.values);
        const turbStats = calculateStats(stats.turbidity.values);

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
            dataPoints: stats.temperature.values.length,
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
            dataPoints: stats.temperature.values.length,
          },
        });

        console.log(`✅ Saved summary for device ${device.id} (${device.thingsboardDeviceId})`);
      } catch (error) {
        console.error(`❌ Error processing device ${device.id}:`, error);
      }
    }

    console.log('✨ Daily summary save job completed!');
  } catch (error) {
    console.error('🚨 Daily summary scheduler error:', error);
  }
}
