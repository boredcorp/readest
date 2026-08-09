'use client';

import { lazy, Suspense, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';

import { LEARNINGBORED_PREVIEW_PATH } from '@/integrations/learningbored/preview/gate';

const ReaderApplicationProviders = lazy(() => import('./ReaderApplicationProviders'));

export default function ReaderApplicationBoundary({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (pathname === LEARNINGBORED_PREVIEW_PATH) return children;

  return (
    <Suspense fallback={null}>
      <ReaderApplicationProviders>{children}</ReaderApplicationProviders>
    </Suspense>
  );
}
