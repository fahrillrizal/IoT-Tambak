import PusherJS from 'pusher-js';

let pusherInstance: PusherJS | null = null;

export function getPusherClient(): PusherJS {
  if (!pusherInstance) {
    pusherInstance = new PusherJS(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
    });
  }
  return pusherInstance;
}

// Hook untuk subscribe ke device telemetry
export function subscribeToDeviceTelemetry(
  deviceId: string,
  callback: (data: any) => void
) {
  const pusher = getPusherClient();
  const channel = pusher.subscribe(`device-${deviceId}`);
  
  channel.bind('telemetry-update', callback);
  
  return () => {
    channel.unbind('telemetry-update', callback);
    channel.unsubscribe();
  };
}

// Hook untuk subscribe ke global telemetry
export function subscribeToGlobalTelemetry(callback: (data: any) => void) {
  const pusher = getPusherClient();
  const channel = pusher.subscribe('global-telemetry');
  
  channel.bind('telemetry-update', callback);
  
  return () => {
    channel.unbind('telemetry-update', callback);
    channel.unsubscribe();
  };
}
