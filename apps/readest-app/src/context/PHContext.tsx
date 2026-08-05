'use client';

import posthog from 'posthog-js';
import { ReactNode, useEffect } from 'react';
import { PostHogProvider } from 'posthog-js/react';
import { hasOptedOutTelemetry, POSTHOG_PRIVACY_CONFIG } from '@/utils/telemetry';
import { getAppVersion } from '@/utils/version';

const posthogUrl =
  process.env['NEXT_PUBLIC_POSTHOG_HOST'] ||
  atob(process.env['NEXT_PUBLIC_DEFAULT_POSTHOG_URL_BASE64']!);
const posthogKey =
  process.env['NEXT_PUBLIC_POSTHOG_KEY'] ||
  atob(process.env['NEXT_PUBLIC_DEFAULT_POSTHOG_KEY_BASE64']!);

if (typeof window !== 'undefined' && process.env['NODE_ENV'] === 'production' && posthogKey) {
  if (!hasOptedOutTelemetry()) {
    posthog.init(posthogKey, {
      api_host: posthogUrl,
      person_profiles: 'always',
      ...POSTHOG_PRIVACY_CONFIG,
    });
  }
}
export const CSPostHogProvider = ({ children }: { children: ReactNode }) => {
  useEffect(() => {
    if (!hasOptedOutTelemetry()) {
      posthog.register_for_session({
        $app_version: getAppVersion(),
      });
    }
  }, []);
  return <PostHogProvider client={posthog}>{children}</PostHogProvider>;
};
