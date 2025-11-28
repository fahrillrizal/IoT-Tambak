'use client';

import dynamic from 'next/dynamic';
import { AuthSkeleton } from '@/components/skeletons/AuthSkeleton';

const LoginForm = dynamic(() => import('./LoginForm'), {
  ssr: false,
  loading: () => <AuthSkeleton />,
});

export default function LoginPage() {
  return <LoginForm />;
}
