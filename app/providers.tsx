"use client";

import { SessionProvider } from "next-auth/react";
import { ReactNode } from "react";
import { ConfirmProvider } from "@/components/ConfirmDialog";
import { NotificationProvider } from "@/context/NotificationContext";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <ConfirmProvider>
        <NotificationProvider>
          {children}
        </NotificationProvider>
      </ConfirmProvider>
    </SessionProvider>
  );
}
