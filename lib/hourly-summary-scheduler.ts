import { prisma } from '@/lib/db';
import { thingsboardService } from '@/lib/thingsboard';

const KEYS = ['temperature', 'ph', 'dissolvedOxygen', 'salinity', 'turbidity'] as const;

function calcStats(values: number[]) {
  if (!values.length) return { avg: 0, min: 0, max: 0, count: 0 };
  const sum = values.reduce((a, b) => a + b, 0);
  return {
    avg: parseFloat((sum / values.length).toFixed(2)),
    min: Math.min(...values),
    max: Math.max(...values),
    count: values.length,
  };
}

export async function saveHourlySummaryForLastHour() {
  const now = new Date();
  const start = new Date(now);
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() - 1);

  const end = new Date(start);
  end.setMinutes(59, 59, 999);

  const windowLabel = `${start.toISOString()} - ${end.toISOString()}`;
  console.log(`🕐 Hourly summary window: ${windowLabel}`);

  const devices = await prisma.device.findMany({
    where: { isActive: true, thingsboardDeviceId: { not: null } },
    select: { id: true, thingsboardDeviceId: true, pondId: true },
  });

  for (const device of devices) {
    try {
      const history = await thingsboardService.getTelemetryHistory(
        device.thingsboardDeviceId!,
        KEYS as unknown as string[],
        start.getTime(),
        end.getTime(),
        2000
      );

      const buckets: Record<string, number[]> = {};
      KEYS.forEach((k) => (buckets[k] = []));

      for (const [key, values] of Object.entries(history)) {
        if (Array.isArray(values)) {
          for (const item of values) {
            buckets[key]?.push(parseFloat(item.value));
          }
        }
      }

      const temp = calcStats(buckets.temperature);
      const ph = calcStats(buckets.ph);
      const dox = calcStats(buckets.dissolvedOxygen);
      const sal = calcStats(buckets.salinity);
      const turb = calcStats(buckets.turbidity);

      await prisma.hourlySummary.upsert({
        where: { pondId_timestamp: { pondId: device.pondId, timestamp: start } },
        create: {
          pondId: device.pondId,
          timestamp: start,
          avgTemperature: temp.avg,
          minTemperature: temp.min,
          maxTemperature: temp.max,
          avgPh: ph.avg,
          minPh: ph.min,
          maxPh: ph.max,
          avgDissolvedOxygen: dox.avg,
          minDissolvedOxygen: dox.min,
          maxDissolvedOxygen: dox.max,
          avgSalinity: sal.avg,
          avgTurbidity: turb.avg,
          dataPoints: temp.count,
        },
        update: {
          avgTemperature: temp.avg,
          minTemperature: temp.min,
          maxTemperature: temp.max,
          avgPh: ph.avg,
          minPh: ph.min,
          maxPh: ph.max,
          avgDissolvedOxygen: dox.avg,
          minDissolvedOxygen: dox.min,
          maxDissolvedOxygen: dox.max,
          avgSalinity: sal.avg,
          avgTurbidity: turb.avg,
          dataPoints: temp.count,
        },
      });

      console.log(`✅ Hourly summary saved for pond ${device.pondId} (${start.toISOString()})`);
    } catch (error) {
      console.error(`❌ Hourly summary failed for device ${device.id}:`, error);
    }
  }
}
