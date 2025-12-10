import { prisma } from '@/lib/db';
import { thingsboardService } from '@/lib/thingsboard';

const KEYS = ['temperature', 'ph', 'dissolvedOxygen', 'salinity', 'turbidity'] as const;

// Retention period: Hapus hourly data setelah 7 hari (sudah di-aggregate ke daily)
const HOURLY_RETENTION_DAYS = 7;

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

// Cleanup hourly summaries older than retention period
export async function cleanupOldHourlySummaries() {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - HOURLY_RETENTION_DAYS);
  cutoffDate.setHours(0, 0, 0, 0);

  try {
    const result = await prisma.hourlySummary.deleteMany({
      where: {
        timestamp: {
          lt: cutoffDate,
        },
      },
    });

    if (result.count > 0) {
      console.log(`🗑️ Cleaned up ${result.count} hourly summaries older than ${HOURLY_RETENTION_DAYS} days`);
    }

    return result.count;
  } catch (error) {
    console.error('Failed to cleanup hourly summaries:', error);
    return 0;
  }
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

  // Get all active ponds with their devices
  const ponds = await prisma.pond.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      devices: {
        where: { isActive: true, thingsboardDeviceId: { not: null } },
        select: { id: true, thingsboardDeviceId: true },
      },
    },
  });

  for (const pond of ponds) {
    if (pond.devices.length === 0) continue;

    try {
      // Aggregate data from ALL devices in this pond
      const allBuckets: Record<string, number[]> = {};
      KEYS.forEach((k) => (allBuckets[k] = []));

      for (const device of pond.devices) {
        try {
          const history = await thingsboardService.getTelemetryHistory(
            device.thingsboardDeviceId!,
            KEYS as unknown as string[],
            start.getTime(),
            end.getTime(),
            2000
          );

          for (const [key, values] of Object.entries(history)) {
            if (Array.isArray(values)) {
              for (const item of values) {
                allBuckets[key]?.push(parseFloat(item.value));
              }
            }
          }
        } catch (deviceError) {
          console.warn(`⚠️ Failed to fetch telemetry for device ${device.thingsboardDeviceId}:`, deviceError);
        }
      }

      // Calculate stats from combined data of all devices
      const temp = calcStats(allBuckets.temperature);
      const ph = calcStats(allBuckets.ph);
      const dox = calcStats(allBuckets.dissolvedOxygen);
      const sal = calcStats(allBuckets.salinity);
      const turb = calcStats(allBuckets.turbidity);

      if (temp.count === 0) {
        console.log(`⏭️ No data for pond ${pond.id} (${pond.name}), skipping...`);
        continue;
      }

      await prisma.hourlySummary.upsert({
        where: { pondId_timestamp: { pondId: pond.id, timestamp: start } },
        create: {
          pondId: pond.id,
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

      console.log(`✅ Hourly summary saved for pond ${pond.id} (${pond.name}) - ${pond.devices.length} devices, ${temp.count} data points`);
    } catch (error) {
      console.error(`❌ Hourly summary failed for pond ${pond.id}:`, error);
    }
  }
}
