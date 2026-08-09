'use client';

import { useSyncExternalStore } from 'react';

import { useSettingsStore } from '@/store/settingsStore';
import { useThemeStore } from '@/store/themeStore';

import type { LearningBoredPresentationTheme } from './context';

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

export function useReaderLearningBoredPresentationTheme(): LearningBoredPresentationTheme {
  const { isDarkMode } = useThemeStore();
  const { settings } = useSettingsStore();
  const isDocumentEink = useSyncExternalStore(
    subscribeToDocumentEink,
    getDocumentEinkSnapshot,
    () => false,
  );

  if (settings.globalViewSettings?.isEink === true || isDocumentEink) return 'eink';
  return isDarkMode ? 'dark' : 'light';
}
