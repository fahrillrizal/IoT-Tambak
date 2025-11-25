"use client";

import DashboardLayout from "@/components/layout/DashboardLayout";
import PondSelector from "@/components/dashboard/PondSelector";
import SensorCardsGrid from "@/components/dashboard/SensorCardsGrid";
import ChartsSection from "@/components/dashboard/ChartsSection";
import FeedingScheduleCard from "@/components/dashboard/FeedingScheduleCard";
import { useAuth, useDeviceSelection, useSensorData, useFeedingSchedule } from "@/hooks/useDashboard";
import { Activity, MapPin } from "lucide-react";

export default function DashboardPage() {
  // Hooks
  const { status } = useAuth();
  const { selectedDevice, setSelectedDevice, devices, currentDevice, totalNotifications } = useDeviceSelection();
  const { sensorData } = useSensorData(selectedDevice);
  const { schedules } = useFeedingSchedule();

  // Loading state
  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="mt-4 text-gray-600">Memuat...</p>
        </div>
      </div>
    );
  }

  return (
    <DashboardLayout
      activeMenu="dashboard"
      notificationCount={totalNotifications}
    >
      {/* Page Header with Device Selector */}
      <div className="mb-4 lg:mb-6 flex flex-col sm:flex-row items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl lg:text-3xl font-bold text-gray-900 mb-1">Dashboard</h2>
          <p className="text-sm lg:text-base text-gray-500">Monitoring harian tambak udang Anda</p>
        </div>
        <PondSelector
          devices={devices}
          selectedDevice={selectedDevice}
          onDeviceChange={setSelectedDevice}
        />
      </div>

      {/* Pond Selector Info Card */}
      <div className="mb-4 lg:mb-6">
        <div className="bg-white border border-gray-200 border-l-4 border-l-blue-500 rounded-md p-3 lg:p-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Activity className="h-5 w-5" />
              <span className="text-gray-800 font-medium">{currentDevice.name}</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-gray-600">
                <MapPin className="h-4 w-4" />
                <span className="text-sm">Kolam A1</span>
              </div>
              <div className="flex items-center gap-2">
                {currentDevice.isOnline ? (
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
        </div>
      </div>

      {/* Sensor Cards */}
      <div className="mb-6 lg:mb-8">
        <SensorCardsGrid sensorData={sensorData} />
      </div>

      {/* Charts Section */}
      <div className="mb-6 lg:mb-8">
        <ChartsSection />
      </div>

      {/* Feeding Schedule */}
      <div className="mb-20 lg:mb-0">
        <FeedingScheduleCard schedules={schedules} />
      </div>
    </DashboardLayout>
  );
}