import { describe, expect, it } from 'vitest';
import {
  getBillingCheckoutDisplayStatus,
  getBillingCheckoutFailureRecovery,
  getStripeCheckoutSuccessPath,
  isStripeCheckoutReturn,
} from '@/app/user/subscription/success/checkout-status';
import type { BillingCheckoutStatusResponse } from '@/libs/payment/stripe/client';

const checkout = (
  status: BillingCheckoutStatusResponse['status'],
  fulfilled = false,
): BillingCheckoutStatusResponse => ({
  checkoutSessionId: 'cs_test_storybored',
  catalogItemKey: 'author_monthly',
  kind: 'subscription',
  status,
  fulfilled,
});

describe('StoryBored checkout return contract', () => {
  it('uses both the Stripe discriminator and Checkout Session ID in the success URL', () => {
    expect(getStripeCheckoutSuccessPath('cs_test_storybored')).toBe(
      '/user/subscription/success?payment=stripe&session_id=cs_test_storybored',
    );
  });

  it('accepts only a Stripe return with a non-empty session ID', () => {
    expect(isStripeCheckoutReturn('stripe', 'cs_test_storybored')).toBe(true);
    expect(isStripeCheckoutReturn(null, 'cs_test_storybored')).toBe(false);
    expect(isStripeCheckoutReturn('stripe', '   ')).toBe(false);
    expect(isStripeCheckoutReturn('iap', 'cs_test_storybored')).toBe(false);
  });

  it('waits only for pending server fulfillment states', () => {
    expect(getBillingCheckoutDisplayStatus(checkout('pending'))).toBe('processing');
    expect(getBillingCheckoutDisplayStatus(checkout('processing'))).toBe('processing');
  });

  it('shows success only after the server marks checkout fulfilled', () => {
    expect(getBillingCheckoutDisplayStatus(checkout('fulfilled', true))).toBe('completed');
    expect(getBillingCheckoutDisplayStatus(checkout('fulfilled', false))).toBe('failed');
    expect(getBillingCheckoutDisplayStatus(checkout('failed'))).toBe('failed');
    expect(getBillingCheckoutDisplayStatus(checkout('expired'))).toBe('failed');
    expect(getBillingCheckoutDisplayStatus(checkout('refunded'))).toBe('failed');
    expect(getBillingCheckoutDisplayStatus(checkout('disputed'))).toBe('failed');
  });

  it('returns terminal Stripe checkout states to billing for a fresh payment action', () => {
    expect(getBillingCheckoutFailureRecovery(checkout('failed'))).toBe('return_to_billing');
    expect(getBillingCheckoutFailureRecovery(checkout('expired'))).toBe('return_to_billing');
    expect(getBillingCheckoutFailureRecovery(checkout('refunded'))).toBe('return_to_billing');
    expect(getBillingCheckoutFailureRecovery(checkout('disputed'))).toBe('return_to_billing');
    expect(getBillingCheckoutFailureRecovery(checkout('processing'))).toBeUndefined();
    expect(getBillingCheckoutFailureRecovery(checkout('fulfilled', true))).toBeUndefined();
  });
});
