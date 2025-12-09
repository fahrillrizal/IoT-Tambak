export interface SensorData {
  temperature: number;
  ph: number;
  dissolvedOxygen: number;
  salinity: number;
  turbidity: number;
  status: SensorStatus;
}

export type SensorStatus = "Normal" | "Warning" | "Critical";

export type FeedingStatus = "completed" | "pending" | "skipped";

export interface FeedingSchedule {
  time: string;
  amount: number;
  status: FeedingStatus;
}

export interface SensorDevice {
  id: number | string;
  name: string;
  deviceId: string;
  isOnline: boolean;
  notifications: number;
  label?: string;
  type?: string;
}

export interface ChartDataset {
  label: string;
  data: number[];
  borderColor: string;
  backgroundColor: string;
  tension?: number;
  fill?: boolean;
  borderRadius?: number;
}

export interface ChartData {
  labels: string[];
  datasets: ChartDataset[];
}

export interface ActivityLog {
  id: string;
  date: string;
  time: string;
  type: "alert" | "reading" | "maintenance";
  message: string;
  severity: "high" | "medium" | "normal" | "info";
}