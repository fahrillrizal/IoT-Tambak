"use client";

import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/app/components/ui/select";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Line, Bar } from "react-chartjs-2";
import {
  Thermometer,
  Droplets,
  Wind,
  Activity,
  Eye,
  MapPin,
  LogOut,
  QrCode,
  Bell,
  Clock,
  AlertTriangle,
  CheckCircle2,
  LayoutDashboard,
  Zap,
  History,
  Wifi,
  WifiOff,
  ChevronDown,
  Filter,
  Menu,
  X,
} from "lucide-react";
import SetPasswordModal from "@/app/components/SetPasswordModal";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface SensorData {
  temperature: number;
  ph: number;
  dissolvedOxygen: number;
  salinity: number;
  turbidity: number;
  status: "Normal" | "Warning" | "Critical";
}

interface FeedingSchedule {
  time: string;
  amount: number;
  status: "completed" | "pending" | "skipped";
}

export default function Home() {
  const { data: session, status, update: updateSession } = useSession();
  const router = useRouter();
  const [selectedPond, setSelectedPond] = useState("Tambak A - Sensor 1");
  const [location, setLocation] = useState("Kolam A1");
  const [notificationCount, setNotificationCount] = useState(2);
  const [isOnline, setIsOnline] = useState(true);
  const [activeMenu, setActiveMenu] = useState("dashboard");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [showSetPasswordModal, setShowSetPasswordModal] = useState(false);

  // Check if OAuth user needs to set password
  useEffect(() => {
    const checkPassword = async () => {
      if (status === 'authenticated') {
        // Cek apakah sudah skip di session ini
        const skipped = sessionStorage.getItem('skippedSetPassword') === 'true';
        if (skipped) return;
        
        try {
          const res = await fetch('/api/settings/check-password');
          const data = await res.json();
          if (data.needsPassword === true) {
            setShowSetPasswordModal(true);
          }
        } catch (e) {
          console.error('Failed to check password status', e);
        }
      }
    };
    checkPassword();
  }, [status]);

  const handlePasswordSet = async () => {
    // Password sudah di-set, modal tidak muncul lagi
    setShowSetPasswordModal(false);
  };

  const sensorList = [
    { id: 1, name: "Tambak A - Sensor 1", isOnline: true, notifications: 2 },
    { id: 2, name: "Tambak A - Sensor 2", isOnline: true, notifications: 0 },
    { id: 3, name: "Tambak B - Sensor 1", isOnline: false, notifications: 1 },
    { id: 4, name: "Tambak B - Sensor 2", isOnline: true, notifications: 1 },
  ];

  const currentSensor =
    sensorList.find((s) => s.name === selectedPond) || sensorList[0];

  const [sensorData] = useState<SensorData>({
    temperature: 28.7,
    ph: 7.3,
    dissolvedOxygen: 6.9,
    salinity: 25.7,
    turbidity: 12.3,
    status: "Normal",
  });

  const [feedingSchedules] = useState<FeedingSchedule[]>([
    { time: "06:00", amount: 2, status: "completed" },
    { time: "12:00", amount: 2.5, status: "completed" },
    { time: "18:00", amount: 2, status: "pending" },
    { time: "22:00", amount: 1.5, status: "pending" },
  ]);

  const trendData = {
    labels: ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"],
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

  const feedingData = {
    labels: ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"],
    datasets: [
      {
        label: "Frekuensi Pemberian Pakan",
        data: [3, 4, 3, 4, 3, 4, 3],
        backgroundColor: "rgba(139, 92, 246, 0.8)",
        borderRadius: 8,
      },
    ],
  };

  const trendChartOptions = {
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
      tooltip: {
        backgroundColor: "rgba(255, 255, 255, 0.95)",
        titleColor: "#1f2937",
        bodyColor: "#4b5563",
        borderColor: "#e5e7eb",
        borderWidth: 1,
        padding: 12,
        displayColors: true,
        callbacks: {
          title: function (context: any) {
            return context[0].label;
          },
          label: function (context: any) {
            const label = context.dataset.label || "";
            const value = context.parsed.y;
            return `${label} : ${value}`;
          },
        },
      },
    },
    scales: {
      y: {
        beginAtZero: false,
        grid: {
          color: "rgba(0, 0, 0, 0.05)",
        },
      },
      x: {
        grid: {
          display: false,
        },
      },
    },
  };

  const feedingChartOptions = {
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        backgroundColor: "rgba(255, 255, 255, 0.95)",
        titleColor: "#1f2937",
        bodyColor: "#4b5563",
        borderColor: "#e5e7eb",
        borderWidth: 1,
        padding: 12,
        callbacks: {
          label: function (context: any) {
            return `feeding : ${context.parsed.y}`;
          },
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          stepSize: 1,
        },
        grid: {
          color: "rgba(0, 0, 0, 0.05)",
        },
      },
      x: {
        grid: {
          display: false,
        },
      },
    },
  };

  useEffect(() => {
    // Auto logout jika session null (token expired/invalid) atau status unauthenticated
    if (status === "unauthenticated" || (status === "authenticated" && !session)) {
      router.push("/login");
    }
  }, [status, session, router]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Memuat...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  const getSensorStatusColor = (value: number, type: string) => {
    switch (type) {
      case "temperature":
        return value >= 26 && value <= 32
          ? "text-green-600"
          : "text-yellow-600";
      case "ph":
        return value >= 7.0 && value <= 8.5
          ? "text-green-600"
          : "text-yellow-600";
      case "do":
        return value >= 5.0 ? "text-green-600" : "text-red-600";
      case "salinity":
        return value >= 15 && value <= 30
          ? "text-green-600"
          : "text-yellow-600";
      case "turbidity":
        return value <= 50 ? "text-green-600" : "text-yellow-600";
      default:
        return "text-gray-600";
    }
  };

  const getStatusBadge = (status: string) => {
    const badges = {
      Normal: "bg-green-100 text-green-700 border-green-200",
      Warning: "bg-yellow-100 text-yellow-700 border-yellow-200",
      Critical: "bg-red-100 text-red-700 border-red-200",
    };
    return badges[status as keyof typeof badges] || badges.Normal;
  };

  const getFeedingStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="h-5 w-5 text-green-600" />;
      case "pending":
        return <Clock className="h-5 w-5 text-blue-600" />;
      case "skipped":
        return <AlertTriangle className="h-5 w-5 text-yellow-600" />;
      default:
        return null;
    }
  };

  const getFeedingStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-50 border-green-200";
      case "pending":
        return "bg-blue-50 border-blue-200";
      case "skipped":
        return "bg-yellow-50 border-yellow-200";
      default:
        return "bg-gray-50 border-gray-200";
    }
  };

  const getFeedingStatusText = (status: string) => {
    switch (status) {
      case "completed":
        return "Selesai";
      case "pending":
        return "Terjadwal";
      case "skipped":
        return "Terlewat";
      default:
        return status;
    }
  };

  return (
    <>
      {/* Set Password Modal for OAuth users */}
      <SetPasswordModal
        isOpen={showSetPasswordModal}
        onClose={() => setShowSetPasswordModal(false)}
        onSuccess={handlePasswordSet}
      />

      <div className="min-h-screen bg-gray-50 flex">
        {/* Sidebar */}
        <div className={`${isSidebarCollapsed ? "w-20" : "w-64"} shrink-0`}>
          <aside
            className={`${isSidebarCollapsed ? "w-20" : "w-64"} bg-white border-r border-gray-200 ${isSidebarCollapsed ? "p-4" : "p-6"} flex flex-col transition-all duration-300 h-screen fixed left-0 top-0 overflow-y-auto`}
          >
            <div className="flex items-center gap-3 mb-8">
              <div
                className={`rounded-lg bg-blue-100 ${isSidebarCollapsed ? "p-2.5" : "p-2"}`}
              >
                <Activity
                  className={`${isSidebarCollapsed ? "h-5 w-5" : "h-5 w-5"} text-blue-600`}
                />
              </div>
              {!isSidebarCollapsed && (
                <h1 className="text-xl font-bold text-gray-900">IoT Tambak</h1>
              )}
            </div>

            <nav className="flex-1 space-y-2">
              <button
                onClick={() => setActiveMenu("dashboard")}
              className={`w-full flex items-center ${isSidebarCollapsed ? "justify-center" : "gap-3"} ${isSidebarCollapsed ? "px-3 py-3" : "px-4 py-3"} rounded-lg transition-colors ${
                activeMenu === "dashboard"
                  ? "bg-blue-100 text-blue-600"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
              title={isSidebarCollapsed ? "Dashboard" : ""}
            >
              <LayoutDashboard
                className={`${isSidebarCollapsed ? "h-5 w-5" : "h-5 w-5"}`}
              />
              {!isSidebarCollapsed && (
                <span className="font-medium">Dashboard</span>
              )}
            </button>

            <button
              onClick={() => setActiveMenu("smart-feeder")}
              className={`w-full flex items-center ${isSidebarCollapsed ? "justify-center" : "gap-3"} ${isSidebarCollapsed ? "px-3 py-3" : "px-4 py-3"} rounded-lg transition-colors ${
                activeMenu === "smart-feeder"
                  ? "bg-blue-100 text-blue-600"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
              title={isSidebarCollapsed ? "Smart Feeder" : ""}
            >
              <Zap
                className={`${isSidebarCollapsed ? "h-5 w-5" : "h-5 w-5"}`}
              />
              {!isSidebarCollapsed && (
                <span className="font-medium">Smart Feeder</span>
              )}
            </button>

            <button
              onClick={() => setActiveMenu("history")}
              className={`w-full flex items-center ${isSidebarCollapsed ? "justify-center" : "gap-3"} ${isSidebarCollapsed ? "px-3 py-3" : "px-4 py-3"} rounded-lg transition-colors ${
                activeMenu === "history"
                  ? "bg-blue-100 text-blue-600"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
              title={isSidebarCollapsed ? "History" : ""}
            >
              <History
                className={`${isSidebarCollapsed ? "h-5 w-5" : "h-5 w-5"}`}
              />
              {!isSidebarCollapsed && (
                <span className="font-medium">History</span>
              )}
            </button>
          </nav>

          {/* User Info at bottom */}
          <div className="mt-auto pt-6 border-t border-gray-200">
            <div
              onClick={() => router.push('/settings')}
              className={`flex cursor-pointer items-center ${isSidebarCollapsed ? "justify-center" : "gap-3"}`}
              title="Pengaturan Akun"
            >
              <div
                className={`${isSidebarCollapsed ? "w-10 h-10" : "w-10 h-10"} rounded-full overflow-hidden transition-all`}
                title={isSidebarCollapsed ? session?.user?.email || "User" : ""}
              >
                {session?.user?.image ? (
                  <img
                    src={session.user.image}
                    alt={session?.user?.email || "User"}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-blue-600 flex items-center justify-center">
                    <span
                      className={`text-white font-semibold ${isSidebarCollapsed ? "text-sm" : "text-sm"}`}
                    >
                      {session?.user?.email?.[0].toUpperCase()}
                    </span>
                  </div>
                )}
              </div>
              {!isSidebarCollapsed && (
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {session?.user?.email}
                  </p>
                  <p className="text-xs text-gray-500">
                    {session?.user?.username}
                  </p>
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 px-8 py-4 sticky top-0 z-20">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              className="hover:bg-gray-100 rounded-lg transition-colors"
            >
              <Menu className="h-5 w-5 text-gray-600" />
            </button>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" className="relative">
                <Bell className="h-5 w-5 text-gray-600" />
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  {notificationCount}
                </span>
              </Button>
              <Button variant="ghost" size="sm">
                <QrCode className="h-5 w-5 text-gray-600 mr-2" />
                Scan QR Device
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => signOut({ callbackUrl: "/login" })}
              >
                <LogOut className="h-5 w-5 text-gray-600 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-8 overflow-auto">
          {/* Dashboard Header with Dropdown */}
          <div className="mb-6 flex items-start justify-between">
            <div>
              <h2 className="text-3xl font-bold text-gray-900 mb-1">
                Dashboard
              </h2>
              <p className="text-gray-500">
                Monitoring harian tambak udang Anda
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Select value={selectedPond} onValueChange={setSelectedPond}>
                <SelectTrigger
                  className="w-[300px] bg-white border-gray-200"
                  hideIcon
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="text-gray-700 font-medium">
                      {selectedPond}
                    </span>
                    <div className="flex items-center gap-2 ml-3">
                      {currentSensor.isOnline ? (
                        <Wifi className="h-4 w-4 text-green-500" />
                      ) : (
                        <WifiOff className="h-4 w-4 text-red-400" />
                      )}
                      {currentSensor.notifications > 0 && (
                        <span className="bg-blue-600 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-semibold">
                          {currentSensor.notifications}
                        </span>
                      )}
                      <ChevronDown className="h-4 w-4 text-gray-400" />
                    </div>
                  </div>
                </SelectTrigger>
                <SelectContent className="w-[300px]">
                  {sensorList.map((sensor) => (
                    <SelectItem
                      key={sensor.id}
                      value={sensor.name}
                      className="py-3"
                    >
                      <div className="flex items-center gap-3 w-full">
                        {sensor.isOnline ? (
                          <Wifi className="h-5 w-5 text-green-500" />
                        ) : (
                          <WifiOff className="h-5 w-5 text-red-400" />
                        )}
                        <span
                          className={
                            sensor.isOnline
                              ? "text-gray-700 flex-1"
                              : "text-red-400 flex-1"
                          }
                        >
                          {sensor.name}
                        </span>
                        {sensor.notifications > 0 && (
                          <span className="bg-blue-600 text-white text-xs rounded-full min-w-5 h-5 px-1.5 flex items-center justify-center font-semibold">
                            {sensor.notifications}
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Pond Selector Card */}
          <Card className="mb-6 bg-white border-l-4 border-l-blue-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Activity className="h-5 w-5" />
                  <span className="text-gray-800 font-medium">
                    {selectedPond}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2 text-gray-600">
                    <MapPin className="h-4 w-4" />
                    <span className="text-sm">{location}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {currentSensor.isOnline ? (
                      <span className="px-3 py-1 rounded-full bg-green-100 text-green-700 text-sm font-medium">
                        Online
                      </span>
                    ) : (
                      <span className="px-3 py-1 rounded-full bg-red-100 text-red-700 text-sm font-medium">
                        Offline
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Sensor Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
            <Card className="bg-blue-50 border border-blue-100">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-gray-700">
                    Suhu Air
                  </CardTitle>
                  <Thermometer className="h-5 w-5 text-blue-500" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-blue-600">
                  {sensorData.temperature}°C
                </div>
                <p className="text-xs text-green-600 mt-1">Normal</p>
              </CardContent>
            </Card>

            <Card className="bg-green-50 border border-green-100">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-gray-700">
                    pH Air
                  </CardTitle>
                  <Droplets className="h-5 w-5 text-green-500" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-green-600">
                  {sensorData.ph}
                </div>
                <p className="text-xs text-green-600 mt-1">Normal</p>
              </CardContent>
            </Card>

            <Card className="bg-cyan-50 border border-cyan-100">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-gray-700">
                    Oksigen
                  </CardTitle>
                  <Eye className="h-5 w-5 text-cyan-500" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-cyan-600">
                  {sensorData.dissolvedOxygen} mg/L
                </div>
                <p className="text-xs text-green-600 mt-1">Normal</p>
              </CardContent>
            </Card>

            <Card className="bg-teal-50 border border-teal-100">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-gray-700">
                    Salinitas
                  </CardTitle>
                  <Wind className="h-5 w-5 text-teal-500" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-teal-600">
                  {sensorData.salinity} ppt
                </div>
                <p className="text-xs text-green-600 mt-1">Normal</p>
              </CardContent>
            </Card>

            <Card className="bg-yellow-50 border border-yellow-100">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-gray-700">
                    Turbidity
                  </CardTitle>
                  <Filter className="h-5 w-5 text-yellow-600" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-yellow-600">
                  {sensorData.turbidity} NTU
                </div>
                <p className="text-xs text-green-600 mt-1">Normal</p>
              </CardContent>
            </Card>
          </div>

          {/* Charts Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <Card className="bg-white">
              <CardHeader>
                <CardTitle className="text-base">
                  Tren Kualitas Air (7 Hari)
                </CardTitle>
                <CardDescription className="text-gray-500">
                  Monitoring parameter kualitas air
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Line data={trendData} options={trendChartOptions} />
              </CardContent>
            </Card>

            <Card className="bg-white">
              <CardHeader>
                <CardTitle className="text-base">
                  Frekuensi Pemberian Pakan
                </CardTitle>
                <CardDescription className="text-gray-500">
                  Jumlah pemberian pakan per hari
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Bar data={feedingData} options={feedingChartOptions} />
              </CardContent>
            </Card>
          </div>

          {/* Feeding Schedule */}
          <Card className="bg-white">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-blue-600" />
                <CardTitle className="text-base">
                  Status Smart Feeder Hari Ini
                </CardTitle>
              </div>
              <CardDescription className="text-gray-500">
                Jadwal pemberian pakan otomatis
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {feedingSchedules.map((schedule, index) => (
                  <div
                    key={index}
                    className={`p-4 rounded-lg border-2 ${getFeedingStatusColor(schedule.status)}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-gray-600" />
                        <span className="font-semibold text-gray-900">
                          {schedule.time}
                        </span>
                      </div>
                      {getFeedingStatusIcon(schedule.status)}
                    </div>
                    <div className="text-2xl font-bold text-gray-900 mb-1">
                      {schedule.amount}kg
                    </div>
                    <div className="text-sm text-gray-600">
                      {getFeedingStatusText(schedule.status)}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
    </>
  );
}
