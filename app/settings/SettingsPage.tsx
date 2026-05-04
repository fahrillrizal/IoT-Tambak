"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSession, signIn } from "next-auth/react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { SettingsSkeleton } from "@/components/skeletons/SettingsSkeleton";
import { useConfirm } from "@/components/ConfirmDialog";
import { X } from "lucide-react";

interface SettingsPageClientProps {
  defaultCollapsed?: boolean;
}

export default function SettingsPageClient({ defaultCollapsed }: SettingsPageClientProps) {
  const router = useRouter();
  const { data: session, status } = useSession();
  const { confirm } = useConfirm();
  const [googleLinked, setGoogleLinked] = useState<boolean | null>(null);
  const [loadingAction, setLoadingAction] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [telegramConnected, setTelegramConnected] = useState<boolean | null>(null);
  const [telegramLoading, setTelegramLoading] = useState(false);
  const [telegramError, setTelegramError] = useState<string | null>(null);

  const refreshGoogleStatus = async () => {
    try {
      const res = await fetch("/api/settings/account/google");
      const data = await res.json();
      setGoogleLinked(data.linked);
    } catch (e) {
      setGoogleLinked(false);
    }
  };

  const refreshTelegramStatus = async () => {
    setTelegramError(null);
    try {
      const res = await fetch("/api/settings/telegram/connect");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setTelegramError(data.error || "Failed to load Telegram status");
        setTelegramConnected(false);
        return;
      }
      const data = await res.json();
      setTelegramConnected(Boolean(data.connected));
    } catch (e) {
      setTelegramError("Failed to load Telegram status");
      setTelegramConnected(false);
    }
  };

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated") {
      refreshGoogleStatus();
      refreshTelegramStatus();
    }
  }, [status]);

  const handleLinkGoogle = async () => {
    const confirmed = await confirm({
      title: "Link Google Account",
      message: `Google linking works only if your Google email matches this account email (${session?.user?.email}).\n\nIf the email is different, you will sign in as that Google account.`,
      type: "info",
      confirmText: "Continue",
      cancelText: "Cancel",
    });
    if (!confirmed) return;
    setLoadingAction(true);
    try {
      await signIn("google", { callbackUrl: "/settings" });
    } catch (e) {
      console.error("Failed to link Google account");
    } finally {
      setLoadingAction(false);
    }
  };

  const handleUnlinkGoogle = async () => {
    const confirmed = await confirm({
      title: "Unlink Google Account",
      message: "Are you sure you want to unlink your Google account?\n\nYou will no longer be able to sign in with Google.",
      type: "danger",
      confirmText: "Yes, unlink",
      cancelText: "Cancel",
    });
    if (!confirmed) return;
    setLoadingAction(true);
    try {
      const res = await fetch("/api/settings/account/google", { method: "DELETE" });
      if (res.ok) refreshGoogleStatus();
    } catch (e) {
      console.error("Something went wrong");
    } finally {
      setLoadingAction(false);
    }
  };

  const handleConnectTelegram = async () => {
    setTelegramLoading(true);
    setTelegramError(null);
    try {
      const res = await fetch("/api/settings/telegram/connect", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setTelegramError(data.error || "Failed to create Telegram connection");
        return;
      }

      if (data?.connectUrl) {
        const opened = window.open(data.connectUrl, "_blank", "noopener,noreferrer");
        if (!opened) {
          window.location.href = data.connectUrl;
        }
      }

      await refreshTelegramStatus();
    } catch (e) {
      setTelegramError("Failed to create Telegram connection");
    } finally {
      setTelegramLoading(false);
    }
  };

  // Loading - tampilkan skeleton di dalam layout
  if (status === "loading") {
    return (
      <DashboardLayout activeMenu="settings" defaultCollapsed={defaultCollapsed}>
        <SettingsSkeleton />
      </DashboardLayout>
    );
  }

  if (!session) return null;

  return (
    <DashboardLayout activeMenu="settings" defaultCollapsed={defaultCollapsed}>
      <div className="max-w-4xl mx-auto px-4 py-6 mb-20 lg:mb-0">
        <div className="mb-6">
          <h2 className="text-3xl font-bold text-gray-900 mb-1">Account Settings</h2>
          <p className="text-gray-500">Manage your profile and account security</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Profile Card */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <div className="flex flex-col items-center">
              <div 
                className="w-24 h-24 rounded-full overflow-hidden bg-gray-200 mb-4 cursor-pointer hover:opacity-90 transition-opacity"
                onClick={() => session.user.image && setShowImageModal(true)}
                title={session.user.image ? "Klik untuk melihat" : ""}
              >
                {session.user.image ? (
                  <img src={session.user.image} alt="avatar" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-blue-600 flex items-center justify-center">
                    <span className="text-2xl text-white font-semibold">{session.user.email?.[0].toUpperCase()}</span>
                  </div>
                )}
              </div>
              <h2 className="text-lg font-semibold text-gray-900">{session.user.name || session.user.email}</h2>
              <p className="text-sm text-gray-500 mb-4">{session.user.email}</p>
              <p className="text-xs text-gray-500 mb-4">Manage your profile info, photo, and address.</p>
              <button
                onClick={() => router.push("/settings/profile")}
                className="text-sm font-medium text-blue-600 hover:text-blue-700 px-4 py-2 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
              >
                Edit Profile
              </button>
            </div>
          </div>

          {/* Security & Login Card */}
          <div className="bg-white border border-gray-200 rounded-lg p-6 flex flex-col gap-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Security & Sign-in</h2>
            <p className="text-sm text-gray-500 mb-2">Manage your password and Google sign-in connection.</p>

            <div className="flex items-center justify-between border border-gray-100 rounded-lg px-4 py-3 bg-gray-50">
              <div>
                <p className="text-sm font-medium text-gray-900">Account Password</p>
                <p className="text-xs text-gray-500">Use a strong, unique password.</p>
              </div>
              <button onClick={() => router.push("/settings/password")} className="text-sm font-medium text-indigo-600 hover:text-indigo-700">Change</button>
            </div>

            <div className="flex items-center justify-between border border-gray-100 rounded-lg px-4 py-3 bg-gray-50">
              <div>
                <p className="text-sm font-medium text-gray-900">Sign in with Google</p>
                {googleLinked === null ? (
                  <p className="text-xs text-gray-500 flex items-center gap-2">
                    <span className="inline-block w-3 h-3 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
                    Checking connection status...
                  </p>
                ) : googleLinked ? (
                  <p className="text-xs text-green-600">Connected to Google.</p>
                ) : (
                  <p className="text-xs text-gray-500">Not connected to Google.</p>
                )}
              </div>
              {googleLinked !== null && (
                <button
                  onClick={googleLinked ? handleUnlinkGoogle : handleLinkGoogle}
                  disabled={loadingAction}
                  className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors disabled:opacity-50 ${
                    googleLinked ? "border-red-200 text-red-600 hover:bg-red-50" : "border-gray-300 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {loadingAction ? "Processing..." : googleLinked ? "Disconnect" : "Connect"}
                </button>
              )}
            </div>

            <div className="flex items-center justify-between border border-gray-100 rounded-lg px-4 py-3 bg-gray-50">
              <div>
                <p className="text-sm font-medium text-gray-900">Telegram Notifications</p>
                {telegramConnected === null ? (
                  <p className="text-xs text-gray-500 flex items-center gap-2">
                    <span className="inline-block w-3 h-3 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
                    Checking connection status...
                  </p>
                ) : telegramConnected ? (
                  <p className="text-xs text-green-600">Connected to Telegram.</p>
                ) : (
                  <p className="text-xs text-gray-500">Not connected to Telegram.</p>
                )}
                {telegramError && (
                  <p className="text-xs text-red-600 mt-1">{telegramError}</p>
                )}
              </div>
              {telegramConnected !== null && (
                <button
                  onClick={handleConnectTelegram}
                  disabled={telegramLoading}
                  className="text-xs font-medium px-3 py-1.5 rounded-full border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  {telegramLoading ? "Processing..." : telegramConnected ? "Reconnect" : "Connect"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Image View Modal */}
      {showImageModal && session.user.image && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4" onClick={() => setShowImageModal(false)}>
          <div className="relative max-w-5xl w-full">
            <button onClick={() => setShowImageModal(false)} className="absolute -top-14 right-0 flex items-center gap-2 text-white hover:text-gray-300 transition-colors px-4 py-2 rounded-lg hover:bg-white/10">
              <X className="h-5 w-5" /><span className="text-sm font-medium">Close</span>
            </button>
            <div className="bg-white rounded-lg p-2">
              <img src={session.user.image} alt="Profile preview" className="w-full h-auto max-h-[80vh] object-contain rounded" onClick={(e) => e.stopPropagation()} />
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
