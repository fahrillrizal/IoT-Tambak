"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Loader2, AlertCircle, Copy, CheckCircle2, ExternalLink, Share2 } from "lucide-react";

interface QRCodeDisplayProps {
  deviceId: string;
  deviceName: string;
  onClose?: () => void;
}

export function QRCodeDisplay({
  deviceId,
  deviceName,
  onClose,
}: QRCodeDisplayProps) {
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const claimUrl = useMemo(() => {
    if (!deviceId) return "";
    if (typeof window === "undefined") return `https://hehehe.tech/claim?deviceId=${encodeURIComponent(deviceId)}`;
    return `${window.location.origin}/claim?deviceId=${encodeURIComponent(deviceId)}`;
  }, [deviceId]);

  useEffect(() => {
    const generateQR = async () => {
      if (!deviceId) {
        setError("Device ID is not available");
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        const response = await fetch(
          `/api/qrcode/generate?deviceId=${encodeURIComponent(deviceId)}`
        );
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to generate QR code");
        }

        setQrCode(data.data.qrCode);
      } catch (error) {
        setError(
          error instanceof Error ? error.message : "Failed to generate QR code"
        );
      } finally {
        setLoading(false);
      }
    };

    generateQR();
  }, [deviceId]);

  const handleDownload = () => {
    if (!qrCode) return;

    const link = document.createElement("a");
    link.href = qrCode;
    link.download = `qrcode-${deviceName}-${deviceId}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopyDeviceId = () => {
    navigator.clipboard.writeText(deviceId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyLink = () => {
    if (!claimUrl) return;
    navigator.clipboard.writeText(claimUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleOpenLink = () => {
    if (!claimUrl) return;
    window.open(claimUrl, "_blank", "noopener,noreferrer");
  };

  const handleShare = async () => {
    if (!claimUrl || !navigator.share) {
      handleCopyLink();
      return;
    }
    try {
      await navigator.share({ title: `QR ${deviceName}`, text: `Device ID: ${deviceId}`, url: claimUrl });
    } catch (e) {
      // ignore cancel
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>QR Code - {deviceName}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && (
          <div className="flex justify-center items-center p-8">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        {!loading && qrCode && (
          <>
            <div className="flex justify-center bg-gray-50 p-4 rounded-lg">
              <img
                src={qrCode}
                alt="QR Code"
                className="w-64 h-64 object-contain"
              />
            </div>

            <div className="space-y-3">
              <Button onClick={handleDownload} className="w-full">
                <Download className="h-4 w-4 mr-2" />
                Download QR Code
              </Button>

              <div className="bg-blue-50 p-3 rounded text-sm space-y-2">
                <p className="font-semibold text-blue-900">Device ID:</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-white p-2 rounded border border-blue-200 text-xs font-mono truncate">
                    {deviceId}
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCopyDeviceId}
                    className="shrink-0"
                  >
                    {copied ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="bg-gray-50 p-3 rounded text-sm space-y-2">
                <p className="font-semibold text-gray-900">Direct link:</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-white p-2 rounded border border-gray-200 text-xs font-mono truncate">
                    {claimUrl || "(link not available)"}
                  </code>
                  <Button variant="ghost" size="sm" onClick={handleCopyLink} className="shrink-0">
                    {copiedLink ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleOpenLink} disabled={!claimUrl}>
                    <ExternalLink className="h-4 w-4 mr-1" /> Open
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleShare} disabled={!claimUrl}>
                    <Share2 className="h-4 w-4 mr-1" /> Share/Copy
                  </Button>
                </div>
              </div>

              {onClose && (
                <Button onClick={onClose} variant="outline" className="w-full">
                  Close
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
