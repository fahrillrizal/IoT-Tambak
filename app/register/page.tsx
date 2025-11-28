'use client';

import dynamic from 'next/dynamic';
import { AuthSkeleton } from '@/components/skeletons/AuthSkeleton';

const RegisterForm = dynamic(() => import('./RegisterForm'), {
  ssr: false,
  loading: () => <AuthSkeleton />,
});

export default function RegisterPage() {
  return <RegisterForm />;
}
