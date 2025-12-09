import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
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

    // Fetch alarms from ThingsBoard
    try {
      const alarms = await thingsboardService.getDeviceAlarms(deviceId);
      return NextResponse.json({ success: true, data: alarms });
    } catch (err) {
      return NextResponse.json({ error: 'Failed to fetch alarms', details: String(err) }, { status: 500 });
    }
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error', details: String(err) }, { status: 500 });
  }
}
