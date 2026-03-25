"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Scanner, IDetectedBarcode } from "@yudiel/react-qr-scanner";
import jsQR from "jsqr";
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
  Camera,
  ImageIcon,
  SwitchCamera,
  ArrowLeft,
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

type Step =
  | "input"
  | "scan-select"
  | "scan-camera"
  | "scan-processing"
  | "pond-selection"
  | "pond-creation"
  | "success";

export function DeviceScanModal({ isOpen, onClose }: DeviceScanModalProps) {
  const router = useRouter();

  const [step, setStep] = useState<Step>("input");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [deviceName, setDeviceName] = useState("");
  const [deviceType, setDeviceType] = useState("SENSOR");
  const [ponds, setPonds] = useState<Pond[]>([]);
  const [selectedPondId, setSelectedPondId] = useState<string>("");
  const [newPondName, setNewPondName] = useState("");
  const [scannedDevice, setScannedDevice] = useState<any>(null);

  const [facingMode, setFacingMode] = useState<"environment" | "user">(
    "environment"
  );

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

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

  const parseQRData = useCallback((data: string): string | null => {
    try {
      if (data.includes("deviceId=")) {
        try {
          const url = new URL(data);
          const deviceId = url.searchParams.get("deviceId");
          if (deviceId) return deviceId;
        } catch {
          const match = data.match(/deviceId=([^&\s]+)/);
          if (match?.[1]) return match[1];
        }
      }

      if (data.startsWith("hehehe://")) {
        const url = new URL(data.replace("hehehe://", "https://placeholder/"));
        const deviceId =
          url.searchParams.get("deviceId") || url.searchParams.get("id");
        if (deviceId) return deviceId;
      }

      if (data.startsWith("{")) {
        const parsed = JSON.parse(data);
        if (parsed.deviceId) return parsed.deviceId;
        if (parsed.id) return parsed.id;
      }

      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const deviceIdRegex = /^[A-Za-z0-9_-]{10,50}$/;
      if (uuidRegex.test(data) || deviceIdRegex.test(data)) {
        return data;
      }

      return null;
    } catch {
      return null;
    }
  }, []);

  const navigateToClaim = useCallback(
    (deviceId: string) => {
      setStep("scan-processing");
      handleClose();
      router.push(`/claim?deviceId=${encodeURIComponent(deviceId)}`);
    },
    [router]
  );

  const handleCameraScan = useCallback(
    (detectedCodes: IDetectedBarcode[]) => {
      if (
        step !== "scan-camera" ||
        !detectedCodes ||
        detectedCodes.length === 0
      )
        return;

      const scannedData = detectedCodes[0];
      if (!scannedData?.rawValue) return;

      const data = scannedData.rawValue;
      console.log("QR Scanned from camera:", data);

      const deviceId = parseQRData(data);

      if (deviceId) {
        navigateToClaim(deviceId);
      } else {
        setError(
          "Format QR code tidak valid. Pastikan QR code berasal dari perangkat IoT Tambak."
        );
      }
    },
    [step, parseQRData, navigateToClaim]
  );

  const handleCameraError = useCallback((error: unknown) => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Camera error:", errorMessage);

    if (
      errorMessage.includes("NotAllowedError") ||
      errorMessage.includes("Permission")
    ) {
      setError(
        "Akses kamera ditolak. Mohon izinkan akses kamera di pengaturan browser."
      );
    } else if (errorMessage.includes("NotFoundError")) {
      setError("Kamera tidak ditemukan. Pastikan perangkat memiliki kamera.");
    } else if (errorMessage.includes("NotSupported")) {
      setError("Browser Anda tidak mendukung akses kamera.");
    } else if (errorMessage.includes("NotReadable")) {
      setError("Kamera sedang digunakan oleh aplikasi lain.");
    } else {
      setError(`Error kamera: ${errorMessage}`);
    }
  }, []);

  const toggleCamera = useCallback(() => {
    setFacingMode((prev) => (prev === "environment" ? "user" : "environment"));
  }, []);

  const handleGalleryUpload = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      setStep("scan-processing");
      setError(null);

      const MAX_FILE_SIZE = 10 * 1024 * 1024;
      if (file.size > MAX_FILE_SIZE) {
        setError("Ukuran file terlalu besar. Maksimal 10MB.");
        setStep("scan-select");
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }

      const image = new Image();
      const imageUrl = URL.createObjectURL(file);

      const loadTimeout = setTimeout(() => {
        URL.revokeObjectURL(imageUrl);
        setError("Timeout memuat gambar. Coba gambar lain.");
        setStep("scan-select");
      }, 10000);

      image.onload = () => {
        clearTimeout(loadTimeout);

        try {
          const canvas = canvasRef.current;
          if (!canvas) throw new Error("Canvas not available");

          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (!ctx) throw new Error("Canvas context not available");

          const maxSize = 1500;
          let { width, height } = image;

          if (width > maxSize || height > maxSize) {
            if (width > height) {
              height = (height / width) * maxSize;
              width = maxSize;
            } else {
              width = (width / height) * maxSize;
              height = maxSize;
            }
          }

          canvas.width = width;
          canvas.height = height;
          ctx.drawImage(image, 0, 0, width, height);

          const imageData = ctx.getImageData(0, 0, width, height);
          const code = jsQR(imageData.data, imageData.width, imageData.height);

          URL.revokeObjectURL(imageUrl);

          if (code) {
            console.log("QR Scanned from gallery:", code.data);
            const deviceId = parseQRData(code.data);

            if (deviceId) {
              navigateToClaim(deviceId);
            } else {
              setError(
                "Format QR code tidak valid. Pastikan QR code berasal dari perangkat IoT Tambak."
              );
              setStep("scan-select");
            }
          } else {
            setError(
              "Tidak dapat mendeteksi QR code dalam gambar. Pastikan gambar jelas."
            );
            setStep("scan-select");
          }
        } catch (err) {
          console.error("Canvas processing error:", err);
          setError("Gagal memproses gambar. Coba gambar lain.");
          setStep("scan-select");
          URL.revokeObjectURL(imageUrl);
        }
      };

      image.onerror = () => {
        clearTimeout(loadTimeout);
        URL.revokeObjectURL(imageUrl);
        setError(
          "Gagal memuat gambar. Pastikan file adalah gambar yang valid."
        );
        setStep("scan-select");
      };

      image.src = imageUrl;
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [parseQRData, navigateToClaim]
  );

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
      console.log("Registering device:", {
        deviceName: deviceName.trim(),
        pondId: selectedPondId,
        deviceType,
      });

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
      console.log("Device registration response:", {
        status: response.status,
        ok: response.ok,
        data,
      });

      if (!response.ok) {
        const errorMsg = data.error || "Failed to register device";
        console.error("Device registration error:", {
          status: response.status,
          error: errorMsg,
          details: data,
        });
        throw new Error(errorMsg);
      }

      setScannedDevice(data.data);
      setStep("success");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to register device";
      console.error("Device registration exception:", error, {
        message: errorMessage,
      });
      setError(errorMessage);
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
    setFacingMode("environment");
    onClose();
  };

  const getTitle = () => {
    switch (step) {
      case "input":
        return "Add Device";
      case "scan-select":
        return "Scan QR Code";
      case "scan-camera":
        return "Arahkan ke QR Code";
      case "scan-processing":
        return "Memproses...";
      case "pond-selection":
        return "Select Pond";
      case "pond-creation":
        return "Create Pond";
      case "success":
        return "Device Registered";
      default:
        return "Add Device";
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      {/* Hidden canvas for processing gallery images */}
      <canvas ref={canvasRef} className="hidden" aria-hidden="true" />

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleGalleryUpload}
        className="hidden"
        aria-hidden="true"
      />

      <Card className="w-full max-w-md">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2">
            {(step === "scan-select" || step === "scan-camera") && (
              <button
                onClick={() => {
                  setStep("input");
                  setError(null);
                }}
                className="text-gray-400 hover:text-gray-600 mr-1"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
            )}
            {getTitle()}
          </CardTitle>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* ==================== INPUT STEP ==================== */}
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
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}

              <Button
                onClick={() => {
                  setError(null);
                  setStep("scan-select");
                }}
                variant="outline"
                className="w-full"
              >
                <QrCodeIcon className="h-4 w-4 mr-2" />
                Scan QR Code
              </Button>

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

          {/* ==================== SCAN SELECT STEP ==================== */}
          {step === "scan-select" && (
            <>
              <p className="text-sm text-muted-foreground">
                Scan QR code pada perangkat IoT Tambak untuk menghubungkan ke
                akun Anda.
              </p>

              {error && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-lg">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="grid gap-3">
                <Button
                  onClick={() => {
                    setError(null);
                    setStep("scan-camera");
                  }}
                  className="w-full h-auto py-4"
                  variant="default"
                >
                  <div className="flex items-center gap-3">
                    <Camera className="h-5 w-5" />
                    <div className="text-left">
                      <p className="font-medium">Scan dengan Kamera</p>
                      <p className="text-xs opacity-80">
                        Real-time scanning tanpa memotret
                      </p>
                    </div>
                  </div>
                </Button>

                <Button
                  onClick={() => fileInputRef.current?.click()}
                  variant="outline"
                  className="w-full h-auto py-4"
                >
                  <div className="flex items-center gap-3">
                    <ImageIcon className="h-5 w-5" />
                    <div className="text-left">
                      <p className="font-medium">Pilih dari Galeri</p>
                      <p className="text-xs text-muted-foreground">
                        Upload gambar QR code
                      </p>
                    </div>
                  </div>
                </Button>
              </div>

              <p className="text-xs text-center text-muted-foreground pt-2">
                QR code berisi Device ID yang akan digunakan untuk klaim
                perangkat
              </p>
            </>
          )}

          {/* ==================== SCAN CAMERA STEP ==================== */}
          {step === "scan-camera" && (
            <>
              <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-black">
                <Scanner
                  key={facingMode}
                  onScan={handleCameraScan}
                  onError={handleCameraError}
                  constraints={{
                    facingMode: facingMode,
                  }}
                  styles={{
                    container: {
                      width: "100%",
                      height: "100%",
                    },
                    video: {
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    },
                  }}
                  components={{
                    audio: false,
                    torch: true,
                    finder: true,
                  }}
                />

                {/* Scanning overlay with corner markers */}
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48">
                    <div className="absolute -top-1 -left-1 w-6 h-6 border-t-[3px] border-l-[3px] border-primary rounded-tl-lg" />
                    <div className="absolute -top-1 -right-1 w-6 h-6 border-t-[3px] border-r-[3px] border-primary rounded-tr-lg" />
                    <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-[3px] border-l-[3px] border-primary rounded-bl-lg" />
                    <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-[3px] border-r-[3px] border-primary rounded-br-lg" />
                  </div>

                  {/* Scanning line animation */}
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 overflow-hidden">
                    <div
                      className="absolute w-full h-0.5 bg-primary/60"
                      style={{
                        animation: "scanLine 2s ease-in-out infinite",
                      }}
                    />
                  </div>
                </div>

                {/* Bottom indicator */}
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/70 text-white px-4 py-2 rounded-full text-sm flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  Mencari QR Code...
                </div>

                {/* Switch camera button */}
                <button
                  onClick={toggleCamera}
                  className="absolute top-4 right-4 bg-black/50 text-white p-2 rounded-full hover:bg-black/70 transition-colors"
                  aria-label="Switch camera"
                >
                  <SwitchCamera className="h-5 w-5" />
                </button>
              </div>

              {error && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-lg">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  onClick={() => {
                    setStep("scan-select");
                    setError(null);
                  }}
                  variant="outline"
                  className="flex-1"
                >
                  Kembali
                </Button>
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  variant="secondary"
                  className="flex-1"
                >
                  <ImageIcon className="h-4 w-4 mr-2" />
                  Dari Galeri
                </Button>
              </div>
            </>
          )}

          {/* ==================== SCAN PROCESSING STEP ==================== */}
          {step === "scan-processing" && (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <p className="text-muted-foreground">Memproses QR Code...</p>
            </div>
          )}

          {/* ==================== POND SELECTION STEP ==================== */}
          {step === "pond-selection" && (
            <>
              <div className="bg-blue-50 p-3 rounded text-sm">
                <p className="text-blue-900">
                  <strong>Device:</strong> {deviceName}
                </p>
                <p className="text-blue-800 text-xs mt-1">Type: {deviceType}</p>
              </div>

              <div className="space-y-2">
                <Label>Select Pond</Label>
                {ponds.length > 0 ? (
                  <Select
                    value={selectedPondId}
                    onValueChange={setSelectedPondId}
                  >
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

          {/* ==================== POND CREATION STEP ==================== */}
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

          {/* ==================== SUCCESS STEP ==================== */}
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

      {/* CSS Animation for scanning line */}
      <style>
        {`
          @keyframes scanLine {
            0% { top: 0; }
            50% { top: calc(100% - 2px); }
            100% { top: 0; }
          }
        `}
      </style>
    </div>
  );
}
