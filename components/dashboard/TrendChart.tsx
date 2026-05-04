"use client";

import "@/lib/chartRegistry";
import { Line } from "react-chartjs-2";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { TREND_CHART_DATA, TREND_CHART_OPTIONS } from "@/constants/dashboard";
import type { ChartData } from "@/types/dashboard";

interface TrendChartProps {
  data?: ChartData;
  title?: string;
}

export default function TrendChart({
  data = TREND_CHART_DATA,
  title = "Water Quality Trend (7 Days)",
}: TrendChartProps) {
  return (
    <Card className="bg-white">
      <CardHeader>
        <CardTitle className="text-base">
          {title}
        </CardTitle>
        <CardDescription className="text-gray-500">
          Water quality parameter monitoring
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Line data={data} options={TREND_CHART_OPTIONS} />
      </CardContent>
    </Card>
  );
}
