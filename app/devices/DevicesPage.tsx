"use client";

import { useState, useEffect } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { QRCodeDisplay } from "@/components/QRCodeDisplay";
import {
  AlertCircle,
  Loader2,
  QrCode as QrCodeIcon,
  Trash2,
  CheckCircle2,
  Edit2,
  X,
} from "lucide-react";

interface Device {
  id: number;
  name: string;
  deviceType: string;
  deviceId?: string;
  thingsboardDeviceId: string;
  pondId: number;
  pondName: string;
  isOnline: boolean;
  createdAt: string;
}

interface Pond {
  id: number;
  name: string;
  _count: { devices: number };
}

interface DevicesPageClientProps {
  defaultCollapsed?: boolean;
}

export default function DevicesPageClient({
  defaultCollapsed,
}: DevicesPageClientProps) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [ponds, setPonds] = useState<Pond[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDeviceId, setSelectedDeviceId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteSuccess, setDeleteSuccess] = useState<string | null>(null);
  const [editingDeviceId, setEditingDeviceId] = useState<number | null>(null);
  const [selectedPondId, setSelectedPondId] = useState<string>("");
  const [savingPond, setSavingPond] = useState(false);

  useEffect(() => {
    fetchDevices();
    fetchPonds();
  }, []);

  const fetchPonds = async () => {
    try {
      const response = await fetch("/api/ponds");
      const data = await response.json();
      if (data.success) {
        setPonds(data.data || []);
      }
    } catch (err) {
      console.error("Failed to fetch ponds:", err);
    }
  };

  const fetchDevices = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch("/api/devices");
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch devices");
      }

      setDevices(data.data || []);

      if ((data.data || []).length > 0 && !selectedDeviceId) {
        setSelectedDeviceId(data.data[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load devices");
      setDevices([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteDevice = async (deviceId: number, deviceName: string) => {
    if (!confirm(`Are you sure you want to delete "${deviceName}"?`)) {
      return;
    }

    try {
      setDeleting(true);
      const response = await fetch(`/api/devices/${deviceId}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to delete device");
      }

      setDevices(devices.filter((d) => d.id !== deviceId));
      setDeleteSuccess(`Device "${deviceName}" deleted successfully`);
      setSelectedDeviceId(null);

      setTimeout(() => setDeleteSuccess(null), 3000);

      await fetchDevices();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete device");
    } finally {
      setDeleting(false);
    }
  };

  const handleEditPond = (device: Device) => {
    setEditingDeviceId(device.id);
    setSelectedPondId(device.pondId.toString());
  };

  const handleSavePond = async (deviceId: number) => {
    if (!selectedPondId) {
      setError("Please select a pond");
      return;
    }

    try {
      setSavingPond(true);
      setError(null);

      const response = await fetch(`/api/devices/${deviceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pondId: parseInt(selectedPondId, 10) }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to update pond");
      }

      // Update local device
      setDevices(
        devices.map((d) =>
          d.id === deviceId
            ? {
                ...d,
                pondId: parseInt(selectedPondId, 10),
                pondName:
                  ponds.find((p) => p.id === parseInt(selectedPondId, 10))
                    ?.name || d.pondName,
              }
            : d
        )
      );

      setEditingDeviceId(null);
      setDeleteSuccess("Pond location updated successfully");
      setTimeout(() => setDeleteSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update pond");
    } finally {
      setSavingPond(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingDeviceId(null);
    setSelectedPondId("");
  };

  const selectedDevice = devices.find((d) => d.id === selectedDeviceId);
  const selectedTbId = selectedDevice?.thingsboardDeviceId || selectedDevice?.deviceId || "";

  return (
    <DashboardLayout activeMenu="devices" defaultCollapsed={defaultCollapsed}>
      <div className="mb-20 lg:mb-0">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Devices</h1>
          <p className="text-gray-600 mt-2">
            Manage your IoT devices and generate QR codes
          </p>
        </div>

        {deleteSuccess && (
          <div className="mb-4 flex items-center gap-2 text-sm text-green-600 bg-green-50 p-3 rounded border border-green-200">
            <CheckCircle2 className="h-4 w-4" />
            {deleteSuccess}
          </div>
        )}

        {error && (
          <div className="mb-4 flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded border border-red-200">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Devices List */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Your Devices</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                  </div>
                ) : devices.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-8">
                    No devices found. Start by scanning a device!
                  </p>
                ) : (
                  <div className="space-y-2">
                    {devices.map((device) => (
                      <button
                        key={device.id}
                        onClick={() => setSelectedDeviceId(device.id)}
                        className={`w-full text-left p-3 rounded-lg transition-colors border-2 ${
                          selectedDeviceId === device.id
                            ? "border-blue-500 bg-blue-50"
                            : "border-gray-200 hover:bg-gray-50"
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm text-gray-900">
                              {device.name}
                            </p>
                            <p className="text-xs text-gray-600 mt-1">
                              {device.deviceType}
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                              {device.pondName}
                            </p>
                          </div>
                          <div
                            className={`ml-2 h-2 w-2 rounded-full shrink-0 ${
                              device.isOnline ? "bg-green-500" : "bg-gray-400"
                            }`}
                            title={device.isOnline ? "Online" : "Offline"}
                          />
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* QR Code Display */}
          <div className="lg:col-span-2">
            {selectedDevice ? (
              <div className="space-y-4">
                <QRCodeDisplay
                  deviceId={selectedTbId}
                  deviceName={selectedDevice.name}
                />

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Device Details</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <label className="text-sm font-medium text-gray-600">
                        Device Name
                      </label>
                      <p className="text-gray-900 font-semibold">
                        {selectedDevice.name}
                      </p>
                    </div>

                    <div>
                      <label className="text-sm font-medium text-gray-600">
                        Device Type
                      </label>
                      <p className="text-gray-900 font-semibold">
                        {selectedDevice.deviceType}
                      </p>
                    </div>

                    <div>
                      <label className="text-sm font-medium text-gray-600">
                        Pond
                      </label>
                      {editingDeviceId === selectedDevice.id ? (
                        <div className="mt-2 space-y-2">
                          <Select
                            value={selectedPondId}
                            onValueChange={setSelectedPondId}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select pond" />
                            </SelectTrigger>
                            <SelectContent>
                              {ponds.map((pond) => (
                                <SelectItem
                                  key={pond.id}
                                  value={pond.id.toString()}
                                >
                                  {pond.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => handleSavePond(selectedDevice.id)}
                              disabled={savingPond}
                              className="flex-1"
                            >
                              {savingPond ? (
                                <>
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  Saving...
                                </>
                              ) : (
                                "Save"
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={handleCancelEdit}
                              disabled={savingPond}
                              className="flex-1"
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between mt-2">
                          <p className="text-gray-900 font-semibold">
                            {selectedDevice.pondName}
                          </p>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEditPond(selectedDevice)}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="text-sm font-medium text-gray-600">
                        Status
                      </label>
                      <div className="flex items-center gap-2 mt-1">
                        <div
                          className={`h-2 w-2 rounded-full ${
                            selectedDevice.isOnline
                              ? "bg-green-500"
                              : "bg-gray-400"
                          }`}
                        />
                        <span className="text-gray-900 text-sm">
                          {selectedDevice.isOnline ? "Online" : "Offline"}
                        </span>
                      </div>
                    </div>

                    <div>
                      <label className="text-sm font-medium text-gray-600">
                        Device ID (ThingsBoard)
                      </label>
                      <div className="mt-1 bg-gray-100 p-2 rounded text-xs font-mono break-all">
                        {selectedTbId || "(tidak ada)"}
                      </div>
                    </div>

                    <div>
                      <label className="text-sm font-medium text-gray-600">
                        Created
                      </label>
                      <p className="text-gray-900">
                        {new Date(
                          selectedDevice.createdAt
                        ).toLocaleDateString()}
                      </p>
                    </div>

                    <div className="pt-4 border-t">
                      <Button
                        variant="destructive"
                        className="w-full"
                        onClick={() =>
                          handleDeleteDevice(
                            selectedDevice.id,
                            selectedDevice.name
                          )
                        }
                        disabled={deleting}
                      >
                        {deleting ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Deleting...
                          </>
                        ) : (
                          <>
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete Device
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <QrCodeIcon className="h-12 w-12 text-gray-300 mb-4" />
                  <p className="text-gray-500 text-center">
                    Select a device from the list to view its QR code and
                    details
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
