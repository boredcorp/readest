'use client';

import { createContext, useContext } from 'react';

import type { LearningBoredClient } from './client';

const LearningBoredClientContext = createContext<LearningBoredClient | null>(null);

export const LearningBoredClientProvider = LearningBoredClientContext.Provider;

export function useLearningBoredClient(): LearningBoredClient | null {
  return useContext(LearningBoredClientContext);
}
