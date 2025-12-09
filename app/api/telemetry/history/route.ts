// app/api/telemetry/history/route.ts
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
    const hours = parseInt(searchParams.get('hours') || '24');

    if (!deviceId) {
      return NextResponse.json(
        { error: 'Device ID is required' },
        { status: 400 }
      );
    }

    const keys = ['temperature', 'ph', 'dissolvedOxygen', 'salinity', 'turbidity'];
    const endTs = Date.now();
    const startTs = endTs - hours * 60 * 60 * 1000;

    const history = await thingsboardService.getTelemetryHistory(
      deviceId,
      keys,
      startTs,
      endTs,
      500
    );

    // Transform untuk chart
    const timestamps = new Set<number>();
    for (const values of Object.values(history)) {
      for (const v of values as any[]) {
        timestamps.add(v.ts);
      }
    }

    const sortedTimestamps = Array.from(timestamps).sort((a, b) => a - b);
    const chartData = sortedTimestamps.map((ts) => {
      const point: Record<string, any> = { timestamp: ts };
      for (const [key, values] of Object.entries(history)) {
        const match = (values as any[]).find((v) => v.ts === ts);
        if (match) {
          point[key] = parseFloat(match.value);
        }
      }
      return point;
    });

    return NextResponse.json({
      success: true,
      data: chartData,
      startTs,
      endTs,
    });
  } catch (error) {
    console.error('History fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch history' },
      { status: 500 }
    );
  }
}