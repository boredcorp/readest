'use client';

import { useSyncExternalStore } from 'react';

import { useSettingsStore } from '@/store/settingsStore';
import { useThemeStore } from '@/store/themeStore';

export type LearningBoredPresentationTheme = 'light' | 'dark' | 'eink';

function getDocumentEinkSnapshot(): boolean {
  return typeof document !== 'undefined' && document.documentElement.dataset['eink'] === 'true';
}

function subscribeToDocumentEink(onStoreChange: () => void): () => void {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return () => {};

  const observer = new MutationObserver(onStoreChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-eink'],
  });
  return () => observer.disconnect();
}

export function useLearningBoredPresentationTheme(): LearningBoredPresentationTheme {
  const isDarkMode = useThemeStore((state) => state.isDarkMode);
  const isStoredEink = useSettingsStore((state) => state.settings.globalViewSettings?.isEink);
  const isDocumentEink = useSyncExternalStore(
    subscribeToDocumentEink,
    getDocumentEinkSnapshot,
    () => false,
  );

  if (isStoredEink || isDocumentEink) return 'eink';
  return isDarkMode ? 'dark' : 'light';
}
