import { describe, expect, it } from 'vitest';
import {
  getInkTopUpDetails,
  getNativePlanBadgeDetails,
  getPlanDetails,
} from '@/app/user/utils/plan';
import type { BillingCatalogItem } from '@/libs/payment/stripe/client';

const catalog: BillingCatalogItem[] = [
  {
    key: 'author_monthly',
    kind: 'subscription',
    name: 'Author Monthly',
    description: 'Author plan billed monthly',
    amountCents: 999,
    currency: 'usd',
    plan: 'author',
    interval: 'month',
    monthlyInk: 100,
  },
  {
    key: 'author_yearly',
    kind: 'subscription',
    name: 'Author Yearly',
    description: 'Author plan billed yearly',
    amountCents: 8999,
    currency: 'usd',
    plan: 'author',
    interval: 'year',
    monthlyInk: 100,
  },
  {
    key: 'publisher_monthly',
    kind: 'subscription',
    name: 'Publisher Monthly',
    description: 'Publisher plan billed monthly',
    amountCents: 2999,
    currency: 'usd',
    plan: 'publisher',
    interval: 'month',
    monthlyInk: 500,
  },
  {
    key: 'publisher_yearly',
    kind: 'subscription',
    name: 'Publisher Yearly',
    description: 'Publisher plan billed yearly',
    amountCents: 29999,
    currency: 'usd',
    plan: 'publisher',
    interval: 'year',
    monthlyInk: 500,
  },
  {
    key: 'ink_100',
    kind: 'ink_top_up',
    name: '100 Ink',
    description: 'One hundred permanent Ink',
    amountCents: 1299,
    currency: 'usd',
    inkAmount: 100,
  },
  {
    key: 'ink_25',
    kind: 'ink_top_up',
    name: '25 Ink',
    description: 'Twenty-five permanent Ink',
    amountCents: 399,
    currency: 'usd',
    inkAmount: 25,
  },
];

describe('StoryBored billing plan details', () => {
  it('describes Reader as the free 10-Ink plan', () => {
    const plan = getPlanDetails('reader', catalog);

    expect(plan.name).toBe('Reader Plan');
    expect(plan.price).toBe(0);
    expect(plan.limits?.['Monthly Ink']).toBe(10);
    expect(plan.catalogItemKey).toBeUndefined();
  });

  it('selects the exact monthly and yearly Author catalog entries', () => {
    const monthly = getPlanDetails('author', catalog, 'month');
    const yearly = getPlanDetails('author', catalog, 'year');

    expect(monthly).toMatchObject({
      price: 999,
      catalogItemKey: 'author_monthly',
      interval: 'month',
    });
    expect(yearly).toMatchObject({
      price: 8999,
      catalogItemKey: 'author_yearly',
      interval: 'year',
    });
    expect(yearly.limits?.['Monthly Ink']).toBe(100);
  });

  it('selects the exact monthly and yearly Publisher catalog entries', () => {
    const monthly = getPlanDetails('publisher', catalog, 'month');
    const yearly = getPlanDetails('publisher', catalog, 'year');

    expect(monthly).toMatchObject({
      price: 2999,
      catalogItemKey: 'publisher_monthly',
    });
    expect(yearly).toMatchObject({
      price: 29999,
      catalogItemKey: 'publisher_yearly',
    });
    expect(yearly.limits?.['Monthly Ink']).toBe(500);
  });

  it('does not enable checkout when the API catalog entry is missing', () => {
    const plan = getPlanDetails('author', [], 'month');

    expect(plan.price).toBe(999);
    expect(plan.catalogItemKey).toBeUndefined();
  });

  it('builds ordered, non-expiring 25 and 100 Ink packs', () => {
    const toSortedDescriptor = Object.getOwnPropertyDescriptor(Array.prototype, 'toSorted');
    Object.defineProperty(Array.prototype, 'toSorted', {
      configurable: true,
      value: undefined,
      writable: true,
    });

    let topUps: ReturnType<typeof getInkTopUpDetails>;
    try {
      topUps = getInkTopUpDetails(catalog);
    } finally {
      if (toSortedDescriptor) {
        Object.defineProperty(Array.prototype, 'toSorted', toSortedDescriptor);
      } else {
        delete (Array.prototype as { toSorted?: unknown }).toSorted;
      }
    }

    expect(topUps.type).toBe('ink_top_up');
    expect(topUps.products?.map((product) => [product.key, product.price])).toEqual([
      ['ink_25', 399],
      ['ink_100', 1299],
    ]);
    expect(topUps.features.map((feature) => feature.label)).toContain(
      'Purchased Ink never expires',
    );
  });

  it('preserves the native IAP plan identity in the profile badge', () => {
    expect(getNativePlanBadgeDetails('plus')).toEqual({
      name: 'Plus Plan',
      color: 'bg-blue-200 text-blue-800',
    });
    expect(getNativePlanBadgeDetails('pro')).toEqual({
      name: 'Pro Plan',
      color: 'bg-purple-200 text-purple-800',
    });
  });
});
