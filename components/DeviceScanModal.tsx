"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  X,
  Plus,
  Loader2,
  CheckCircle2,
  AlertCircle,
  QrCode as QrCodeIcon,
} from "lucide-react";
import { QRCodeDisplay } from "./QRCodeDisplay";

interface Pond {
  id: number;
  name: string;
  _count: {
    devices: number;
  };
}

interface DeviceScanModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Step = "input" | "pond-selection" | "pond-creation" | "success";

export function DeviceScanModal({ isOpen, onClose }: DeviceScanModalProps) {
  const [step, setStep] = useState<Step>("input");
  const [deviceName, setDeviceName] = useState("");
  const [deviceType, setDeviceType] = useState("SENSOR");
  const [ponds, setPonds] = useState<Pond[]>([]);
  const [selectedPondId, setSelectedPondId] = useState<string>("");
  const [newPondName, setNewPondName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scannedDevice, setScannedDevice] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch ponds on modal open
  useEffect(() => {
    if (isOpen) {
      fetchPonds();
    }
  }, [isOpen]);

  const fetchPonds = async () => {
    try {
      const response = await fetch("/api/ponds");
      const data = await response.json();
      if (data.success) {
        setPonds(data.data);
      }
    } catch (error) {
      console.error("Failed to fetch ponds:", error);
    }
  };

  const handleScanClick = () => {
    fileInputRef.current?.click();
  };

  const handleQRCodeScanned = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // For demo purposes, we'll just use the filename as device name
    // In production, you'd use a QR code scanning library
    const fileName = file.name.replace(/\.[^/.]+$/, "");
    setDeviceName(fileName);
    setStep("pond-selection");

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleCreateDevice = async () => {
    if (!deviceName.trim()) {
      setError("Device name is required");
      return;
    }

    if (!selectedPondId) {
      setError("Please select or create a pond");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/devices/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceName: deviceName.trim(),
          pondId: selectedPondId,
          deviceType,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to register device");
      }

      setScannedDevice(data.data);
      setStep("success");
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Failed to register device"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePond = async () => {
    if (!newPondName.trim()) {
      setError("Pond name is required");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/ponds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newPondName.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create pond");
      }

      // Add new pond to list and select it
      setPonds([...ponds, data.data]);
      setSelectedPondId(data.data.id.toString());
      setNewPondName("");
      setStep("pond-selection");
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Failed to create pond"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setStep("input");
    setDeviceName("");
    setDeviceType("SENSOR");
    setSelectedPondId("");
    setNewPondName("");
    setError(null);
    setScannedDevice(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50">
      <Card className="w-full max-w-md">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>
            {step === "input" && "Scan Device"}
            {step === "pond-selection" && "Select Pond"}
            {step === "pond-creation" && "Create Pond"}
            {step === "success" && "Device Registered"}
          </CardTitle>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* INPUT STEP */}
          {step === "input" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="device-type">Device Type</Label>
                <Select value={deviceType} onValueChange={setDeviceType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SENSOR">Sensor</SelectItem>
                    <SelectItem value="FEEDER">Feeder</SelectItem>
                    <SelectItem value="CONTROLLER">Controller</SelectItem>
                    <SelectItem value="HYBRID">Hybrid</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="device-name">Device Name (Manual Entry)</Label>
                <Input
                  id="device-name"
                  placeholder="Enter device name"
                  value={deviceName}
                  onChange={(e) => setDeviceName(e.target.value)}
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded">
                  <AlertCircle className="h-4 w-4" />
                  {error}
                </div>
              )}

              <Button
                onClick={handleScanClick}
                variant="outline"
                className="w-full"
              >
                <QrCodeIcon className="h-4 w-4 mr-2" />
                Scan QR Code (Optional)
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleQRCodeScanned}
                className="hidden"
              />

              <Button
                onClick={() => {
                  if (deviceName.trim()) {
                    setStep("pond-selection");
                    setError(null);
                  } else {
                    setError("Please enter device name");
                  }
                }}
                className="w-full"
              >
                Next
              </Button>
            </>
          )}

          {/* POND SELECTION STEP */}
          {step === "pond-selection" && (
            <>
              <div className="bg-blue-50 p-3 rounded text-sm">
                <p className="text-blue-900">
                  <strong>Device:</strong> {deviceName}
                </p>
                <p className="text-blue-800 text-xs mt-1">
                  Type: {deviceType}
                </p>
              </div>

              <div className="space-y-2">
                <Label>Select Pond</Label>
                {ponds.length > 0 ? (
                  <Select value={selectedPondId} onValueChange={setSelectedPondId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a pond..." />
                    </SelectTrigger>
                    <SelectContent>
                      {ponds.map((pond) => (
                        <SelectItem key={pond.id} value={pond.id.toString()}>
                          {pond.name} ({pond._count.devices} devices)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-sm text-gray-500">No ponds available</p>
                )}
              </div>

              <Button
                onClick={() => setStep("pond-creation")}
                variant="outline"
                className="w-full"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create New Pond
              </Button>

              {error && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded">
                  <AlertCircle className="h-4 w-4" />
                  {error}
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  onClick={() => setStep("input")}
                  variant="outline"
                  className="flex-1"
                >
                  Back
                </Button>
                <Button
                  onClick={handleCreateDevice}
                  disabled={!selectedPondId || loading}
                  className="flex-1"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Registering...
                    </>
                  ) : (
                    "Register Device"
                  )}
                </Button>
              </div>
            </>
          )}

          {/* POND CREATION STEP */}
          {step === "pond-creation" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="pond-name">Pond Name</Label>
                <Input
                  id="pond-name"
                  placeholder="Enter pond name"
                  value={newPondName}
                  onChange={(e) => setNewPondName(e.target.value)}
                  disabled={loading}
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded">
                  <AlertCircle className="h-4 w-4" />
                  {error}
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  onClick={() => setStep("pond-selection")}
                  variant="outline"
                  className="flex-1"
                  disabled={loading}
                >
                  Back
                </Button>
                <Button
                  onClick={handleCreatePond}
                  disabled={!newPondName.trim() || loading}
                  className="flex-1"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create Pond"
                  )}
                </Button>
              </div>
            </>
          )}

          {/* SUCCESS STEP */}
          {step === "success" && scannedDevice && (
            <>
              <div className="space-y-4">
                <div className="flex justify-center mb-2">
                  <CheckCircle2 className="h-12 w-12 text-green-600" />
                </div>

                <div className="bg-green-50 p-3 rounded space-y-2 text-sm">
                  <p className="text-green-900 font-semibold">
                    Device Registered Successfully!
                  </p>
                  <p className="text-green-800">
                    <strong>Name:</strong> {scannedDevice.name}
                  </p>
                  <p className="text-green-800">
                    <strong>Pond:</strong> {scannedDevice.pondName}
                  </p>
                  <p className="text-green-800">
                    <strong>Device ID:</strong>{" "}
                    <code className="text-xs break-all font-mono">
                      {scannedDevice.thingsboardDeviceId}
                    </code>
                  </p>
                </div>

                <div className="max-h-80 overflow-y-auto">
                  <QRCodeDisplay
                    deviceId={scannedDevice.thingsboardDeviceId}
                    deviceName={scannedDevice.name}
                  />
                </div>

                <Button onClick={handleClose} className="w-full">
                  Done
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
