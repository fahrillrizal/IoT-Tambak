export interface SensorDevice {
  id: number;
  name: string;
  deviceId?: string;
  thingsboardDeviceId: string;
  deviceToken: string;
  deviceType: string;
  isOnline: boolean;
  pondId: number;
  pondName: string;
  notifications?: number;
  createdAt: string;
  updatedAt: string;
}

export type FeedingStatus = 'completed' | 'pending' | 'skipped';

export interface TelemetryData {
  temperature: number | null;
  ph: number | null;
  dissolvedOxygen: number | null;
  salinity: number | null;
  turbidity: number | null;
  status: 'Normal' | 'Warning' | 'Critical' | 'Offline';
}

export interface SensorData {
  temperature: number;
  ph: number;
  dissolvedOxygen: number;
  salinity: number;
  turbidity: number;
  status: 'Normal' | 'Warning' | 'Critical' | 'Offline';
}

export interface WeeklyChartData {
  labels: string[];
  datasets: {
    label: string;
    data: (number | null)[];
    borderColor: string;
    backgroundColor: string;
    tension: number;
    fill: boolean;
    spanGaps: boolean;
  }[];
}

export interface ChartData {
  labels: string[];
  datasets: {
    label: string;
    data: number[];
    borderColor: string;
    backgroundColor: string;
    tension: number;
    fill: boolean;
    borderRadius?: number;
  }[];
}

export interface FeedingSchedule {
  id: number;
  time: string;
  amount: number;
  isActive: boolean;
  status: FeedingStatus;
}

export interface ActivityLog {
  id: string;
  date: string;
  time: string;
  type: 'alert' | 'reading' | 'maintenance' | 'info';
  message: string;
  severity: 'high' | 'medium' | 'normal' | 'info';
}

export interface Alert {
  id: string;
  type: 'warning' | 'critical' | 'info';
  message: string;
  timestamp: string;
  parameter?: string;
  value?: number;
}