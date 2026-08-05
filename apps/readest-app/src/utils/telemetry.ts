import posthog from 'posthog-js';
import { getLearningBoredPrivateBetaPolicy } from '@/integrations/learningbored/private-beta-policy';

const privateBetaPolicy = getLearningBoredPrivateBetaPolicy();

export const TELEMETRY_OPT_OUT_KEY = 'readest-telemetry-opt-out';

export const hasOptedOutTelemetry = () => {
  return (
    !privateBetaPolicy.allowTelemetry || localStorage.getItem(TELEMETRY_OPT_OUT_KEY) === 'true'
  );
};

export const captureEvent = (event: string, properties?: Record<string, unknown>) => {
  if (privateBetaPolicy.allowTelemetry && !hasOptedOutTelemetry()) {
    posthog.capture(event, properties);
  }
};

export const optInTelemetry = () => {
  if (!privateBetaPolicy.allowTelemetry) {
    localStorage.setItem(TELEMETRY_OPT_OUT_KEY, 'true');
    return;
  }
  localStorage.setItem(TELEMETRY_OPT_OUT_KEY, 'false');
  posthog.opt_in_capturing();
};
export const optOutTelemetry = () => {
  localStorage.setItem(TELEMETRY_OPT_OUT_KEY, 'true');
  if (privateBetaPolicy.allowTelemetry) {
    posthog.opt_out_capturing();
  }
};
