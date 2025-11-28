"use client";

import { useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import DashboardHeader from "@/components/dashboard/DashboardHeader";
import PondSelector from "@/components/dashboard/PondSelector";
import { HistorySkeleton } from "@/components/skeletons/HistorySkeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Activity, Calendar, Database, AlertTriangle, Wrench, ChevronDown } from "lucide-react";
import { useAuth, useDeviceSelection } from "@/hooks/useDashboard";
import { SAMPLE_ACTIVITY_LOGS } from "@/constants/dashboard";

const SEVERITY_STYLES = {
  high: "bg-red-100 text-red-700",
  medium: "bg-yellow-100 text-yellow-700",
  normal: "bg-green-100 text-green-700",
  info: "bg-blue-100 text-blue-700",
};

const TYPE_ICONS = {
  alert: AlertTriangle,
  reading: Activity,
  maintenance: Wrench,
};

interface HistoryPageClientProps {
  defaultCollapsed?: boolean;
}

export default function HistoryPageClient({ defaultCollapsed }: HistoryPageClientProps) {
  const { status } = useAuth();
  const { selectedDevice, setSelectedDevice, devices, totalNotifications } = useDeviceSelection();
  const [period, setPeriod] = useState("7days");
  const [filterType, setFilterType] = useState<string>("all");

  // Loading - tampilkan skeleton di dalam layout
  if (status === "loading") {
    return (
      <DashboardLayout activeMenu="history" defaultCollapsed={defaultCollapsed}>
        <HistorySkeleton />
      </DashboardLayout>
    );
  }

  const filteredLogs = filterType === "all" 
    ? SAMPLE_ACTIVITY_LOGS 
    : SAMPLE_ACTIVITY_LOGS.filter(log => log.type === filterType);

  return (
    <DashboardLayout activeMenu="history" notificationCount={totalNotifications} defaultCollapsed={defaultCollapsed}>
      <div className="mb-20 lg:mb-0">
        <DashboardHeader title="History Alat" subtitle="Riwayat lengkap aktivitas dan data monitoring alat IoT" />

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="flex-1">
            <label className="text-sm font-medium text-gray-700 mb-2 block">Perangkat</label>
            <PondSelector devices={devices} selectedDevice={selectedDevice} onDeviceChange={setSelectedDevice} />
          </div>
          <div className="w-full sm:w-48">
            <label className="text-sm font-medium text-gray-700 mb-2 block">Periode</label>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7days">7 Hari Terakhir</SelectItem>
                <SelectItem value="30days">30 Hari Terakhir</SelectItem>
                <SelectItem value="90days">90 Hari Terakhir</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card className="bg-white">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-cyan-100 rounded-lg"><Calendar className="h-5 w-5 text-cyan-600" /></div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">147</p>
                  <p className="text-sm text-gray-500">Hari Aktif</p>
                  <p className="text-xs text-gray-400">Sejak 15/1/2024</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg"><Database className="h-5 w-5 text-blue-600" /></div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">35,280</p>
                  <p className="text-sm text-gray-500">Total Data</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-yellow-100 rounded-lg"><AlertTriangle className="h-5 w-5 text-yellow-600" /></div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">23</p>
                  <p className="text-sm text-gray-500">Alert</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 rounded-lg"><Wrench className="h-5 w-5 text-purple-600" /></div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">3</p>
                  <p className="text-sm text-gray-500">Maintenance</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Activity Log */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <CardTitle className="text-lg">Riwayat Aktivitas</CardTitle>
              <div className="flex gap-2 flex-wrap">
                {["all", "alert", "reading", "maintenance"].map((type) => (
                  <Button
                    key={type}
                    variant={filterType === type ? "default" : "outline"}
                    size="sm"
                    onClick={() => setFilterType(type)}
                    className={filterType === type ? "bg-cyan-600 hover:bg-cyan-700" : ""}
                  >
                    {type === "all" ? "Semua" : type.charAt(0).toUpperCase() + type.slice(1)}
                  </Button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {filteredLogs.map((log) => {
                const Icon = TYPE_ICONS[log.type as keyof typeof TYPE_ICONS];
                return (
                  <div key={log.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className={`p-2 rounded-lg ${log.type === "alert" ? "bg-yellow-100" : log.type === "reading" ? "bg-blue-100" : "bg-purple-100"}`}>
                        <Icon className={`h-4 w-4 ${log.type === "alert" ? "text-yellow-600" : log.type === "reading" ? "text-blue-600" : "text-purple-600"}`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          <span>{log.date}</span><span>•</span><span>{log.time}</span>
                        </div>
                        <p className="font-medium text-gray-900">{log.message}</p>
                      </div>
                    </div>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${SEVERITY_STYLES[log.severity as keyof typeof SEVERITY_STYLES]}`}>
                      {log.severity === "high" ? "Tinggi" : log.severity === "medium" ? "Sedang" : log.severity === "normal" ? "Normal" : "Info"}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 text-center">
              <Button variant="outline" className="w-full sm:w-auto">
                <ChevronDown className="h-4 w-4 mr-2" />Muat Lebih Banyak
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
