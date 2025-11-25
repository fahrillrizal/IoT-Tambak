"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ReactNode } from "react";

export type ColorScheme = "blue" | "green" | "cyan" | "teal" | "yellow" | "red" | "purple";

interface SensorCardProps {
  title: string;
  value: string | number;
  unit?: string;
  status: string;
  icon: ReactNode;
  colorScheme: ColorScheme;
}

const COLOR_SCHEMES: Record<ColorScheme, { bg: string; border: string; text: string; icon: string }> = {
  blue: {
    bg: "bg-blue-50",
    border: "border-blue-100",
    text: "text-blue-600",
    icon: "text-blue-500",
  },
  green: {
    bg: "bg-green-50",
    border: "border-green-100",
    text: "text-green-600",
    icon: "text-green-500",
  },
  cyan: {
    bg: "bg-cyan-50",
    border: "border-cyan-100",
    text: "text-cyan-600",
    icon: "text-cyan-500",
  },
  teal: {
    bg: "bg-teal-50",
    border: "border-teal-100",
    text: "text-teal-600",
    icon: "text-teal-500",
  },
  yellow: {
    bg: "bg-yellow-50",
    border: "border-yellow-100",
    text: "text-yellow-600",
    icon: "text-yellow-600",
  },
  red: {
    bg: "bg-red-50",
    border: "border-red-100",
    text: "text-red-600",
    icon: "text-red-500",
  },
  purple: {
    bg: "bg-purple-50",
    border: "border-purple-100",
    text: "text-purple-600",
    icon: "text-purple-500",
  },
};

const STATUS_COLORS: Record<string, string> = {
  Normal: "text-green-600",
  Warning: "text-yellow-600",
  Critical: "text-red-600",
};

export default function SensorCard({
  title,
  value,
  unit = "",
  status,
  icon,
  colorScheme,
}: SensorCardProps) {
  const colors = COLOR_SCHEMES[colorScheme];
  const statusColor = STATUS_COLORS[status] || "text-gray-600";

  return (
    <Card className={`${colors.bg} border ${colors.border}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-gray-700">{title}</CardTitle>
          <div className={colors.icon}>{icon}</div>
        </div>
      </CardHeader>
      <CardContent>
        <div className={`text-3xl font-bold ${colors.text}`}>
          {value}{unit}
        </div>
        <p className={`text-xs mt-1 ${statusColor}`}>{status}</p>
      </CardContent>
    </Card>
  );
}