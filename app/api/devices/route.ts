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
    
    if (!response || !response.data || response.data.length === 0) {
      // Return empty array jika tidak ada devices
      return NextResponse.json({
        success: true,
        data: [],
        total: 0,
      });
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
    console.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    
    // Return empty devices jika error
    return NextResponse.json({
      success: true,
      data: [],
      total: 0,
      error: error instanceof Error ? error.message : 'Failed to fetch devices',
    });
  }
}
