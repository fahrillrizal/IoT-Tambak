"use client";

import { SessionProvider } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider refetchInterval={5 * 60} refetchOnWindowFocus={true}>
      <SessionErrorHandler>{children}</SessionErrorHandler>
    </SessionProvider>
  );
}

function SessionErrorHandler({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    const handleSessionError = () => {
      console.log("Session error detected, redirecting to login...");
      router.push("/login");
    };

    window.addEventListener("next-auth.session-error", handleSessionError);

    return () => {
      window.removeEventListener("next-auth.session-error", handleSessionError);
    };
  }, [router]);

  return <>{children}</>;
}
