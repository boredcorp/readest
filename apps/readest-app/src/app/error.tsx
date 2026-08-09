'use client';

import { lazy, Suspense } from 'react';
import { usePathname } from 'next/navigation';

import { LEARNINGBORED_PREVIEW_PATH } from '@/integrations/learningbored/preview/gate';

const ReaderApplicationError = lazy(() => import('@/components/ReaderApplicationError'));

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  const pathname = usePathname();

  if (pathname === LEARNINGBORED_PREVIEW_PATH) {
    return (
      <main
        aria-labelledby='learningbored-preview-error-heading'
        className='lb-presentation min-h-screen p-8'
        data-lb-preview-error='true'
        data-lb-theme='light'
      >
        <h1 id='learningbored-preview-error-heading'>The fixture preview could not render</h1>
        <p>{error.message}</p>
        <button onClick={reset} type='button'>
          Try the fixture again
        </button>
      </main>
    );
  }

  return (
    <Suspense fallback={null}>
      <ReaderApplicationError error={error} reset={reset} />
    </Suspense>
  );
}
