// components/dashboard/FeedingScheduleCard.tsx
"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Activity, CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import type { FeedingSchedule, FeedingStatus } from "@/types/dashboard";

interface FeedingScheduleCardProps {
  schedules: FeedingSchedule[];
  title?: string;
}

const STATUS_CONFIG: Record<FeedingStatus, { 
  icon: typeof CheckCircle2; 
  bgColor: string; 
  borderColor: string;
  iconColor: string;
  label: string;
}> = {
  completed: {
    icon: CheckCircle2,
    bgColor: "bg-green-50",
    borderColor: "border-green-200",
    iconColor: "text-green-600",
    label: "Selesai",
  },
  pending: {
    icon: Clock,
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200",
    iconColor: "text-blue-600",
    label: "Terjadwal",
  },
  skipped: {
    icon: AlertTriangle,
    bgColor: "bg-yellow-50",
    borderColor: "border-yellow-200",
    iconColor: "text-yellow-600",
    label: "Terlewat",
  },
};

export default function FeedingScheduleCard({ 
  schedules, 
  title = "Status Smart Feeder Hari Ini" 
}: FeedingScheduleCardProps) {
  return (
    <Card className="bg-white">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-blue-600" />
          <CardTitle className="text-base">{title}</CardTitle>
        </div>
        <CardDescription className="text-gray-500">
          Jadwal pemberian pakan otomatis
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {schedules.map((schedule, index) => {
            const config = STATUS_CONFIG[schedule.status];
            const Icon = config.icon;

            return (
              <div
                key={index}
                className={`p-4 rounded-lg border-2 ${config.bgColor} ${config.borderColor}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-gray-600" />
                    <span className="font-semibold text-gray-900">
                      {schedule.time}
                    </span>
                  </div>
                  <Icon className={`h-5 w-5 ${config.iconColor}`} />
                </div>
                <div className="text-2xl font-bold text-gray-900 mb-1">
                  {schedule.amount}kg
                </div>
                <div className="text-sm text-gray-600">
                  {config.label}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}