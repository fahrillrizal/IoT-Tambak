// app/api/alarms/route.ts
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
    const status = searchParams.get('status') as any;
    const limit = parseInt(searchParams.get('limit') || '10');

    if (!deviceId) {
      return NextResponse.json(
        { error: 'Device ID is required' },
        { status: 400 }
      );
    }

    const alarms = await thingsboardService.getDeviceAlarms(deviceId, {
      status,
      limit,
    });

    // Transform alarms
    const transformedAlarms = (alarms.data || []).map((alarm: any) => ({
      id: alarm.id.id,
      type: alarm.type,
      severity: alarm.severity,
      status: alarm.status,
      message: alarm.details?.message || '',
      createdTime: alarm.createdTime,
      ackTime: alarm.ackTs,
      clearTime: alarm.clearTs,
      originator: alarm.originator,
    }));

    return NextResponse.json({
      success: true,
      data: transformedAlarms,
      total: alarms.totalElements || 0,
    });
  } catch (error) {
    console.error('Alarms fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch alarms' },
      { status: 500 }
    );
  }
}

// POST - Acknowledge or Clear alarm
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { alarmId, action } = body;

    if (!alarmId || !action) {
      return NextResponse.json(
        { error: 'Alarm ID and action are required' },
        { status: 400 }
      );
    }

    if (action === 'ack') {
      await thingsboardService.acknowledgeAlarm(alarmId);
    } else if (action === 'clear') {
      await thingsboardService.clearAlarm(alarmId);
    } else {
      return NextResponse.json(
        { error: 'Invalid action. Use "ack" or "clear"' },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Alarm action error:', error);
    return NextResponse.json(
      { error: 'Failed to process alarm action' },
      { status: 500 }
    );
  }
}