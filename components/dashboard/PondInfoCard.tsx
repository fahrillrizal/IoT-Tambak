// components/dashboard/PondInfoCard.tsx
"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Activity, MapPin } from "lucide-react";
import type { SensorDevice } from "@/types/dashboard";

interface PondInfoCardProps {
  device: SensorDevice;
  location?: string;
}

export default function PondInfoCard({ 
  device, 
  location = "Pond A1" 
}: PondInfoCardProps) {
  return (
    <Card className="bg-white border border-gray-200">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-cyan-100 p-2">
            <Activity className="h-5 w-5 text-cyan-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">{device.name}</h3>
            <div className="flex items-center gap-1 text-sm text-gray-500">
              <MapPin className="h-3.5 w-3.5" />
              <span>{location}</span>
            </div>
          </div>
          <div className="ml-auto">
            <span
              className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                device.isOnline
                  ? "bg-green-100 text-green-700"
                  : "bg-red-100 text-red-700"
              }`}
            >
              {device.isOnline ? "Online" : "Offline"}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}