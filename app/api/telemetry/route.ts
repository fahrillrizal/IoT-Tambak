import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { thingsboardService } from '@/lib/thingsboard';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const deviceId = searchParams.get('deviceId');

    if (!deviceId) {
      return NextResponse.json(
        { error: 'Device ID is required' },
        { status: 400 }
      );
    }

    const keys = [
      'temperature',
      'ph',
      'dissolvedOxygen',
      'salinity',
      'turbidity',
    ];

    // Ambil data 24 jam terakhir untuk hitung rata-rata harian
    const endTs = Date.now();
    const startTs = endTs - 24 * 60 * 60 * 1000;

    const telemetryHistory = await thingsboardService.getTelemetryHistory(
      deviceId,
      keys,
      startTs,
      endTs,
      1000
    );

    // Hitung rata-rata dari data 24 jam terakhir
    const data = thingsboardService.calculateDailyAverage(telemetryHistory);

    let status: 'Normal' | 'Warning' | 'Critical' = 'Normal';
    
    const t = data.temperature;
    const p = data.ph;
    const d = data.dissolvedOxygen;
    const s = data.salinity;
    const tb = data.turbidity;

    if (
      (t !== undefined && (t < 26 || t > 32)) ||
      (p !== undefined && (p < 7.5 || p > 8.5)) ||
      (d !== undefined && (d < 4 || d > 8))
    ) {
      status = 'Critical';
    }
    else if (
      (s !== undefined && (s < 15 || s > 30)) ||
      (tb !== undefined && (tb < 10 || tb > 50))
    ) {
      status = 'Warning';
    }

    return NextResponse.json({
      success: true,
      data: {
        ...data,
        status,
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Telemetry fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch telemetry' },
      { status: 500 }
    );
  }
}