"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSession, signIn } from "next-auth/react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useConfirm } from "@/components/ConfirmDialog";

export default function SettingsPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const { confirm } = useConfirm();
  const [googleLinked, setGoogleLinked] = useState<boolean | null>(null);
  const [loadingAction, setLoadingAction] = useState(false);

  const refreshGoogleStatus = async () => {
    try {
      const res = await fetch("/api/settings/account/google");
      const data = await res.json();
      setGoogleLinked(data.linked);
    } catch (e) {
      setGoogleLinked(false);
    }
  };

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated") {
      refreshGoogleStatus();
    }
  }, [status]);

  const handleLinkGoogle = async () => {
    const confirmed = await confirm({
      title: "Link Akun Google",
      message: `Link Google hanya berhasil jika email Google Anda sama dengan email akun ini (${session?.user?.email}).\n\nJika email berbeda, Anda akan login sebagai akun Google tersebut.`,
      type: "info",
      confirmText: "Lanjutkan",
      cancelText: "Batal",
    });

    if (!confirmed) return;

    setLoadingAction(true);
    try {
      await signIn("google", { callbackUrl: "/settings" });
    } catch (e: any) {
      console.error("Gagal menghubungkan akun Google");
    } finally {
      setLoadingAction(false);
    }
  };

  const handleUnlinkGoogle = async () => {
    const confirmed = await confirm({
      title: "Unlink Akun Google",
      message:
        "Yakin ingin memutuskan hubungan akun Google?\n\nAnda tidak akan bisa login menggunakan Google setelah ini.",
      type: "danger",
      confirmText: "Ya, Unlink",
      cancelText: "Batal",
    });

    if (!confirmed) return;

    setLoadingAction(true);
    try {
      const res = await fetch("/api/settings/account/google", {
        method: "DELETE",
      });
      if (res.ok) {
        refreshGoogleStatus();
      }
    } catch (e: any) {
      console.error("Terjadi kesalahan");
    } finally {
      setLoadingAction(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="mt-4 text-gray-600">Memuat...</p>
        </div>
      </div>
    );
  }

  if (!session) return null;

  return (
    <DashboardLayout activeMenu="settings">
      <div className="max-w-4xl mx-auto px-4 py-6 mb-20 lg:mb-0">
        {/* Page Header */}
        <div className="mb-6">
          <h2 className="text-3xl font-bold text-gray-900 mb-1">
            Pengaturan Akun
          </h2>
          <p className="text-gray-500">Kelola profil dan keamanan akun Anda</p>
        </div>

        {/* Grid Content */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Profile Card */}
          <div
            onClick={() => router.push("/settings/profile")}
            className="bg-white border border-gray-200 rounded-lg p-6 cursor-pointer hover:shadow-lg transition-shadow"
          >
            <div className="flex flex-col items-center">
              <div className="w-24 h-24 rounded-full overflow-hidden bg-gray-200 mb-4">
                {session.user.image ? (
                  <img
                    src={session.user.image}
                    alt="avatar"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-blue-600 flex items-center justify-center">
                    <span className="text-2xl text-white font-semibold">
                      {session.user.email?.[0].toUpperCase()}
                    </span>
                  </div>
                )}
              </div>
              <h2 className="text-lg font-semibold text-gray-900">
                {session.user.name || session.user.email}
              </h2>
              <p className="text-sm text-gray-500 mb-4">{session.user.email}</p>
              <p className="text-xs text-gray-500">
                Kelola informasi profil, foto, dan alamat akun Anda.
              </p>
            </div>
          </div>

          {/* Security & Login Card */}
          <div className="bg-white border border-gray-200 rounded-lg p-6 flex flex-col gap-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">
              Keamanan & Login
            </h2>
            <p className="text-sm text-gray-500 mb-2">
              Atur password dan koneksi login dengan akun Google Anda.
            </p>

            {/* Password section */}
            <div className="flex items-center justify-between border border-gray-100 rounded-lg px-4 py-3 bg-gray-50">
              <div>
                <p className="text-sm font-medium text-gray-900">Password Akun</p>
                <p className="text-xs text-gray-500">
                  Disarankan menggunakan password kuat dan unik.
                </p>
              </div>
              <button
                type="button"
                onClick={() => router.push("/settings/password")}
                className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
              >
                Ubah
              </button>
            </div>

            {/* Google section */}
            <div className="flex items-center justify-between border border-gray-100 rounded-lg px-4 py-3 bg-gray-50">
              <div>
                <p className="text-sm font-medium text-gray-900">Login dengan Google</p>
                {googleLinked === null ? (
                  <p className="text-xs text-gray-500 flex items-center gap-2">
                    <span className="inline-block w-3 h-3 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
                    Memeriksa status koneksi...
                  </p>
                ) : googleLinked ? (
                  <p className="text-xs text-green-600">Terkoneksi dengan akun Google.</p>
                ) : (
                  <p className="text-xs text-gray-500">Belum terhubung ke akun Google.</p>
                )}
              </div>
              {googleLinked !== null && (
                <button
                  type="button"
                  onClick={googleLinked ? handleUnlinkGoogle : handleLinkGoogle}
                  disabled={loadingAction}
                  className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors disabled:opacity-50 ${
                    googleLinked
                      ? "border-red-200 text-red-600 hover:bg-red-50"
                      : "border-gray-300 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {loadingAction
                    ? "Memproses..."
                    : googleLinked
                      ? "Putuskan"
                      : "Hubungkan"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
