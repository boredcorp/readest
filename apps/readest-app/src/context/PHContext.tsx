'use client';

import posthog from 'posthog-js';
import { ReactNode, useEffect } from 'react';
import { PostHogProvider } from 'posthog-js/react';
import { TELEMETRY_OPT_OUT_KEY } from '@/utils/telemetry';
import { getAppVersion } from '@/utils/version';
import { getLearningBoredPrivateBetaPolicy } from '@/integrations/learningbored/private-beta-policy';

const privateBetaPolicy = getLearningBoredPrivateBetaPolicy();

const shouldDisablePostHog = () => {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(TELEMETRY_OPT_OUT_KEY) === 'true';
};

const posthogUrl = privateBetaPolicy.allowTelemetry
  ? process.env['NEXT_PUBLIC_POSTHOG_HOST'] ||
    atob(process.env['NEXT_PUBLIC_DEFAULT_POSTHOG_URL_BASE64']!)
  : '';
const posthogKey = privateBetaPolicy.allowTelemetry
  ? process.env['NEXT_PUBLIC_POSTHOG_KEY'] ||
    atob(process.env['NEXT_PUBLIC_DEFAULT_POSTHOG_KEY_BASE64']!)
  : '';

if (
  privateBetaPolicy.allowTelemetry &&
  typeof window !== 'undefined' &&
  process.env['NODE_ENV'] === 'production' &&
  posthogKey
) {
  if (!shouldDisablePostHog()) {
    posthog.init(posthogKey, {
      api_host: posthogUrl,
      person_profiles: 'always',
      autocapture: false,
    });
  }
}
export const CSPostHogProvider = ({ children }: { children: ReactNode }) => {
  useEffect(() => {
    if (!privateBetaPolicy.allowTelemetry) return;
    posthog.register_for_session({
      $app_version: getAppVersion(),
    });
  }, []);
  if (!privateBetaPolicy.allowTelemetry) {
    return <>{children}</>;
  }
  return <PostHogProvider client={posthog}>{children}</PostHogProvider>;
};
