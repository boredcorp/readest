'use client';

import { createContext, useContext } from 'react';

export type LearningBoredPresentationTheme = 'light' | 'dark' | 'eink';
export type LearningBoredTranslationFunc = (
  message: string,
  values?: Record<string, number | string>,
) => string;

export function formatLearningBoredCopy(
  message: string,
  values: Record<string, number | string> = {},
): string {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{{${key}}}`, String(value)),
    message,
  );
}

const LearningBoredTranslationContext =
  createContext<LearningBoredTranslationFunc>(formatLearningBoredCopy);
const LearningBoredPresentationThemeContext =
  createContext<LearningBoredPresentationTheme>('light');

export const LearningBoredTranslationProvider = LearningBoredTranslationContext.Provider;
export const LearningBoredPresentationThemeProvider =
  LearningBoredPresentationThemeContext.Provider;

export function useLearningBoredTranslation(): LearningBoredTranslationFunc {
  return useContext(LearningBoredTranslationContext);
}

export function useLearningBoredPresentationTheme(): LearningBoredPresentationTheme {
  return useContext(LearningBoredPresentationThemeContext);
}
