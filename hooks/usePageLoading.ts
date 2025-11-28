'use client';

import { useState, useEffect, useTransition } from 'react';
import { usePathname } from 'next/navigation';

export function usePageLoading() {
  const [isLoading, setIsLoading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const pathname = usePathname();

  useEffect(() => {
    setIsLoading(false);
  }, [pathname]);

  const startLoading = () => setIsLoading(true);
  const stopLoading = () => setIsLoading(false);

  return {
    isLoading: isLoading || isPending,
    startLoading,
    stopLoading,
    startTransition,
  };
}