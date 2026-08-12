'use client';

import { useSyncExternalStore } from 'react';
import type { MiuraBoardThemeId } from '@learningbored/sdk';

import { useSettingsStore } from '@/store/settingsStore';
import { useThemeStore } from '@/store/themeStore';

import type { LearningBoredPresentationTheme } from './context';

export const LEARNINGBORED_BOARD_THEME_BY_PRESENTATION = {
  light: 'miura-deployment-light-v1',
  dark: 'miura-deployment-dark-v1',
  eink: 'miura-deployment-eink-v1',
} as const satisfies Record<LearningBoredPresentationTheme, MiuraBoardThemeId>;

export function getReaderLearningBoredBoardThemeId(
  theme: LearningBoredPresentationTheme,
): MiuraBoardThemeId {
  return LEARNINGBORED_BOARD_THEME_BY_PRESENTATION[theme];
}

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
