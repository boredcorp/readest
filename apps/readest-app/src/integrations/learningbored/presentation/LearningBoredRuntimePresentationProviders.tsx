'use client';

import type { ReactNode } from 'react';

import { useTranslation } from '@/hooks/useTranslation';

import {
  LearningBoredPresentationThemeProvider,
  LearningBoredTranslationProvider,
} from './context';
import { useReaderLearningBoredPresentationTheme } from './theme';

export default function LearningBoredRuntimePresentationProviders({
  children,
}: {
  children: ReactNode;
}) {
  const translate = useTranslation();
  const theme = useReaderLearningBoredPresentationTheme();

  return (
    <LearningBoredTranslationProvider value={translate}>
      <LearningBoredPresentationThemeProvider value={theme}>
        {children}
      </LearningBoredPresentationThemeProvider>
    </LearningBoredTranslationProvider>
  );
}
