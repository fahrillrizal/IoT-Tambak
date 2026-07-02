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
  BatteryLow,
  BatteryWarning,
  Package,
  Calendar,
  Clock,
  CheckCircle2,
  Plus,
  Send,
  Bot,
  AlertTriangle,
  History,
  Loader2,
  XCircle,
  WifiOff,
} from "lucide-react";
import { useAuth, useDeviceSelection, useRealFeedingSchedule } from "@/hooks/useDashboard";
import {
  useFeederTelemetry,
  useManualFeeding,
  useFeedingHistory,
} from "@/hooks/useFeederTelemetry";

interface SmartFeederPageClientProps {
  defaultCollapsed?: boolean;
}

export default function SmartFeederPageClient({ defaultCollapsed }: SmartFeederPageClientProps) {
  const { status } = useAuth();
  const { selectedDevice, setSelectedDevice, devices, currentDevice, totalNotifications } = useDeviceSelection();
  const [manualAmount, setManualAmount] = useState("");
  const [showAddSchedule, setShowAddSchedule] = useState(false);
  const [newScheduleTime, setNewScheduleTime] = useState("");
  const [newScheduleAmount, setNewScheduleAmount] = useState("");
  const [scheduleAiFeedback, setScheduleAiFeedback] = useState<{
    adjusted: boolean;
    reason: string;
    water_quality: string;
    ai_feed_g: number;
    baseline_feed_g: number;
    warnings: string[];
    blocked?: boolean;
  } | null>(null);
  const [isScheduleSaving, setIsScheduleSaving] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmWarnings, setConfirmWarnings] = useState<string[]>([]);
  const [confirmSeverity, setConfirmSeverity] = useState<"warning" | "critical">("warning");

  // Real-time feeder telemetry (battery + sisaPakan)
  const { telemetry, feedStockPercent } = useFeederTelemetry(selectedDevice);

  // Device online status (from actual device heartbeat, not just Pusher connection)
  const isDeviceOnline = currentDevice?.isOnline ?? false;

  // Manual feeding RPC hook
  const { triggerFeed, isLoading: isFeedingLoading, result: feedResult, error: feedError, reset: resetFeed } = useManualFeeding();

  // Feeding history
  const pondId = currentDevice?.pondId;
  const { history, stats, isLoading: isHistoryLoading, refetch: refetchHistory } = useFeedingHistory(pondId);

  // Feeding schedules (real CRUD)
  const { schedules, addSchedule, deleteSchedule, isLoading: isScheduleLoading } = useRealFeedingSchedule(pondId);

  // Loading state
  if (status === "loading") {
    return (
      <DashboardLayout activeMenu="smart-feeder" defaultCollapsed={defaultCollapsed}>
        <SmartFeederSkeleton />
      </DashboardLayout>
    );
  }

  // Manual override feeding — with water quality pre-check
  const handleManualFeed = async () => {
    if (!manualAmount || !pondId) return;
    const amountGram = parseFloat(manualAmount);
    if (isNaN(amountGram) || amountGram <= 0) return;

    resetFeed();

    // Pre-check: evaluate current sensor data for warnings
    const warnings: string[] = [];
    let severity: "warning" | "critical" = "warning";

    // Use real-time sensor data from the useSensorData hook (already subscribed)
    // We check directly from telemetry values available via Pusher
    try {
      const res = await fetch(`/api/telemetry?deviceId=${selectedDevice}`);
      if (res.ok) {
        const result = await res.json();
        if (result.success && result.data) {
          const { temperature: t, ph: p, dissolvedOxygen: d, salinity: s, turbidity: tb } = result.data;

          // Critical checks
          if (t != null && (t < 24 || t > 32)) { warnings.push(`Temperature: ${t.toFixed(1)}°C (di luar batas aman)`); severity = "critical"; }
          if (p != null && (p < 6.0 || p > 8.5)) { warnings.push(`pH: ${p.toFixed(2)} (di luar batas aman)`); severity = "critical"; }
          if (d != null && d < 4.9) { warnings.push(`DO: ${d.toFixed(1)} mg/L (terlalu rendah)`); severity = "critical"; }
          if (s != null && (s < 8 || s > 35)) { warnings.push(`Salinity: ${s.toFixed(1)} ppt (di luar batas aman)`); severity = "critical"; }
          if (tb != null && tb > 40) { warnings.push(`Turbidity: ${tb.toFixed(1)} NTU (terlalu tinggi)`); severity = "critical"; }

          // Warning checks (only if no critical for that param)
          if (t != null && t >= 24 && t <= 32 && (t < 26 || t > 30)) warnings.push(`Temperature: ${t.toFixed(1)}°C (mendekati batas)`);
          if (p != null && p >= 6.0 && p <= 8.5 && (p < 7.0 || p > 8.0)) warnings.push(`pH: ${p.toFixed(2)} (mendekati batas)`);
          if (d != null && d >= 4.9 && d < 5.0) warnings.push(`DO: ${d.toFixed(1)} mg/L (mendekati batas)`);
          if (s != null && s >= 8 && s <= 35 && (s < 10 || s > 30)) warnings.push(`Salinity: ${s.toFixed(1)} ppt (mendekati batas)`);
          if (tb != null && tb <= 40 && tb > 25) warnings.push(`Turbidity: ${tb.toFixed(1)} NTU (mendekati batas)`);
        }
      }
    } catch {
      // If pre-check fails, proceed without confirmation
    }

    // If water quality has issues, show confirmation dialog
    if (warnings.length > 0) {
      setConfirmWarnings(warnings);
      setConfirmSeverity(severity);
      setShowConfirmDialog(true);
      return;
    }

    // No issues — send RPC directly
    await triggerFeed(pondId, amountGram);
    setManualAmount("");
    setTimeout(() => refetchHistory(), 2000);
  };

  // Confirmed manual feed (after user acknowledges warnings)
  const handleConfirmedFeed = async () => {
    if (!manualAmount || !pondId) return;
    const amountGram = parseFloat(manualAmount);
    if (isNaN(amountGram) || amountGram <= 0) return;

    setShowConfirmDialog(false);
    setConfirmWarnings([]);
    await triggerFeed(pondId, amountGram);
    setManualAmount("");
    setTimeout(() => refetchHistory(), 2000);
  };

  const handleCancelFeed = () => {
    setShowConfirmDialog(false);
    setConfirmWarnings([]);
  };

  // Battery display helpers
  const batteryValue = telemetry.battery;
  const batteryColor = batteryValue != null
    ? batteryValue > 50 ? "text-blue-600" : batteryValue > 20 ? "text-yellow-600" : "text-red-600"
    : "text-gray-400";
  const batteryBgColor = batteryValue != null
    ? batteryValue > 50 ? "bg-blue-50 border-blue-100" : batteryValue > 20 ? "bg-yellow-50 border-yellow-100" : "bg-red-50 border-red-100"
    : "bg-gray-50 border-gray-100";
  const BatteryIcon = batteryValue != null
    ? batteryValue > 50 ? Battery : batteryValue > 20 ? BatteryWarning : BatteryLow
    : Battery;

  // Feed stock helpers
  const feedStockColor = feedStockPercent != null
    ? feedStockPercent > 40 ? "text-yellow-600" : feedStockPercent > 15 ? "text-orange-600" : "text-red-600"
    : "text-gray-400";
  const feedStockBg = feedStockPercent != null
    ? feedStockPercent > 40 ? "bg-yellow-50 border-yellow-100" : feedStockPercent > 15 ? "bg-orange-50 border-orange-100" : "bg-red-50 border-red-100"
    : "bg-gray-50 border-gray-100";

  return (
    <DashboardLayout activeMenu="smart-feeder" notificationCount={totalNotifications} defaultCollapsed={defaultCollapsed}>
      <div className="mb-20 lg:mb-0">
        {/* Header */}
        <DashboardHeader
          title="Smart Feeder"
          subtitle="Control and monitor the automatic feeding system"
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
          {/* System Status */}
          <Card className={isDeviceOnline ? "bg-green-50 border-green-100" : "bg-gray-50 border-gray-200"}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                {isDeviceOnline ? (
                  <Zap className="h-8 w-8 text-green-600" />
                ) : (
                  <WifiOff className="h-8 w-8 text-gray-400" />
                )}
                <div>
                  <p className="text-sm text-gray-600">System Status</p>
                  <p className={`text-xl font-bold ${isDeviceOnline ? "text-green-600" : "text-gray-500"}`}>
                    {isDeviceOnline ? "Online" : "Offline"}
                  </p>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${isDeviceOnline ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-600"}`}>
                    {isDeviceOnline ? "Active" : "No Data"}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Battery Level (real-time) */}
          <Card className={batteryBgColor}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <BatteryIcon className={`h-8 w-8 ${batteryColor}`} />
                <div>
                  <p className="text-sm text-gray-600">Battery Level</p>
                  <p className={`text-xl font-bold ${batteryColor}`}>
                    {batteryValue != null ? `${batteryValue}%` : "—"}
                  </p>
                  {batteryValue != null && batteryValue <= 15 && (
                    <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">Low!</span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Feed Stock (real-time from sisaPakan) */}
          <Card className={feedStockBg}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Package className={`h-8 w-8 ${feedStockColor}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-600">Feed Stock</p>
                  <p className={`text-xl font-bold ${feedStockColor}`}>
                    {telemetry.sisaPakan != null
                      ? `${Math.round(telemetry.sisaPakan)} g`
                      : "—"}
                  </p>
                  {feedStockPercent != null && (
                    <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                      <div
                        className={`h-1.5 rounded-full transition-all ${
                          feedStockPercent > 40 ? "bg-yellow-600" : feedStockPercent > 15 ? "bg-orange-500" : "bg-red-500"
                        }`}
                        style={{ width: `${feedStockPercent}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Today's Total */}
          <Card className="bg-purple-50 border-purple-100">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Calendar className="h-8 w-8 text-purple-600" />
                <div>
                  <p className="text-sm text-gray-600">Today&apos;s Total</p>
                  <p className="text-xl font-bold text-purple-600">
                    {stats.todayTotalGram != null ? `${stats.todayTotalGram} g` : "0 g"}
                  </p>
                  <p className="text-xs text-gray-500">
                    {stats.todaySessions ?? 0} session{(stats.todaySessions ?? 0) !== 1 ? "s" : ""}
                    {stats.lastFeedingToday && (
                      <> &middot; Last: {new Date(stats.lastFeedingToday).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</>
                    )}
                  </p>
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
                Manual Override
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">
                    Feed Amount (gram)
                  </label>
                  <input
                    type="number"
                    value={manualAmount}
                    onChange={(e) => setManualAmount(e.target.value)}
                    placeholder="Enter amount in grams..."
                    min="1"
                    max="5000"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                    disabled={isFeedingLoading}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Sends a direct RPC command to the feeder device. AI validates water quality before dispensing.
                  </p>
                </div>
                <Button
                  onClick={handleManualFeed}
                  className="w-full bg-cyan-600 hover:bg-cyan-700"
                  disabled={isFeedingLoading || !manualAmount || !pondId}
                >
                  {isFeedingLoading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  {isFeedingLoading ? "Sending RPC..." : "Feed Now"}
                </Button>

                {/* AI auto-feeding info */}
                <div className="p-3 bg-purple-50 rounded-lg border border-purple-100">
                  <div className="flex items-start gap-2">
                    <Bot className="h-5 w-5 text-purple-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-purple-900">AI Auto-Feeding Active</p>
                      <p className="text-xs text-purple-700 mt-0.5">
                        The XGBoost model automatically triggers feeding based on water quality and shrimp growth data. No manual action needed.
                      </p>
                    </div>
                  </div>
                </div>

                {/* AI feedback after saving */}
                {scheduleAiFeedback && (
                  <div className={`mt-3 p-3 rounded-lg border text-xs ${
                    scheduleAiFeedback.blocked
                      ? "bg-red-50 border-red-200"
                      : scheduleAiFeedback.adjusted
                      ? "bg-yellow-50 border-yellow-200"
                      : "bg-green-50 border-green-200"
                  }`}>
                    <div className="flex items-start gap-2">
                      {scheduleAiFeedback.blocked ? (
                        <XCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                      ) : scheduleAiFeedback.adjusted ? (
                        <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                      )}
                      <div>
                        <p className={`font-medium ${scheduleAiFeedback.blocked ? "text-red-800" : scheduleAiFeedback.adjusted ? "text-yellow-800" : "text-green-800"}`}>
                          {scheduleAiFeedback.blocked
                            ? "Jadwal diblokir AI — kualitas air kritis"
                            : scheduleAiFeedback.adjusted
                            ? "Jumlah disesuaikan oleh AI"
                            : "AI: Jadwal disetujui"}
                        </p>
                        <p className="text-gray-600 mt-0.5">{scheduleAiFeedback.reason}</p>
                        {scheduleAiFeedback.baseline_feed_g > 0 && (
                          <p className="text-gray-500 mt-1">
                            Baseline per sesi: {scheduleAiFeedback.baseline_feed_g.toFixed(0)}g
                            {scheduleAiFeedback.ai_feed_g > 0 && <> &middot; AI rekomendasikan: {scheduleAiFeedback.ai_feed_g}g</>}
                            &middot; Kualitas air: {scheduleAiFeedback.water_quality}
                          </p>
                        )}
                        {scheduleAiFeedback.warnings.length > 0 && (
                          <ul className="mt-1 space-y-0.5">
                            {scheduleAiFeedback.warnings.map((w, i) => (
                              <li key={i} className="text-yellow-700">⚠ {w}</li>
                            ))}
                          </ul>
                        )}
                        {!scheduleAiFeedback.blocked && (
                          <button
                            onClick={() => { setScheduleAiFeedback(null); setShowAddSchedule(false); }}
                            className="mt-2 text-cyan-600 hover:underline"
                          >
                            Tutup
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Feedback after feeding */}
              {feedResult && (
                <div className={`mt-4 p-3 rounded-lg border ${
                  feedResult.success
                    ? "bg-green-50 border-green-200"
                    : "bg-red-50 border-red-200"
                }`}>
                  <div className="flex items-start gap-2">
                    {feedResult.success ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-600 mt-0.5" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className={`font-medium text-sm ${feedResult.success ? "text-green-800" : "text-red-800"}`}>
                        {feedResult.success ? "RPC Command Sent" : "Feeding Failed"}
                      </p>
                      <p className="text-xs text-gray-600 mt-0.5">
                        {feedResult.reason || feedResult.error || "Unknown error"}
                      </p>
                      {feedResult.success && (
                        <p className="text-xs text-gray-500 mt-1">
                          Amount: {feedResult.feed_amount_g}g
                          {feedResult.water_quality && feedResult.water_quality !== "unknown" && (
                            <> &middot; Water: {feedResult.water_quality}</>
                          )}
                          {feedResult.confidence > 0 && (
                            <> &middot; Confidence: {Math.round(feedResult.confidence * 100)}%</>
                          )}
                        </p>
                      )}
                      {feedResult.warnings && feedResult.warnings.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {feedResult.warnings.map((w, i) => (
                            <div key={i} className="flex items-start gap-1">
                              <AlertTriangle className="h-3.5 w-3.5 text-yellow-600 mt-0.5 flex-shrink-0" />
                              <p className="text-xs text-yellow-700">{w}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {feedError && !feedResult && (
                <div className="mt-4 p-3 rounded-lg border bg-red-50 border-red-200">
                  <div className="flex items-center gap-2">
                    <XCircle className="h-5 w-5 text-red-600" />
                    <p className="text-sm text-red-800">{feedError}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Schedule */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Clock className="h-5 w-5 text-cyan-600" />
                  Feeding Schedule
                  <span className="text-xs font-normal text-gray-500">(WIB)</span>
                </CardTitle>
                <Button variant="outline" size="sm" onClick={() => setShowAddSchedule(!showAddSchedule)}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {/* Add Schedule Form */}
              {showAddSchedule && (
                <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <p className="text-sm font-medium text-gray-700 mb-3">New Schedule (WIB timezone)</p>
                  <div className="flex gap-3 items-end">
                    <div className="flex-1">
                      <label className="text-xs text-gray-500 mb-1 block">Time (WIB)</label>
                      <input
                        type="time"
                        value={newScheduleTime}
                        onChange={(e) => setNewScheduleTime(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-xs text-gray-500 mb-1 block">Amount (gram)</label>
                      <input
                        type="number"
                        value={newScheduleAmount}
                        onChange={(e) => setNewScheduleAmount(e.target.value)}
                        placeholder="200"
                        min="1"
                        max="5000"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                      />
                    </div>
                    <Button
                      size="sm"
                      className="bg-cyan-600 hover:bg-cyan-700"
                      disabled={!newScheduleTime || !newScheduleAmount || isScheduleSaving}
                      onClick={async () => {
                        const amount = parseFloat(newScheduleAmount);
                        if (!newScheduleTime || isNaN(amount) || amount <= 0) return;
                        setIsScheduleSaving(true);
                        setScheduleAiFeedback(null);

                        const result = await addSchedule({ time: newScheduleTime, amount });

                        setIsScheduleSaving(false);

                        if (!result) return;

                        // Blocked by AI (critical water quality)
                        if (result.blocked) {
                          setScheduleAiFeedback({
                            adjusted: false,
                            reason: result.ai_recommendation?.reason ?? "AI blocked this schedule.",
                            water_quality: result.ai_recommendation?.water_quality ?? "critical",
                            ai_feed_g: 0,
                            baseline_feed_g: result.ai_recommendation?.baseline_feed_g ?? 0,
                            warnings: result.ai_recommendation?.warnings ?? [],
                            blocked: true,
                          });
                          return;
                        }

                        // Show AI feedback if available
                        if (result.ai_recommendation) {
                          setScheduleAiFeedback({
                            ...result.ai_recommendation,
                            blocked: false,
                          });
                        }

                        if (result.success) {
                          setNewScheduleTime("");
                          setNewScheduleAmount("");
                          // Don't close form so user sees AI feedback
                          if (!result.ai_recommendation) setShowAddSchedule(false);
                        }
                      }}
                    >
                      {isScheduleSaving ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : "Save"}
                    </Button>
                  </div>
                </div>
              )}

              {/* Schedule List */}
              {schedules.length === 0 && !isScheduleLoading ? (
                <p className="text-center text-gray-500 py-4 text-sm">No schedules configured yet.</p>
              ) : (
                <div className="space-y-3">
                  {schedules.map((schedule) => (
                    <div
                      key={schedule.id}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <CheckCircle2
                          className={`h-5 w-5 ${
                            schedule.status === "completed"
                              ? "text-green-500"
                              : schedule.status === "skipped"
                              ? "text-yellow-500"
                              : "text-gray-300"
                          }`}
                        />
                        <div>
                          <p className="font-medium text-gray-900">{schedule.time} WIB</p>
                          <p className="text-sm text-gray-500">{schedule.amount} g</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs px-2 py-1 rounded-full ${
                            schedule.status === "completed"
                              ? "bg-green-100 text-green-700"
                              : schedule.status === "skipped"
                              ? "bg-yellow-100 text-yellow-700"
                              : "bg-blue-100 text-blue-700"
                          }`}
                        >
                          {schedule.status === "completed" ? "Done" : schedule.status === "skipped" ? "Missed" : "Pending"}
                        </span>
                        <button
                          onClick={() => deleteSchedule(schedule.id)}
                          className="text-gray-400 hover:text-red-500 transition p-1"
                          title="Delete schedule"
                        >
                          <XCircle className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Feeding History */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <History className="h-5 w-5 text-cyan-600" />
                Feeding History
              </CardTitle>
              <Button variant="outline" size="sm" onClick={refetchHistory} disabled={isHistoryLoading}>
                {isHistoryLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Refresh"
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {history.length === 0 && !isHistoryLoading ? (
              <p className="text-center text-gray-500 py-6">No feeding history yet.</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {history.slice(0, 10).map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      {/* Type icon */}
                      {item.feedingType === "AI" ? (
                        <Bot className="h-5 w-5 text-purple-500" />
                      ) : item.feedingType === "MANUAL" ? (
                        <Send className="h-5 w-5 text-cyan-500" />
                      ) : (
                        <Clock className="h-5 w-5 text-gray-500" />
                      )}
                      <div>
                        <p className="font-medium text-gray-900 text-sm">
                          {item.amount} g
                          <span className="ml-2 text-xs text-gray-500">
                            ({item.feedingType})
                          </span>
                        </p>
                        <p className="text-xs text-gray-500">
                          {new Date(item.executedAt).toLocaleString("id-ID", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${
                        item.feedingStatus === "COMPLETED"
                          ? "bg-green-100 text-green-700"
                          : item.feedingStatus === "FAILED"
                          ? "bg-red-100 text-red-700"
                          : "bg-yellow-100 text-yellow-700"
                      }`}
                    >
                      {item.feedingStatus}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Statistics */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Feeding Statistics (7 days)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <p className="text-3xl font-bold text-cyan-600">{stats.totalSessions}</p>
                <p className="text-sm text-gray-600">Total Sessions</p>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <p className="text-3xl font-bold text-cyan-600">{stats.totalFeedKg} kg</p>
                <p className="text-sm text-gray-600">Total Feed</p>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <p className="text-3xl font-bold text-cyan-600">{stats.avgPerDay} g</p>
                <p className="text-sm text-gray-600">Avg/Day</p>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <p className={`text-3xl font-bold ${stats.successRate >= 90 ? "text-green-600" : stats.successRate >= 70 ? "text-yellow-600" : "text-red-600"}`}>
                  {stats.successRate}%
                </p>
                <p className="text-sm text-gray-600">Success Rate</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Water Quality Confirmation Dialog */}
      {showConfirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle className={`h-6 w-6 flex-shrink-0 mt-0.5 ${confirmSeverity === "critical" ? "text-red-600" : "text-yellow-600"}`} />
              <div>
                <h3 className={`font-bold text-lg ${confirmSeverity === "critical" ? "text-red-800" : "text-yellow-800"}`}>
                  {confirmSeverity === "critical" ? "Kondisi Air Kritis!" : "Peringatan Kualitas Air"}
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                  {confirmSeverity === "critical"
                    ? "Kualitas air dalam kondisi kritis. AI merekomendasikan untuk TIDAK memberi pakan saat ini. Lanjutkan?"
                    : "Beberapa parameter air mendekati batas. Yakin ingin memberi pakan?"}
                </p>
              </div>
            </div>

            <div className={`p-3 rounded-lg mb-4 ${confirmSeverity === "critical" ? "bg-red-50 border border-red-200" : "bg-yellow-50 border border-yellow-200"}`}>
              <p className="text-xs font-medium text-gray-700 mb-2">Parameter bermasalah:</p>
              <ul className="space-y-1">
                {confirmWarnings.map((w, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className={`text-xs mt-0.5 ${confirmSeverity === "critical" ? "text-red-500" : "text-yellow-500"}`}>&#x2022;</span>
                    <span className="text-xs text-gray-700">{w}</span>
                  </li>
                ))}
              </ul>
            </div>

            <p className="text-xs text-gray-500 mb-4">
              Amount: <span className="font-medium">{manualAmount}g</span> — Manual override akan tetap mengirim RPC ke device.
            </p>

            <div className="flex gap-3">
              <Button
                onClick={handleCancelFeed}
                variant="outline"
                className="flex-1"
              >
                Batal
              </Button>
              <Button
                onClick={handleConfirmedFeed}
                className={`flex-1 ${confirmSeverity === "critical" ? "bg-red-600 hover:bg-red-700" : "bg-yellow-600 hover:bg-yellow-700"}`}
              >
                {isFeedingLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Tetap Beri Pakan
              </Button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
