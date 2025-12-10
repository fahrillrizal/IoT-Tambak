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

  const deviceIdLabel = useMemo(() => {
    if (!deviceIdParam) return "(tidak ada)";
    return deviceIdParam;
  }, [deviceIdParam]);

  useEffect(() => {
    if (!deviceIdParam) {
      setError("Device ID tidak ditemukan di QR");
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
              "Device tidak ditemukan. Pastikan Anda sudah scan/menambahkan device terlebih dahulu melalui menu Tambah Device."
            );
          }
          throw new Error(deviceJson.error || "Device tidak ditemukan");
        }

        if (!pondsRes.ok) {
          throw new Error(pondsJson.error || "Gagal mengambil data kolam");
        }

        setDevice(deviceJson.data);
        setIsExistingDevice(deviceJson.isExisting === true);
        setPonds(pondsJson.data || []);
        setSelectedPondId(
          deviceJson.data?.pondId?.toString() || pondsJson.data?.[0]?.id?.toString() || ""
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Gagal memuat halaman klaim");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [deviceIdParam]);

  const handleAssign = async () => {
    if (!deviceIdParam) {
      setError("Device ID tidak tersedia");
      return;
    }
    if (!selectedPondId) {
      setError("Pilih kolam terlebih dahulu");
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      const response = await fetch("/api/devices/claim", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: deviceIdParam, pondId: selectedPondId }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Gagal meng-assign device");
      }

      setDevice(data.data);
      setSuccess("Device berhasil diassign ke kolam yang dipilih");
      setSelectedPondId(data.data.pondId?.toString() || selectedPondId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan perubahan");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-8">
      <Card className="w-full max-w-xl shadow-lg border border-gray-200">
        <CardHeader className="flex items-start justify-between">
          <div>
            <CardTitle className="text-xl">Klaim Device</CardTitle>
            <p className="text-sm text-gray-600 mt-1">
              Scan QR akan membuka halaman ini. Pilih kolam untuk menghubungkan device.
            </p>
          </div>
          <QrCode className="h-6 w-6 text-gray-400" />
        </CardHeader>
        <CardContent className="space-y-4">
          {loading && (
            <div className="flex items-center gap-2 text-gray-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              Memuat data device...
            </div>
          )}

          {!loading && error && (
            <div className="space-y-4">
              <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 p-4 rounded">
                <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold mb-1">Error: {error}</p>
                  <p className="text-xs text-red-500 mt-2">
                    Solusi: Kembali ke halaman Devices dan pilih "Tambah Device" untuk scan/register device terlebih dahulu.
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  className="w-full"
                  onClick={() => router.push("/devices")}
                >
                  Kembali ke Devices
                </Button>
              </div>
            </div>
          )}

          {!loading && !error && device && (
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

              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700">Pilih Kolam</p>
                {ponds.length > 0 ? (
                  <Select value={selectedPondId} onValueChange={setSelectedPondId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih kolam" />
                    </SelectTrigger>
                    <SelectContent>
                      {ponds.map((pond) => (
                        <SelectItem key={pond.id} value={pond.id.toString()}>
                          {pond.name} ({pond._count.devices} device)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-sm text-gray-500">Belum ada kolam. Tambahkan kolam terlebih dahulu.</p>
                )}
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
                  Kembali ke Devices
                </Button>
              <Button
                className="sm:w-auto"
                onClick={handleAssign}
                disabled={!selectedPondId || saving}
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Menyimpan...
                  </>
                ) : isExistingDevice ? (
                  "Akses Device"
                ) : (
                  "Assign ke Kolam"
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
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-8">
          <Card className="w-full max-w-xl shadow-lg border border-gray-200">
            <CardHeader>
              <CardTitle className="text-xl">Memuat halaman klaim...</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center gap-2 text-gray-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              Mengambil data QR
            </CardContent>
          </Card>
        </div>
      }
    >
      <ClaimDevicePageInner />
    </Suspense>
  );
}
