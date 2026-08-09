'use client';

import type { ReactNode } from 'react';
import { ViewTransitions } from 'next-view-transitions';

import { EnvProvider } from '@/context/EnvContext';

import Providers from './Providers';

export default function ReaderApplicationProviders({ children }: { children: ReactNode }) {
  return (
    <ViewTransitions>
      <EnvProvider>
        <Providers>{children}</Providers>
      </EnvProvider>
    </ViewTransitions>
  );
}
