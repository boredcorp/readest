'use client';

import React, { useMemo, type ReactNode } from 'react';
import type { AccessTokenProvider, LearningBoredFetch } from '@learningbored/sdk';

import { LearningBoredClientProvider } from './LearningBoredClientContext';
import { getLearningBoredReaderConfig } from './config';
import { createLearningBoredSdkClient, type LearningBoredSdkPort } from './sdk-client';

export interface LearningBoredSdkClientProviderProps {
  children: ReactNode;
  /** Optional application-shell override; production normally uses browser fetch. */
  transport?: LearningBoredFetch;
  /** Optional Clerk bearer token provider. Cookie sessions need no explicit provider. */
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
  const client = useMemo(() => {
    if (sdkClient) return createLearningBoredSdkClient({ sdkClient });
    if (!config.enabled) return null;

    const resolvedTransport = transport ?? globalThis.fetch?.bind(globalThis);
    if (!resolvedTransport) return null;

    return createLearningBoredSdkClient({
      apiBaseUrl: config.apiBaseUrl,
      transport: resolvedTransport,
      ...(getAccessToken ? { getAccessToken } : {}),
    });
  }, [config.apiBaseUrl, config.enabled, getAccessToken, sdkClient, transport]);

  return <LearningBoredClientProvider value={client}>{children}</LearningBoredClientProvider>;
};

export default LearningBoredSdkClientProvider;
