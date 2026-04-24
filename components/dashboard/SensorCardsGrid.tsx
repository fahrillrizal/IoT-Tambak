// components/dashboard/SensorCardsGrid.tsx
"use client";

import { Thermometer, Droplets, Wind, Waves, Eye } from "lucide-react";
import SensorCard from "./SensorCard";
import type { TelemetryData } from "@/types/dashboard";
import { PARAMETER_THRESHOLDS } from "@/constants/dashboard";

interface SensorCardsGridProps {
  sensorData: TelemetryData;
}

function getStatus(value: number | null, param: keyof typeof PARAMETER_THRESHOLDS): string {
  if (value === null || value === undefined) return "Warning";

  switch (param) {
    case "temperature":
      if (value < 26 || value > 32) return "Critical";
      if (value < 27 || value > 31) return "Warning";
      return "Normal";
    case "ph":
      if (value < 7.5 || value > 8.5) return "Critical";
      if (value < 7.8 || value > 8.2) return "Warning";
      return "Normal";
    case "dissolvedOxygen":
      if (value < 4 || value > 8) return "Critical";
      if (value < 5 || value > 7.5) return "Warning";
      return "Normal";
    case "salinity":
      if (value < 10 || value > 35) return "Critical";
      if (value < 15 || value > 30) return "Warning";
      return "Normal";
    case "turbidity":
      if (value > 80) return "Critical";
      if (value > 50 || value < 10) return "Warning";
      return "Normal";
    default:
      return "Normal";
  }
}

export default function SensorCardsGrid({ sensorData }: SensorCardsGridProps) {
  const sensors = [
    {
      title: "Suhu Air",
      value: sensorData.temperature ?? "-",
      unit: "°C",
      status: getStatus(sensorData.temperature, "temperature"),
      icon: <Thermometer className="h-5 w-5" />,
      colorScheme: "blue" as const,
    },
    {
      title: "pH Air",
      value: sensorData.ph ?? "-",
      unit: "",
      status: getStatus(sensorData.ph, "ph"),
      icon: <Droplets className="h-5 w-5" />,
      colorScheme: "green" as const,
    },
    {
      title: "Oksigen Terlarut",
      value: sensorData.dissolvedOxygen ?? "-",
      unit: " mg/L",
      status: getStatus(sensorData.dissolvedOxygen, "dissolvedOxygen"),
      icon: <Wind className="h-5 w-5" />,
      colorScheme: "cyan" as const,
    },
    {
      title: "Salinitas",
      value: sensorData.salinity ?? "-",
      unit: " ppt",
      status: getStatus(sensorData.salinity, "salinity"),
      icon: <Waves className="h-5 w-5" />,
      colorScheme: "teal" as const,
    },
    {
      title: "Turbidity",
      value: sensorData.turbidity ?? "-",
      unit: " NTU",
      status: getStatus(sensorData.turbidity, "turbidity"),
      icon: <Eye className="h-5 w-5" />,
      colorScheme: "yellow" as const,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      {sensors.map((sensor) => (
        <SensorCard key={sensor.title} {...sensor} />
      ))}
    </div>
  );
}