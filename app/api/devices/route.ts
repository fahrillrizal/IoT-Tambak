// app/api/devices/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { thingsboardService } from '@/lib/thingsboard';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Ambil semua devices dari ThingsBoard
    const response = await thingsboardService.getTenantDevices(100, 0);
    
    if (!response || !response.data) {
      return NextResponse.json(
        { error: 'No devices found' },
        { status: 404 }
      );
    }

    // Transform devices untuk UI
    const devices = await Promise.all(
      response.data.map(async (device: any) => {
        try {
          // Cek last activity untuk status online/offline
          const telemetry = await thingsboardService.getDeviceTelemetry(
            device.id.id,
            ['temperature']
          );
          
          const isOnline = telemetry && 
            Object.keys(telemetry).length > 0 &&
            Array.isArray(telemetry.temperature) &&
            telemetry.temperature.length > 0;

          return {
            id: device.id.id,
            name: device.name,
            deviceId: device.id.id,
            isOnline,
            notifications: 0, // Bisa diintegrasikan dengan alarm count
            label: device.label || '',
            type: device.type || 'default',
          };
        } catch (err) {
          // Jika gagal cek telemetry, anggap offline
          return {
            id: device.id.id,
            name: device.name,
            deviceId: device.id.id,
            isOnline: false,
            notifications: 0,
            label: device.label || '',
            type: device.type || 'default',
          };
        }
      })
    );

    return NextResponse.json({
      success: true,
      data: devices,
      total: response.totalElements || devices.length,
    });
  } catch (error) {
    console.error('Devices fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch devices' },
      { status: 500 }
    );
  }
}
