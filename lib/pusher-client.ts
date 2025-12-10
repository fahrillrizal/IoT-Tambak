import PusherJS from 'pusher-js';

let pusherInstance: PusherJS | null = null;

export function getPusherClient(): PusherJS {
  if (!pusherInstance && typeof window !== 'undefined') {
    pusherInstance = new PusherJS(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
    });

    pusherInstance.connection.bind('connected', () => {
      console.log('✓ Pusher connected');
    });

    pusherInstance.connection.bind('error', (err: any) => {
      console.error('Pusher connection error:', err);
    });
  }
  return pusherInstance!;
}

// Interface untuk telemetry data
export interface TelemetryPayload {
  deviceId: string;
  temperature?: number;
  ph?: number;
  dissolvedOxygen?: number;
  salinity?: number;
  turbidity?: number;
  timestamp: number;
}

// Interface untuk summary update event
export interface SummaryUpdatePayload {
  type: 'hourly' | 'daily' | 'weekly';
  timestamp: number;
}

// Subscribe ke device telemetry
export function subscribeToDeviceTelemetry(
  deviceId: string,
  callback: (data: TelemetryPayload) => void
) {
  const pusher = getPusherClient();
  const channel = pusher.subscribe(`device-${deviceId}`);
  
  channel.bind('telemetry-update', (data: TelemetryPayload) => {
    console.log('📡 Pusher telemetry received:', data);
    callback(data);
  });
  
  return () => {
    channel.unbind('telemetry-update');
    channel.unsubscribe();
  };
}

// Subscribe ke global telemetry (semua device)
export function subscribeToGlobalTelemetry(callback: (data: TelemetryPayload) => void) {
  const pusher = getPusherClient();
  const channel = pusher.subscribe('global-telemetry');
  
  channel.bind('telemetry-update', (data: TelemetryPayload) => {
    console.log('📡 Pusher global telemetry:', data);
    callback(data);
  });
  
  return () => {
    channel.unbind('telemetry-update');
    channel.unsubscribe();
  };
}

// Subscribe ke summary updates (hourly, daily, weekly)
export function subscribeToSummaryUpdates(callback: (data: SummaryUpdatePayload) => void) {
  const pusher = getPusherClient();
  const channel = pusher.subscribe('global-telemetry');
  
  channel.bind('summary-updated', (data: SummaryUpdatePayload) => {
    console.log('📊 Summary updated:', data);
    callback(data);
  });
  
  return () => {
    channel.unbind('summary-updated');
    // Don't unsubscribe channel as it might be used by other listeners
  };
}

// Disconnect pusher
export function disconnectPusher() {
  if (pusherInstance) {
    pusherInstance.disconnect();
    pusherInstance = null;
  }
}
