import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getAccessTokenMock } = vi.hoisted(() => ({
  getAccessTokenMock: vi.fn(),
}));

vi.mock('@/utils/access', () => ({
  getAccessToken: getAccessTokenMock,
}));

const ink = {
  plan: {
    name: 'author',
    allowance: 100,
    available: 87,
    reserved: 1,
    periodStartedAt: '2026-08-01T00:00:00.000Z',
    resetsAt: '2026-09-01T00:00:00.000Z',
  },
  purchased: {
    available: 25,
    reserved: 0,
    expiresAt: null,
  },
  totalAvailable: 112,
  totalReserved: 1,
};

describe('StoryBored reader billing client', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_STORYBORED_API_BASE_URL', 'https://api.storybored.test/');
    getAccessTokenMock.mockReset();
    getAccessTokenMock.mockResolvedValue('reader-access-token');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('loads and validates the catalog through the StoryBored API', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        items: [
          {
            key: 'author_monthly',
            kind: 'subscription',
            name: 'Author Monthly',
            description: '100 Ink each month',
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
            description: '100 Ink each month, billed yearly',
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
            description: '500 Ink each month',
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
            description: '500 Ink each month, billed yearly',
            amountCents: 29999,
            currency: 'usd',
            plan: 'publisher',
            interval: 'year',
            monthlyInk: 500,
          },
          {
            key: 'ink_25',
            kind: 'ink_top_up',
            name: '25 Ink',
            description: 'Permanent Ink',
            amountCents: 399,
            currency: 'usd',
            inkAmount: 25,
          },
          {
            key: 'ink_100',
            kind: 'ink_top_up',
            name: '100 Ink',
            description: 'Permanent Ink',
            amountCents: 1299,
            currency: 'usd',
            inkAmount: 100,
          },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { fetchBillingCatalog } = await import('@/libs/payment/stripe/client');

    const catalog = await fetchBillingCatalog();

    expect(catalog.items.map((item) => item.key)).toEqual([
      'author_monthly',
      'author_yearly',
      'publisher_monthly',
      'publisher_yearly',
      'ink_25',
      'ink_100',
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.storybored.test/v1/billing/catalog',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer reader-access-token' }),
      }),
    );
  });

  it('loads the StoryBored subscription and Ink account together', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          customer: { exists: true },
          subscription: {
            plan: 'author',
            interval: 'year',
            status: 'active',
            cancelAtPeriodEnd: false,
            currentPeriodStartedAt: '2026-08-01T00:00:00.000Z',
            currentPeriodEndsAt: '2027-08-01T00:00:00.000Z',
            paidThroughAt: '2027-08-01T00:00:00.000Z',
          },
          ink,
        }),
      ),
    );
    const { fetchBillingAccount } = await import('@/libs/payment/stripe/client');

    const account = await fetchBillingAccount();

    expect(account.customer.exists).toBe(true);
    expect(account.subscription).toMatchObject({ plan: 'author', interval: 'year' });
    expect(account.ink).toEqual(ink);
  });

  it('rejects subscription states outside the shared Stripe status contract', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          customer: { exists: true },
          subscription: {
            plan: 'author',
            interval: 'month',
            status: 'mystery_status',
            cancelAtPeriodEnd: false,
            currentPeriodStartedAt: '2026-08-01T00:00:00.000Z',
            currentPeriodEndsAt: '2026-09-01T00:00:00.000Z',
          },
          ink,
        }),
      ),
    );
    const { fetchBillingAccount } = await import('@/libs/payment/stripe/client');

    await expect(fetchBillingAccount()).rejects.toThrow(/subscription[\s\S]*status/);
  });

  it('creates hosted checkout using only an allowlisted catalog key', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        checkoutSessionId: 'cs_test_storybored',
        checkoutUrl: 'https://checkout.stripe.test/c/pay/cs_test_storybored',
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { createBillingCheckoutSession } = await import('@/libs/payment/stripe/client');

    await expect(createBillingCheckoutSession('ink_100')).resolves.toEqual({
      checkoutSessionId: 'cs_test_storybored',
      checkoutUrl: 'https://checkout.stripe.test/c/pay/cs_test_storybored',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.storybored.test/v1/billing/checkout',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ catalogItemKey: 'ink_100' }),
      }),
    );
  });

  it('rejects arbitrary Stripe price IDs before networking', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { createBillingCheckoutSession } = await import('@/libs/payment/stripe/client');

    await expect(
      createBillingCheckoutSession('price_attacker_controlled' as 'author_monthly'),
    ).rejects.toThrow('Unknown StoryBored billing item.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('creates portal sessions and reads checkout status without fulfilling it', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ portalUrl: 'https://billing.stripe.test/session/test' }),
      )
      .mockResolvedValueOnce(
        Response.json({
          checkoutSessionId: 'cs_test_status',
          catalogItemKey: 'publisher_yearly',
          kind: 'subscription',
          status: 'fulfilled',
          fulfilled: true,
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const { createBillingPortalSession, fetchBillingCheckoutStatus } =
      await import('@/libs/payment/stripe/client');

    await expect(createBillingPortalSession()).resolves.toEqual({
      portalUrl: 'https://billing.stripe.test/session/test',
    });
    await expect(fetchBillingCheckoutStatus('cs_test_status')).resolves.toMatchObject({
      status: 'fulfilled',
      fulfilled: true,
    });
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      'https://api.storybored.test/v1/billing/checkout/cs_test_status',
    );
    expect(fetchMock.mock.calls[1]?.[1]).not.toMatchObject({ method: 'POST' });
  });

  it('fails closed when authentication is unavailable', async () => {
    getAccessTokenMock.mockResolvedValue(null);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { fetchBillingAccount } = await import('@/libs/payment/stripe/client');

    await expect(fetchBillingAccount()).rejects.toThrow('StoryBored authentication is required.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects HTTPS redirects outside the exact hosted Stripe origins', async () => {
    const { redirectToHostedBilling } = await import('@/libs/payment/stripe/client');

    await expect(
      redirectToHostedBilling('https://checkout.stripe.com.attacker.example/session'),
    ).rejects.toThrow('approved Stripe host');
    await expect(
      redirectToHostedBilling('https://billing.stripe.com.attacker.example/session'),
    ).rejects.toThrow('approved Stripe host');
  });

  it('rejects hosted Stripe URLs containing embedded credentials', async () => {
    const { redirectToHostedBilling } = await import('@/libs/payment/stripe/client');

    await expect(
      redirectToHostedBilling('https://reader:secret@checkout.stripe.com/session'),
    ).rejects.toThrow('must not include credentials');
    await expect(
      redirectToHostedBilling('https://reader:secret@billing.stripe.com/session'),
    ).rejects.toThrow('must not include credentials');
  });
});
