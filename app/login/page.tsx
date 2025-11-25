'use client';

import dynamic from 'next/dynamic';

const LoginForm = dynamic(() => import('./LoginForm'), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-cyan-50">
      <div className="animate-pulse text-gray-400">Memuat...</div>
    </div>
  ),
});

export default function LoginPage() {
  return <LoginForm />;
}
