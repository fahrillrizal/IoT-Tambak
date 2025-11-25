"use client";

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useSession, signIn } from 'next-auth/react';
import { ArrowLeft } from 'lucide-react';
import { useConfirm } from '@/app/components/ConfirmDialog';

export default function SettingsPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const { confirm } = useConfirm();
  const [googleLinked, setGoogleLinked] = useState<boolean | null>(null);
  const [loadingAction, setLoadingAction] = useState(false);

  const refreshGoogleStatus = async () => {
    try {
      const res = await fetch('/api/settings/account/google');
      const data = await res.json();
      setGoogleLinked(data.linked);
    } catch (e) {
      setGoogleLinked(false);
    }
  };

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  useEffect(() => {
    refreshGoogleStatus();
  }, []);

  const handleLinkGoogle = async () => {
    const confirmed = await confirm({
      title: 'Link Akun Google',
      message: `Link Google hanya berhasil jika email Google Anda sama dengan email akun ini (${session?.user?.email}).\n\nJika email berbeda, Anda akan login sebagai akun Google tersebut.`,
      type: 'info',
      confirmText: 'Lanjutkan',
      cancelText: 'Batal',
    });
    
    if (!confirmed) return;
    
    setLoadingAction(true);
    try {
      await signIn('google', { callbackUrl: '/settings' });
    } catch (e: any) {
      console.error('Gagal menghubungkan akun Google');
    } finally {
      setLoadingAction(false);
    }
  };

  const handleUnlinkGoogle = async () => {
    const confirmed = await confirm({
      title: 'Unlink Akun Google',
      message: 'Yakin ingin memutuskan hubungan akun Google?\n\nAnda tidak akan bisa login menggunakan Google setelah ini.',
      type: 'danger',
      confirmText: 'Ya, Unlink',
      cancelText: 'Batal',
    });
    
    if (!confirmed) return;
    
    setLoadingAction(true);
    try {
      const res = await fetch('/api/settings/account/google', { method: 'DELETE' });
      if (res.ok) {
        refreshGoogleStatus();
      }
    } catch (e: any) {
      console.error('Terjadi kesalahan');
    } finally {
      setLoadingAction(false);
    }
  };

  if (status === 'loading') return <div className="p-6">Memuat...</div>;
  if (!session) return null;

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-4xl mx-auto">
        <button onClick={() => router.push('/')} className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6">
          <ArrowLeft className="h-5 w-5" />
          <span className="text-sm font-medium">Kembali ke Dashboard</span>
        </button>

        <h1 className="text-3xl font-bold mb-8 text-gray-900">Pengaturan Akun</h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Profile Card */}
          <div
            onClick={() => router.push('/settings/profile')}
            className="bg-white border border-gray-200 rounded-lg p-6 cursor-pointer hover:shadow-lg transition-shadow"
          >
            <div className="flex flex-col items-center">
              <div className="w-24 h-24 rounded-full overflow-hidden bg-gray-200 mb-4">
                {session.user.image ? (
                  <img src={session.user.image} alt="avatar" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-blue-600 flex items-center justify-center">
                    <span className="text-2xl text-white font-semibold">
                      {session.user.email?.[0].toUpperCase()}
                    </span>
                  </div>
                )}
              </div>
              <h2 className="text-lg font-semibold text-gray-900">{session.user.name || session.user.email}</h2>
              <p className="text-sm text-gray-500 mb-4">{session.user.email}</p>
              <div className="text-center">
                <p className="text-sm font-medium text-blue-600">Edit Profil</p>
                <p className="text-xs text-gray-500 mt-1">Ubah foto, nama, telepon, alamat</p>
              </div>
            </div>
          </div>

          {/* Reset Password Card */}
          <div
            onClick={() => router.push('/settings/password')}
            className="bg-white border border-gray-200 rounded-lg p-6 cursor-pointer hover:shadow-lg transition-shadow flex flex-col items-center justify-center"
          >
            <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Reset Password</h2>
            <p className="text-sm text-gray-500 text-center">Ubah password akun Anda</p>
          </div>
        </div>

        {/* Google Link/Unlink Button */}
        <div className="mt-6">
          {googleLinked === null ? (
            <div className="text-center py-4">
              <p className="text-sm text-gray-500">Memeriksa status...</p>
            </div>
          ) : (
            <button
              onClick={googleLinked ? handleUnlinkGoogle : handleLinkGoogle}
              disabled={loadingAction}
              className={`w-full md:w-auto flex items-center justify-center gap-3 px-6 py-3 rounded-lg font-medium transition-colors ${
                googleLinked
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-white border border-gray-300 hover:bg-gray-50 text-gray-700'
              } disabled:opacity-50`}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              <span>{loadingAction ? 'Memproses...' : googleLinked ? 'Unlink Google Account' : 'Link Google Account'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
