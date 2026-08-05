import posthog from 'posthog-js';
import Stripe from 'stripe';
import { loadStripe, Stripe as StripeClient } from '@stripe/stripe-js';
import { getAPIBaseUrl, isTauriAppPlatform, isWebAppPlatform } from '@/services/environment';
import { openUrl } from '@tauri-apps/plugin-opener';
import { getAccessToken } from '@/utils/access';
import { StripeProductMetadata } from '@/types/payment';
import { AvailablePlan, PlanType } from '@/types/quota';
import {
  LEARNINGBORED_PRIVATE_BETA_DISABLED_MESSAGE,
  getLearningBoredPrivateBetaPolicy,
} from '@/integrations/learningbored/private-beta-policy';

const privateBetaPolicy = getLearningBoredPrivateBetaPolicy();

function assertPaymentsEnabled(): void {
  if (!privateBetaPolicy.allowPayments) {
    throw new Error(LEARNINGBORED_PRIVATE_BETA_DISABLED_MESSAGE);
  }
}

let stripePromise: Promise<StripeClient | null>;

export const getStripe = () => {
  assertPaymentsEnabled();
  if (!stripePromise) {
    const publishableKey =
      process.env.NODE_ENV === 'production'
        ? process.env['NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_BASE64']
        : process.env['NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_DEV_BASE64'];
    stripePromise = loadStripe(atob(publishableKey!));
  }
  return stripePromise;
};

const WEB_STRIPE_PLANS_URL = `${getAPIBaseUrl()}/stripe/plans`;
const WEB_STRIPE_CHECKOUT_URL = `${getAPIBaseUrl()}/stripe/checkout`;
const WEB_STRIPE_PORTAL_URL = `${getAPIBaseUrl()}/stripe/portal`;
const SUBSCRIPTION_SUCCESS_PATH = '/user/subscription/success';

export interface StripeCheckoutResponse {
  sessionId?: string;
  clientSecret?: string;
  url?: string;
}

export type StripeAvailablePlan = AvailablePlan & {
  metadata?: StripeProductMetadata;
  product?: Stripe.Product;
};

export const fetchStripePlans = async () => {
  assertPaymentsEnabled();
  const response = await fetch(WEB_STRIPE_PLANS_URL);
  const data = await response.json();
  return data && Array.isArray(data) ? data : [];
};

export const createStripeCheckoutSession = async (
  productId: string,
  planType: PlanType = 'subscription',
): Promise<StripeCheckoutResponse> => {
  assertPaymentsEnabled();
  const token = await getAccessToken();
  const isEmbeddedCheckout = isTauriAppPlatform();

  const response = await fetch(WEB_STRIPE_CHECKOUT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ priceId: productId, planType, embedded: isEmbeddedCheckout }),
  });

  if (!response.ok) {
    throw new Error('Failed to create Stripe checkout session');
  }

  return response.json();
};

export const redirectToStripeCheckout = async (url?: string): Promise<void> => {
  assertPaymentsEnabled();
  if (url) {
    if (isWebAppPlatform()) {
      window.location.href = url;
    } else if (isTauriAppPlatform()) {
      await openUrl(url);
    }
  } else {
    throw new Error('No checkout URL returned from the Stripe API');
  }
};

export const createStripePortalSession = async () => {
  assertPaymentsEnabled();
  const token = await getAccessToken();

  const response = await fetch(WEB_STRIPE_PORTAL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error);
  }

  return data.url;
};

export const redirectToStripePortal = async (url: string): Promise<void> => {
  assertPaymentsEnabled();
  if (isWebAppPlatform()) {
    window.location.href = url;
  } else if (isTauriAppPlatform()) {
    await openUrl(url);
  }
};

export const handleStripeCheckoutError = (error: string) => {
  console.error(error);
  if (privateBetaPolicy.allowTelemetry) {
    posthog.capture('checkout_error', { error });
  }
};

export const getSubscriptionSuccessUrl = (sessionId: string) => {
  const params = new URLSearchParams({
    payment: 'stripe',
    session_id: sessionId,
  });
  return `${SUBSCRIPTION_SUCCESS_PATH}?${params.toString()}`;
};
