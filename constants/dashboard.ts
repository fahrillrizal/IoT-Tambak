import type {
  SensorDevice,
  FeedingSchedule,
  SensorData,
  ChartData,
  ActivityLog,
} from "@/types/dashboard";

// Device ID akan diambil dari ThingsBoard API
// Ini hanya default fallback jika API gagal
export const SENSOR_DEVICES: SensorDevice[] = [
  { id: 1, name: "Sensor-1", deviceId: "", isOnline: true, notifications: 0 },
];

export const DEFAULT_SENSOR_DATA: SensorData = {
  temperature: 28.7,
  ph: 7.3,
  dissolvedOxygen: 6.9,
  salinity: 25.7,
  turbidity: 12.3,
  status: "Normal",
};

export const DEFAULT_FEEDING_SCHEDULES: FeedingSchedule[] = [
  { time: "06:00", amount: 2, status: "completed" },
  { time: "12:00", amount: 2.5, status: "completed" },
  { time: "18:00", amount: 2, status: "pending" },
  { time: "22:00", amount: 1.5, status: "pending" },
];

export const PARAMETER_THRESHOLDS = {
  temperature: { min: 26, max: 32 },
  ph: { min: 7.0, max: 8.5 },
  dissolvedOxygen: { min: 5.0 },
  salinity: { min: 15, max: 30 },
  turbidity: { max: 50 },
} as const;

export const WEEK_LABELS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

export const TREND_CHART_DATA: ChartData = {
  labels: WEEK_LABELS,
  datasets: [
    {
      label: "Suhu (°C)",
      data: [28.5, 28.2, 28.8, 28.3, 28.6, 28.4, 28.7],
      borderColor: "rgb(59, 130, 246)",
      backgroundColor: "transparent",
      tension: 0.4,
      fill: false,
    },
    {
      label: "pH",
      data: [7.2, 7.1, 7.3, 7.0, 7.2, 7.4, 7.3],
      borderColor: "rgb(234, 179, 8)",
      backgroundColor: "transparent",
      tension: 0.4,
      fill: false,
    },
    {
      label: "Oksigen (mg/L)",
      data: [7.1, 6.9, 7.2, 6.8, 7.0, 6.9, 6.9],
      borderColor: "rgb(16, 185, 129)",
      backgroundColor: "transparent",
      tension: 0.4,
      fill: false,
    },
    {
      label: "Salinitas (ppt)",
      data: [25.3, 25.8, 26.1, 25.9, 26.2, 25.6, 25.7],
      borderColor: "rgb(6, 182, 212)",
      backgroundColor: "transparent",
      tension: 0.4,
      fill: false,
    },
    {
      label: "Turbidity (NTU)",
      data: [11.8, 12.1, 11.5, 12.3, 12.0, 11.8, 12.3],
      borderColor: "rgb(245, 158, 11)",
      backgroundColor: "transparent",
      tension: 0.4,
      fill: false,
    },
  ],
};

export const FEEDING_CHART_DATA: ChartData = {
  labels: WEEK_LABELS,
  datasets: [
    {
      label: "Frekuensi Pemberian Pakan",
      data: [3, 4, 3, 4, 3, 4, 3],
      backgroundColor: "rgba(139, 92, 246, 0.8)",
      borderColor: "rgba(139, 92, 246, 0.8)",
      borderRadius: 8,
    },
  ],
};

export const TREND_CHART_OPTIONS = {
  responsive: true,
  maintainAspectRatio: true,
  interaction: {
    mode: "index" as const,
    intersect: false,
  },
  plugins: {
    legend: {
      position: "bottom" as const,
      labels: {
        usePointStyle: true,
        padding: 15,
      },
    },
  },
  scales: {
    y: {
      beginAtZero: false,
      grid: { color: "rgba(0, 0, 0, 0.05)" },
    },
    x: {
      grid: { display: false },
    },
  },
};

export const FEEDING_CHART_OPTIONS = {
  responsive: true,
  maintainAspectRatio: true,
  plugins: {
    legend: { display: false },
  },
  scales: {
    y: {
      beginAtZero: true,
      ticks: { stepSize: 1 },
      grid: { color: "rgba(0, 0, 0, 0.05)" },
    },
    x: {
      grid: { display: false },
    },
  },
};

export const SAMPLE_ACTIVITY_LOGS: ActivityLog[] = [
  {
    id: "1",
    date: "7/8/2024",
    time: "14:30",
    type: "alert",
    message: "Suhu tinggi: 32.5°C",
    severity: "high",
  },
  {
    id: "2",
    date: "7/8/2024",
    time: "12:15",
    type: "reading",
    message: "pH: 7.2, Suhu: 28.5°C, DO: 6.8mg/L, Salinitas: 25.7ppt",
    severity: "normal",
  },
  {
    id: "3",
    date: "7/8/2024",
    time: "10:30",
    type: "alert",
    message: "Salinitas rendah: 22.1ppt",
    severity: "medium",
  },
  {
    id: "4",
    date: "7/8/2024",
    time: "08:00",
    type: "maintenance",
    message: "Kalibrasi sensor pH",
    severity: "info",
  },
  {
    id: "5",
    date: "6/8/2024",
    time: "18:45",
    type: "alert",
    message: "DO rendah: 4.2mg/L",
    severity: "medium",
  },
  {
    id: "6",
    date: "6/8/2024",
    time: "09:30",
    type: "reading",
    message: "pH: 7.1, Suhu: 27.8°C, DO: 6.9mg/L, Salinitas: 26.1ppt",
    severity: "normal",
  },
];
