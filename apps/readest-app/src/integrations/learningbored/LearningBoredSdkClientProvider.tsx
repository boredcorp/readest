'use client';

import React, { useMemo, useRef, type ReactNode } from 'react';
import type { AccessTokenProvider, LearningBoredFetch } from '@learningbored/sdk';

import { useTranslation } from '@/hooks/useTranslation';
import { LearningBoredClientProvider } from './LearningBoredClientContext';
import { getLearningBoredReaderConfig } from './config';
import { createLearningBoredSdkClient, type LearningBoredSdkPort } from './sdk-client';
import {
  getReaderLearningBoredBoardThemeId,
  useReaderLearningBoredPresentationTheme,
} from './presentation/theme';
import {
  LearningBoredPresentationThemeProvider,
  LearningBoredTranslationProvider,
} from './presentation/context';

export interface LearningBoredSdkClientProviderProps {
  children: ReactNode;
  /** Optional application-shell override; production normally uses browser fetch. */
  transport?: LearningBoredFetch;
  /** Optional application-session bearer token provider. Cookie sessions need no explicit provider. */
  getAccessToken?: AccessTokenProvider;
  /** SDK-shaped seam used by focused tests and native application shells. */
  sdkClient?: LearningBoredSdkPort;
}

const LearningBoredSdkClientProvider: React.FC<LearningBoredSdkClientProviderProps> = ({
  children,
  transport,
  getAccessToken,
  sdkClient,
}) => {
  const config = getLearningBoredReaderConfig();
  const translate = useTranslation();
  const presentationTheme = useReaderLearningBoredPresentationTheme();
  const localRenderThemeRef = useRef(getReaderLearningBoredBoardThemeId(presentationTheme));
  localRenderThemeRef.current = getReaderLearningBoredBoardThemeId(presentationTheme);
  const client = useMemo(() => {
    const getLocalRenderThemeId = () => localRenderThemeRef.current;
    if (sdkClient) return createLearningBoredSdkClient({ sdkClient, getLocalRenderThemeId });
    if (!config.enabled) return null;

    const resolvedTransport = transport ?? globalThis.fetch?.bind(globalThis);
    if (!resolvedTransport) return null;

    return createLearningBoredSdkClient({
      apiBaseUrl: config.apiBaseUrl,
      transport: resolvedTransport,
      ...(getAccessToken ? { getAccessToken } : {}),
      getLocalRenderThemeId,
    });
  }, [config.apiBaseUrl, config.enabled, getAccessToken, sdkClient, transport]);

  return (
    <LearningBoredTranslationProvider value={translate}>
      <LearningBoredPresentationThemeProvider value={presentationTheme}>
        <LearningBoredClientProvider value={client}>{children}</LearningBoredClientProvider>
      </LearningBoredPresentationThemeProvider>
    </LearningBoredTranslationProvider>
  );
};

export default LearningBoredSdkClientProvider;
