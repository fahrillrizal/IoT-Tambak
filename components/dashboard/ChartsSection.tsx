"use client";

import TrendChart from "./TrendChart";
import FeedingChart from "./FeedingChart";
import type { ChartData } from "@/types/dashboard";

interface ChartsSectionProps {
  trendData?: ChartData;
  feedingData?: ChartData;
}

export default function ChartsSection({ trendData, feedingData }: ChartsSectionProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <TrendChart data={trendData} />
      <FeedingChart data={feedingData} />
    </div>
  );
}