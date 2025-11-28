'use client';

import { SessionProvider } from 'next-auth/react';
import { ReactNode } from 'react';
import { ConfirmProvider } from '@/components/ConfirmDialog';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <ConfirmProvider>
        {children}
      </ConfirmProvider>
    </SessionProvider>
  );
}