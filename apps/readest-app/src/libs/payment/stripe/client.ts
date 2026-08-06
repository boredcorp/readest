import { createStoryBoredReaderClient } from '@/integrations/storybored/client';
import type {
  StoryBoredBillingCatalogItem,
  StoryBoredBillingCatalogItemKey,
  StoryBoredBillingCatalogResponse,
  StoryBoredBillingCheckoutResponse,
  StoryBoredBillingCheckoutStatus,
  StoryBoredBillingCheckoutStatusResponse,
  StoryBoredBillingInterval,
  StoryBoredBillingPortalResponse,
  StoryBoredMeBillingResponse,
  StoryBoredStripeSubscriptionStatus,
} from '@/integrations/storybored/types';
import { isTauriAppPlatform } from '@/services/environment';
import { getAccessToken } from '@/utils/access';
import { captureEvent } from '@/utils/telemetry';

/**
 * Stable public catalog identifiers. The reader never accepts a Stripe Price ID;
 * the StoryBored API maps these keys to its own test-mode Stripe catalog.
 */
export const BILLING_CATALOG_ITEM_KEYS = [
  'author_monthly',
  'author_yearly',
  'publisher_monthly',
  'publisher_yearly',
  'ink_25',
  'ink_100',
] as const satisfies readonly StoryBoredBillingCatalogItemKey[];

export type BillingCatalogItemKey = StoryBoredBillingCatalogItemKey;
export type BillingInterval = StoryBoredBillingInterval;
export type BillingCatalogItem = StoryBoredBillingCatalogItem;
export type BillingCatalogResponse = StoryBoredBillingCatalogResponse;
export type BillingCheckoutResponse = StoryBoredBillingCheckoutResponse;
export type BillingPortalResponse = StoryBoredBillingPortalResponse;
export type BillingCheckoutStatus = StoryBoredBillingCheckoutStatus;
export type BillingCheckoutStatusResponse = StoryBoredBillingCheckoutStatusResponse;
export type BillingAccountResponse = StoryBoredMeBillingResponse;
export type BillingCatalogItemKind = BillingCatalogItem['kind'];
export type StoryBoredPlan = BillingAccountResponse['ink']['plan']['name'];
export type BillingSubscription = NonNullable<BillingAccountResponse['subscription']>;
export type StripeSubscriptionStatus = StoryBoredStripeSubscriptionStatus;

const catalogItemKeySet = new Set<string>(BILLING_CATALOG_ITEM_KEYS);
const approvedHostedBillingOrigins = new Set([
  'https://checkout.stripe.com',
  'https://billing.stripe.com',
]);

function isCatalogItemKey(value: unknown): value is BillingCatalogItemKey {
  return typeof value === 'string' && catalogItemKeySet.has(value);
}

async function getAuthenticatedBillingClient() {
  const token = await getAccessToken();
  if (!token) throw new Error('StoryBored authentication is required.');
  return createStoryBoredReaderClient({ accessToken: token });
}

export async function fetchBillingCatalog(): Promise<BillingCatalogResponse> {
  const client = await getAuthenticatedBillingClient();
  return await client.getBillingCatalog();
}

export async function fetchBillingAccount(): Promise<BillingAccountResponse> {
  const client = await getAuthenticatedBillingClient();
  return await client.getMeBilling();
}

export async function createBillingCheckoutSession(
  catalogItemKey: BillingCatalogItemKey,
): Promise<BillingCheckoutResponse> {
  if (!isCatalogItemKey(catalogItemKey)) {
    throw new Error('Unknown StoryBored billing item.');
  }
  const client = await getAuthenticatedBillingClient();
  return await client.createBillingCheckout({ catalogItemKey });
}

export async function createBillingPortalSession(): Promise<BillingPortalResponse> {
  const client = await getAuthenticatedBillingClient();
  return await client.createBillingPortal();
}

export async function fetchBillingCheckoutStatus(
  checkoutSessionId: string,
): Promise<BillingCheckoutStatusResponse> {
  if (!checkoutSessionId.trim()) throw new Error('Checkout session ID is required.');
  const client = await getAuthenticatedBillingClient();
  return await client.getBillingCheckout(checkoutSessionId);
}

/** Opens only Stripe-hosted Checkout and customer-portal URLs returned by StoryBored. */
export async function redirectToHostedBilling(url: string): Promise<void> {
  const target = new URL(url);
  if (!approvedHostedBillingOrigins.has(target.origin)) {
    throw new Error('Billing URL must use an approved Stripe host.');
  }
  if (target.username || target.password) {
    throw new Error('Billing URL must not include credentials.');
  }

  if (isTauriAppPlatform()) {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(target.toString());
    return;
  }

  window.location.assign(target.toString());
}

export function handleBillingCheckoutError(_error: unknown): void {
  console.error('StoryBored checkout failed');
  captureEvent('checkout_error', { failureCode: 'storybored_checkout_failed' });
}
