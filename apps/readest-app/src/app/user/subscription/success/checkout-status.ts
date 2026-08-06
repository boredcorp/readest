import type { BillingCheckoutStatusResponse } from '@/libs/payment/stripe/client';

export type BillingCheckoutDisplayStatus = 'completed' | 'processing' | 'failed';

export function getBillingCheckoutDisplayStatus(
  checkout: BillingCheckoutStatusResponse,
): BillingCheckoutDisplayStatus {
  if (checkout.status === 'fulfilled' && checkout.fulfilled) return 'completed';
  if (checkout.status === 'pending' || checkout.status === 'processing') return 'processing';
  return 'failed';
}

export function getBillingCheckoutFailureRecovery(
  checkout: BillingCheckoutStatusResponse,
): 'return_to_billing' | undefined {
  return getBillingCheckoutDisplayStatus(checkout) === 'failed' ? 'return_to_billing' : undefined;
}

export function isStripeCheckoutReturn(
  payment: string | null | undefined,
  checkoutSessionId: string | null | undefined,
): checkoutSessionId is string {
  return payment === 'stripe' && Boolean(checkoutSessionId?.trim());
}

export function getStripeCheckoutSuccessPath(checkoutSessionId: string): string {
  const params = new URLSearchParams({
    payment: 'stripe',
    session_id: checkoutSessionId,
  });
  return `/user/subscription/success?${params.toString()}`;
}
