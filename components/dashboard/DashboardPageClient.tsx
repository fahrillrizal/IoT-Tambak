"use client";

import DashboardLayout from "@/components/layout/DashboardLayout";
import PondSelector from "@/components/dashboard/PondSelector";
import SensorCardsGrid from "@/components/dashboard/SensorCardsGrid";
import ChartsSection from "@/components/dashboard/ChartsSection";
import FeedingScheduleCard from "@/components/dashboard/FeedingScheduleCard";
import SetPasswordModal from "@/components/SetPasswordModal";
import { DashboardSkeleton } from "@/components/skeletons/DashboardSkeleton";
import { useAuth, useDeviceSelection, useSensorData, useFeedingSchedule, usePasswordCheck, useWeeklyChart } from "@/hooks/useDashboard";
import { Activity, MapPin } from "lucide-react";

interface DashboardPageClientProps {
  defaultCollapsed?: boolean;
}

export default function DashboardPageClient({ defaultCollapsed }: DashboardPageClientProps) {
  const { status } = useAuth();
  const { selectedDevice, setSelectedDevice, devices, currentDevice, totalNotifications, isLoading: devicesLoading } = useDeviceSelection();
  const { sensorData } = useSensorData(selectedDevice);
  const { schedules } = useFeedingSchedule();
  const { showModal, handlePasswordSet, handleClose } = usePasswordCheck();
  const { chartData: weeklyChartData } = useWeeklyChart(selectedDevice);

  if (status === "loading" || devicesLoading) {
    return (
      <DashboardLayout activeMenu="dashboard" defaultCollapsed={defaultCollapsed}>
        <DashboardSkeleton />
      </DashboardLayout>
    );
  }

  const hasDevices = devices.length > 0;

  return (
    <DashboardLayout activeMenu="dashboard" notificationCount={totalNotifications} defaultCollapsed={defaultCollapsed}>
      {/* Page Header with Device Selector */}
      <div className="mb-4 lg:mb-6 flex flex-col sm:flex-row items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl lg:text-3xl font-bold text-gray-900 mb-1">Dashboard</h2>
          <p className="text-sm lg:text-base text-gray-500">Monitoring harian tambak udang Anda</p>
        </div>
        <PondSelector devices={devices} selectedDevice={selectedDevice} onDeviceChange={setSelectedDevice} />
      </div>

      {/* Pond Selector Info Card */}
      {currentDevice && (
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
                  <span className="text-sm">{currentDevice.pondName}</span>
                </div>
                <div className="flex items-center gap-2">
                  {currentDevice.isOnline ? (
                    <span className="px-3 py-1 rounded-full bg-green-100 text-green-700 text-sm font-medium">Online</span>
                  ) : (
                    <span className="px-3 py-1 rounded-full bg-red-100 text-red-700 text-sm font-medium">Offline</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {hasDevices ? (
        <>
          {/* Sensor Cards */}
          <div className="mb-6 lg:mb-8">
            <SensorCardsGrid sensorData={sensorData} />
          </div>

          {/* Charts Section */}
          <div className="mb-6 lg:mb-8">
            <ChartsSection trendData={weeklyChartData} />
          </div>

          {/* Feeding Schedule */}
          <div className="mb-20 lg:mb-0">
            <FeedingScheduleCard schedules={schedules} />
          </div>
        </>
      ) : (
        <div className="mb-20 lg:mb-0">
          <div className="bg-white border border-dashed border-gray-300 rounded-lg p-6 text-center text-gray-600">
            <p className="text-lg font-semibold text-gray-800 mb-2">Belum ada perangkat</p>
            <p className="text-sm mb-2">Tambahkan perangkat terlebih dahulu atau Scan QR perangkat Anda.</p>
            <p className="text-xs text-gray-500">Tombol "Add Device" ada di bagian kanan atas.</p>
          </div>
        </div>
      )}

      <SetPasswordModal isOpen={showModal} onClose={handleClose} onSuccess={handlePasswordSet} />
    </DashboardLayout>
  );
}
