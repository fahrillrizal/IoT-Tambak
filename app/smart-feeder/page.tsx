"use client";

import { useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import DashboardHeader from "@/components/dashboard/DashboardHeader";
import PondSelector from "@/components/dashboard/PondSelector";
import { SmartFeederSkeleton } from "@/components/skeletons/SmartFeederSkeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Zap, 
  Battery, 
  Package, 
  Calendar,
  Clock,
  CheckCircle2,
  Plus,
  Send
} from "lucide-react";
import { useAuth, useDeviceSelection, useFeedingSchedule } from "@/hooks/useDashboard";

export default function SmartFeederPage() {
  const { status } = useAuth();
  const { selectedDevice, setSelectedDevice, devices, totalNotifications } = useDeviceSelection();
  const { schedules } = useFeedingSchedule();
  const [manualAmount, setManualAmount] = useState("");

  // Loading state
  if (status === "loading") {
    return (
      <DashboardLayout activeMenu="smart-feeder">
        <SmartFeederSkeleton />
      </DashboardLayout>
    );
  }

  const handleManualFeed = () => {
    if (manualAmount) {
      console.log(`Manual feeding: ${manualAmount}kg`);
      setManualAmount("");
    }
  };

  return (
    <DashboardLayout activeMenu="smart-feeder" notificationCount={totalNotifications}>
      <div className="mb-20 lg:mb-0">
        {/* Header */}
        <DashboardHeader
          title="Smart Feeder"
          subtitle="Kontrol dan monitoring sistem pemberian pakan otomatis"
        />

        {/* Device Selector */}
        <div className="mb-6">
          <PondSelector
            devices={devices}
            selectedDevice={selectedDevice}
            onDeviceChange={setSelectedDevice}
          />
        </div>

        {/* Status Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card className="bg-green-50 border-green-100">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Zap className="h-8 w-8 text-green-600" />
              <div>
                <p className="text-sm text-gray-600">Status Sistem</p>
                <p className="text-xl font-bold text-green-600">Online</p>
                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Aktif</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-blue-50 border-blue-100">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Battery className="h-8 w-8 text-blue-600" />
              <div>
                <p className="text-sm text-gray-600">Level Baterai</p>
                <p className="text-xl font-bold text-blue-600">87%</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-yellow-50 border-yellow-100">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Package className="h-8 w-8 text-yellow-600" />
              <div>
                <p className="text-sm text-gray-600">Stok Pakan</p>
                <p className="text-xl font-bold text-yellow-600">65%</p>
                <div className="w-full bg-yellow-200 rounded-full h-1.5 mt-1">
                  <div className="bg-yellow-600 h-1.5 rounded-full" style={{ width: "65%" }}></div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-purple-50 border-purple-100">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Calendar className="h-8 w-8 text-purple-600" />
              <div>
                <p className="text-sm text-gray-600">Total Hari Ini</p>
                <p className="text-xl font-bold text-purple-600">6.5 kg</p>
                <p className="text-xs text-gray-500">Terakhir: 18:05</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Manual Control */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Send className="h-5 w-5 text-cyan-600" />
              Kontrol Manual
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">
                  Jumlah Pakan (kg)
                </label>
                <input
                  type="number"
                  value={manualAmount}
                  onChange={(e) => setManualAmount(e.target.value)}
                  placeholder="Masukkan jumlah..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                />
              </div>
              <Button 
                onClick={handleManualFeed}
                className="w-full bg-cyan-600 hover:bg-cyan-700"
              >
                <Send className="h-4 w-4 mr-2" />
                Beri Pakan Sekarang
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Schedule */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="h-5 w-5 text-cyan-600" />
                Jadwal Pemberian Pakan
              </CardTitle>
              <Button variant="outline" size="sm">
                <Plus className="h-4 w-4 mr-1" />
                Tambah
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {schedules.map((schedule, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <CheckCircle2
                      className={`h-5 w-5 ${
                        schedule.status === "completed"
                          ? "text-green-500"
                          : "text-gray-300"
                      }`}
                    />
                    <div>
                      <p className="font-medium text-gray-900">{schedule.time}</p>
                      <p className="text-sm text-gray-500">{schedule.amount}kg</p>
                    </div>
                  </div>
                  <span
                    className={`text-xs px-2 py-1 rounded-full ${
                      schedule.status === "completed"
                        ? "bg-green-100 text-green-700"
                        : "bg-yellow-100 text-yellow-700"
                    }`}
                  >
                    {schedule.status === "completed" ? "Selesai" : "Terjadwal"}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Statistics */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Statistik Pemberian Pakan</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <p className="text-3xl font-bold text-cyan-600">28</p>
              <p className="text-sm text-gray-600">Total Sesi</p>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <p className="text-3xl font-bold text-cyan-600">45.2kg</p>
              <p className="text-sm text-gray-600">Total Pakan</p>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <p className="text-3xl font-bold text-cyan-600">6.5kg</p>
              <p className="text-sm text-gray-600">Rata-rata/hari</p>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <p className="text-3xl font-bold text-green-600">98%</p>
              <p className="text-sm text-gray-600">Keberhasilan</p>
            </div>
          </div>
        </CardContent>
      </Card>
      </div>
    </DashboardLayout>
  );
}