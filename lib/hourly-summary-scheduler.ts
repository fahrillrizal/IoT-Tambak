import { prisma } from '@/lib/db';
import { thingsboardService } from '@/lib/thingsboard';

const KEYS = ['temperature', 'ph', 'dissolvedOxygen', 'salinity', 'turbidity'] as const;

// Retention period: Hapus hourly data setelah 7 hari (sudah di-aggregate ke daily)
const HOURLY_RETENTION_DAYS = 7;

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
  // Use WIB timezone (UTC+7)
  const nowWIB = getWIBDate();
  const startWIB = new Date(nowWIB);
  startWIB.setMinutes(0, 0, 0);
  startWIB.setHours(startWIB.getHours() - 1);

  const endWIB = new Date(startWIB);
  endWIB.setMinutes(59, 59, 999);

  // Convert to UTC for ThingsBoard API query
  const startUTC = wibToUTC(startWIB);
  const endUTC = wibToUTC(endWIB);

  const wibHour = startWIB.getHours().toString().padStart(2, '0');
  console.log(`🕐 Hourly summary for ${startWIB.toISOString().split('T')[0]} jam ${wibHour}:00 WIB`);
  console.log(`   ThingsBoard query: ${startUTC.toISOString()} - ${endUTC.toISOString()}`);

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
            startUTC.getTime(),
            endUTC.getTime(),
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

      const allZero = 
        temp.avg === 0 && temp.min === 0 && temp.max === 0 &&
        ph.avg === 0 && ph.min === 0 && ph.max === 0 &&
        dox.avg === 0 && dox.min === 0 && dox.max === 0 &&
        sal.avg === 0;

      if (allZero) {
        console.log(`⏭️ All zero values for pond ${pond.id} (${pond.name}), skipping to save storage...`);
        continue;
      }

      // Store timestamp in WIB for easier reading
      await prisma.hourlySummary.upsert({
        where: { pondId_timestamp: { pondId: pond.id, timestamp: startWIB } },
        create: {
          pondId: pond.id,
          timestamp: startWIB,
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

      console.log(`✅ Saved: pond ${pond.id} (${pond.name}) jam ${wibHour}:00 WIB - ${temp.count} data points`);
    } catch (error) {
      console.error(`❌ Hourly summary failed for pond ${pond.id}:`, error);
    }
  }
}
