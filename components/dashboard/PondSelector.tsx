// components/dashboard/PondSelector.tsx
"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Wifi, WifiOff, ChevronDown, Loader2 } from "lucide-react";
import type { SensorDevice } from "@/types/dashboard";

interface PondSelectorProps {
  devices: SensorDevice[];
  selectedDevice: string;
  onDeviceChange: (value: string) => void;
  isLoading?: boolean;
}

export default function PondSelector({
  devices,
  selectedDevice,
  onDeviceChange,
  isLoading = false,
}: PondSelectorProps) {
  const currentDevice = devices.find((d) => d.deviceId === selectedDevice);
  
  // Filter devices dengan deviceId yang valid
  const validDevices = devices.filter((d) => d.deviceId && d.deviceId.trim() !== "");

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center gap-3 w-full sm:w-auto">
        <div className="w-full sm:w-[300px] bg-white border border-gray-200 rounded-md px-3 py-2.5 flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
          <span className="text-gray-400">Memuat perangkat...</span>
        </div>
      </div>
    );
  }

  // No devices state
  if (validDevices.length === 0) {
    return (
      <div className="flex items-center gap-3 w-full sm:w-auto">
        <div className="w-full sm:w-[300px] bg-yellow-50 border border-yellow-200 rounded-md px-3 py-2.5">
          <span className="text-yellow-700 text-sm">
            Belum ada perangkat terdaftar
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 w-full sm:w-auto">
      <Select value={selectedDevice} onValueChange={onDeviceChange}>
        <SelectTrigger
          className="w-full sm:w-[300px] bg-white border-gray-200"
          hideIcon
        >
          <div className="flex items-center justify-between w-full">
            <span className="text-gray-700 font-medium truncate">
              {currentDevice?.name || 'Pilih Perangkat'}
            </span>
            <div className="flex items-center gap-2 ml-3 shrink-0">
              {currentDevice?.isOnline ? (
                <Wifi className="h-4 w-4 text-green-500" />
              ) : (
                <WifiOff className="h-4 w-4 text-red-400" />
              )}
              {currentDevice && (currentDevice.notifications ?? 0) > 0 && (
                <span className="bg-blue-600 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-semibold">
                  {currentDevice.notifications}
                </span>
              )}
              <ChevronDown className="h-4 w-4 text-gray-400" />
            </div>
          </div>
        </SelectTrigger>
        <SelectContent className="w-full sm:w-[300px]">
          {validDevices.map((device) => (
            <SelectItem
              key={device.id}
              value={device.deviceId ?? ""}
              className="py-3"
            >
              <div className="flex items-center gap-3 w-full">
                {device.isOnline ? (
                  <Wifi className="h-5 w-5 text-green-500" />
                ) : (
                  <WifiOff className="h-5 w-5 text-red-400" />
                )}
                <div className="flex flex-col flex-1">
                  <span
                    className={
                      device.isOnline
                        ? "text-gray-700"
                        : "text-red-400"
                    }
                  >
                    {device.name}
                  </span>
                  <span className="text-xs text-gray-400">
                    {device.pondName}
                  </span>
                </div>
                {(device.notifications ?? 0) > 0 && (
                  <span className="bg-blue-600 text-white text-xs rounded-full min-w-5 h-5 px-1.5 flex items-center justify-center font-semibold">
                    {device.notifications ?? 0}
                  </span>
                )}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}