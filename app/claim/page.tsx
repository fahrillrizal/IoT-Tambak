"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ClaimSkeleton } from "@/components/skeletons/ClaimSkeleton";
import { AlertCircle, CheckCircle2, Loader2, QrCode } from "lucide-react";

interface Pond {
  id: number;
  name: string;
  _count: { devices: number };
}

interface DeviceInfo {
  id: number;
  name: string;
  deviceType: string;
  thingsboardDeviceId: string;
  pondId: number;
  pondName: string;
  message?: string;
}

function ClaimDevicePageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const deviceIdParam = searchParams.get("deviceId") || "";

  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [ponds, setPonds] = useState<Pond[]>([]);
  const [selectedPondId, setSelectedPondId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isExistingDevice, setIsExistingDevice] = useState(false);
  const [useSamePond, setUseSamePond] = useState(true); // Default: use same pond

  const deviceIdLabel = useMemo(() => {
    if (!deviceIdParam) return "(none)";
    return deviceIdParam;
  }, [deviceIdParam]);

  useEffect(() => {
    if (!deviceIdParam) {
      setError("Device ID not found in the QR code");
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const [deviceRes, pondsRes] = await Promise.all([
          fetch(`/api/devices/claim?deviceId=${encodeURIComponent(deviceIdParam)}`),
          fetch("/api/ponds"),
        ]);

        const deviceJson = await deviceRes.json();
        const pondsJson = await pondsRes.json();

        if (!deviceRes.ok) {
          if (deviceRes.status === 404) {
            throw new Error(
              "Device not found. Make sure you have scanned/added the device first via the Add Device menu."
            );
          }
          throw new Error(deviceJson.error || "Device not found");
        }

        if (!pondsRes.ok) {
          throw new Error(pondsJson.error || "Failed to fetch ponds");
        }

        setDevice(deviceJson.data);
        setIsExistingDevice(deviceJson.isExisting === true);
        setPonds(pondsJson.data || []);
        setSelectedPondId(
          deviceJson.data?.pondId?.toString() || pondsJson.data?.[0]?.id?.toString() || ""
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load claim page");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [deviceIdParam]);

  const handleAssign = async () => {
    if (!deviceIdParam) {
      setError("Device ID not available");
      return;
    }

    // Use device's pond if "same pond" is selected, otherwise use selected pond
    const pondIdToUse = useSamePond && device?.pondId ? device.pondId.toString() : selectedPondId;

    if (!pondIdToUse) {
      setError("Please select a pond first");
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      const response = await fetch("/api/devices/claim", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: deviceIdParam, pondId: pondIdToUse }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to assign device");
      }

      setDevice(data.data);
      setSuccess("Device assigned to the selected pond");
      setSelectedPondId(data.data.pondId?.toString() || selectedPondId);
      
      // Redirect to devices page after 2 seconds
      setTimeout(() => {
        router.push("/devices");
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <ClaimSkeleton />;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-8">
      <Card className="w-full max-w-xl shadow-lg border border-gray-200">
        <CardHeader className="flex items-start justify-between">
          <div>
            <CardTitle className="text-xl">Claim Device</CardTitle>
            <p className="text-sm text-gray-600 mt-1">
              Choose a pond to connect the device: use the same pond or pick another pond you own.
            </p>
          </div>
          <QrCode className="h-6 w-6 text-gray-400" />
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="space-y-4">
              <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 p-4 rounded">
                <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold mb-1">Error: {error}</p>
                  <p className="text-xs text-red-500 mt-2">
                    Solution: Go back to Devices and choose "Add Device" to scan/register the device first.
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  className="w-full"
                  onClick={() => router.push("/devices")}
                >
                  Back to Devices
                </Button>
              </div>
            </div>
          )}

          {!error && device && (
            <>
              <div className="bg-blue-50 border border-blue-100 p-3 rounded text-sm">
                <p className="text-blue-900 font-semibold">{device.name}</p>
                <p className="text-blue-800 text-xs mt-1">Type: {device.deviceType}</p>
                <p className="text-blue-800 text-xs mt-1 break-all">
                  Device ID: <code className="font-mono text-[11px]">{deviceIdLabel}</code>
                </p>
                {device.message && (
                  <p className="text-blue-800 text-xs mt-2 italic">{device.message}</p>
                )}
              </div>

              <div className="space-y-3">
                <p className="text-sm font-medium text-gray-700">Assign to Pond</p>
                
                {/* Option: Use same pond as device owner */}
                <label className="flex items-center gap-3 p-3 border border-gray-200 rounded cursor-pointer hover:bg-gray-50">
                  <input
                    type="radio"
                    name="pond-option"
                    checked={useSamePond}
                    onChange={() => setUseSamePond(true)}
                    className="w-4 h-4"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">Same pond</p>
                    <p className="text-xs text-gray-500">{device?.pondName}</p>
                  </div>
                </label>

                {/* Option: Choose different pond */}
                <label className="flex items-start gap-3 p-3 border border-gray-200 rounded cursor-pointer hover:bg-gray-50">
                  <input
                    type="radio"
                    name="pond-option"
                    checked={!useSamePond}
                    onChange={() => setUseSamePond(false)}
                    className="w-4 h-4 mt-1"
                  />
                  <div className="flex-1 space-y-2">
                    <p className="text-sm font-medium text-gray-900">Different pond</p>
                    {!useSamePond && ponds.length > 0 && (
                      <Select value={selectedPondId} onValueChange={setSelectedPondId}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select a pond" />
                        </SelectTrigger>
                        <SelectContent>
                          {ponds.map((pond) => (
                            <SelectItem key={pond.id} value={pond.id.toString()}>
                              {pond.name} ({pond._count.devices} device)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {!useSamePond && ponds.length === 0 && (
                      <p className="text-xs text-gray-500">No ponds yet. Add a pond first.</p>
                    )}
                  </div>
                </label>
              </div>

              {success && (
                <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 p-3 rounded">
                  <CheckCircle2 className="h-4 w-4" />
                  {success}
                </div>
              )}

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Button
                  variant="outline"
                  className="sm:w-auto"
                  onClick={() => router.push("/devices")}
                >
                  Back to Devices
                </Button>
              <Button
                className="sm:w-auto"
                onClick={handleAssign}
                disabled={!selectedPondId || saving}
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : isExistingDevice ? (
                  "Access Device"
                ) : (
                  "Assign to Pond"
                )}
              </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function ClaimDevicePage() {
  return (
    <Suspense fallback={<ClaimSkeleton />}>
      <ClaimDevicePageInner />
    </Suspense>
  );
}
