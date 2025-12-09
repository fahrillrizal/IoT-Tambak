// app/api/telemetry/save-daily-summary/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { thingsboardService } from '@/lib/thingsboard';

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { deviceId, date } = await request.json();

    if (!deviceId || !date) {
      return NextResponse.json(
        { error: 'deviceId and date are required' },
        { status: 400 }
      );
    }

    // Parse date untuk mendapatkan awal dan akhir hari
    const targetDate = new Date(date);
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const keys = ['temperature', 'ph', 'dissolvedOxygen', 'salinity', 'turbidity'];
    
    // Ambil data dari ThingsBoard untuk hari tersebut
    const history = await thingsboardService.getTelemetryHistory(
      deviceId,
      keys,
      startOfDay.getTime(),
      endOfDay.getTime(),
      1000
    );

    // Hitung min/max/avg untuk setiap parameter
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

    // Cari pond dari device
    const device = await prisma.device.findUnique({
      where: { thingsboardDeviceId: deviceId },
      select: { pondId: true },
    });

    if (!device) {
      return NextResponse.json(
        { error: 'Device not found' },
        { status: 404 }
      );
    }

    // Calculate averages, mins, maxs
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

    // Upsert daily summary
    const summary = await prisma.dailySummary.upsert({
      where: {
        pondId_date: {
          pondId: device.pondId,
          date: targetDate.toISOString().split('T')[0],
        },
      },
      create: {
        pondId: device.pondId,
        date: targetDate.toISOString().split('T')[0],
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

    return NextResponse.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    console.error('Save daily summary error:', error);
    return NextResponse.json(
      { error: 'Failed to save daily summary' },
      { status: 500 }
    );
  }
}
