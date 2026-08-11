'use client';

import posthog from 'posthog-js';
import { Fragment, ReactNode, useEffect } from 'react';
import { PostHogProvider } from 'posthog-js/react';
import {
  hasOptedOutTelemetry,
  POSTHOG_PRIVACY_CONFIG,
  resolvePostHogConfig,
} from '@/utils/telemetry';
import { getAppVersion } from '@/utils/version';

const posthogConfig = resolvePostHogConfig();

if (typeof window !== 'undefined' && process.env['NODE_ENV'] === 'production' && posthogConfig) {
  if (!hasOptedOutTelemetry()) {
    posthog.init(posthogConfig.key, {
      api_host: posthogConfig.host,
      person_profiles: 'always',
      ...POSTHOG_PRIVACY_CONFIG,
    });
  }
}
export const CSPostHogProvider = ({ children }: { children: ReactNode }) => {
  useEffect(() => {
    if (posthogConfig && !hasOptedOutTelemetry()) {
      posthog.register_for_session({
        $app_version: getAppVersion(),
      });
    }
  }, []);

  if (!posthogConfig) return <Fragment>{children}</Fragment>;

  return <PostHogProvider client={posthog}>{children}</PostHogProvider>;
};
