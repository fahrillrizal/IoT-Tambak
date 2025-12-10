// lib/pusher.ts (Server-side)
import Pusher from 'pusher';

export const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID!,
  key: process.env.NEXT_PUBLIC_PUSHER_KEY!,
  secret: process.env.PUSHER_SECRET!,
  cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
  useTLS: true,
});

// Helper function untuk trigger telemetry update
export async function triggerTelemetryUpdate(deviceId: string, data: any) {
  try {
    const payload = {
      deviceId,
      ...data,
      timestamp: Date.now(),
    };
    
    // Send to device-specific channel
    await pusher.trigger(`device-${deviceId}`, 'telemetry-update', payload);
    
    // Also broadcast to global channel
    await pusher.trigger('global-telemetry', 'telemetry-update', payload);
    
    console.log(`✓ Pusher: Sent telemetry for device ${deviceId}`);
  } catch (error) {
    console.error('Pusher trigger error:', error);
  }
}

// Helper untuk broadcast ke semua devices
export async function broadcastTelemetry(data: any) {
  try {
    await pusher.trigger('global-telemetry', 'telemetry-update', {
      ...data,
      timestamp: Date.now(),
    });
    console.log('✓ Pusher: Broadcast telemetry to all');
  } catch (error) {
    console.error('Pusher broadcast error:', error);
  }
}
