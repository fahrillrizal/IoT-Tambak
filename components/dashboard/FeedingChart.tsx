"use client";

import "@/lib/chartRegistry";
import { Bar } from "react-chartjs-2";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  FEEDING_CHART_DATA,
  FEEDING_CHART_OPTIONS,
} from "@/constants/dashboard";
import type { ChartData } from "@/types/dashboard";

interface FeedingChartProps {
  data?: ChartData;
  title?: string;
}

export default function FeedingChart({
  data = FEEDING_CHART_DATA,
  title = "Feeding Frequency",
}: FeedingChartProps) {
  return (
    <Card className="bg-white">
      <CardHeader>
        <CardTitle className="text-base">
          {title}
        </CardTitle>
        <CardDescription className="text-gray-500">
          Number of feedings per day
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Bar data={data} options={FEEDING_CHART_OPTIONS} />
      </CardContent>
    </Card>
  );
}
