// components/dashboard/SensorCardsGrid.tsx
"use client";

import { Thermometer, Droplets, Wind, Waves, Eye } from "lucide-react";
import SensorCard from "./SensorCard";
import type { SensorData } from "@/types/dashboard";
import { PARAMETER_THRESHOLDS } from "@/constants/dashboard";

interface SensorCardsGridProps {
  sensorData: SensorData;
}

function getStatus(value: number, param: keyof typeof PARAMETER_THRESHOLDS): string {
  const threshold = PARAMETER_THRESHOLDS[param];

  if ("min" in threshold && "max" in threshold) {
    if (value < threshold.min || value > threshold.max) return "Warning";
    return "Normal";
  }
  if ("min" in threshold) {
    return value >= threshold.min ? "Normal" : "Warning";
  }
  if ("max" in threshold) {
    return value <= threshold.max ? "Normal" : "Warning";
  }
  return "Normal";
}

export default function SensorCardsGrid({ sensorData }: SensorCardsGridProps) {
  const sensors = [
    {
      title: "Suhu Air",
      value: sensorData.temperature,
      unit: "°C",
      status: getStatus(sensorData.temperature, "temperature"),
      icon: <Thermometer className="h-5 w-5" />,
      colorScheme: "blue" as const,
    },
    {
      title: "pH Air",
      value: sensorData.ph,
      unit: "",
      status: getStatus(sensorData.ph, "ph"),
      icon: <Droplets className="h-5 w-5" />,
      colorScheme: "green" as const,
    },
    {
      title: "Oksigen Terlarut",
      value: sensorData.dissolvedOxygen,
      unit: " mg/L",
      status: getStatus(sensorData.dissolvedOxygen, "dissolvedOxygen"),
      icon: <Wind className="h-5 w-5" />,
      colorScheme: "cyan" as const,
    },
    {
      title: "Salinitas",
      value: sensorData.salinity,
      unit: " ppt",
      status: getStatus(sensorData.salinity, "salinity"),
      icon: <Waves className="h-5 w-5" />,
      colorScheme: "teal" as const,
    },
    {
      title: "Turbidity",
      value: sensorData.turbidity,
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