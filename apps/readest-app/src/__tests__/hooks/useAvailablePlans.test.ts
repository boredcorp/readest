import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAvailablePlans } from '@/hooks/useAvailablePlans';
import type { BillingAccountResponse, BillingCatalogResponse } from '@/libs/payment/stripe/client';

const { fetchBillingAccountMock, fetchBillingCatalogMock } = vi.hoisted(() => ({
  fetchBillingAccountMock: vi.fn(),
  fetchBillingCatalogMock: vi.fn(),
}));

vi.mock('@/libs/payment/stripe/client', () => ({
  fetchBillingAccount: fetchBillingAccountMock,
  fetchBillingCatalog: fetchBillingCatalogMock,
}));

vi.mock('@/utils/misc', () => ({
  stubTranslation: (key: string) => key,
}));

const catalog: BillingCatalogResponse = { items: [] };
const paidCatalog: BillingCatalogResponse = {
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
  ],
};

function billingAccount(totalAvailable: number): BillingAccountResponse {
  return {
    customer: { exists: false },
    subscription: null,
    ink: {
      plan: {
        name: 'reader',
        allowance: 10,
        available: Math.min(totalAvailable, 10),
        reserved: 0,
        periodStartedAt: '2026-08-01T00:00:00.000Z',
        resetsAt: '2026-09-01T00:00:00.000Z',
      },
      purchased: {
        available: Math.max(0, totalAvailable - 10),
        reserved: 0,
        expiresAt: null,
      },
      totalAvailable,
      totalReserved: 0,
    },
  };
}

function paidBillingAccount(): BillingAccountResponse {
  return {
    customer: { exists: true },
    subscription: {
      plan: 'author',
      interval: 'month',
      status: 'active',
      cancelAtPeriodEnd: false,
      currentPeriodStartedAt: '2026-08-01T00:00:00.000Z',
      currentPeriodEndsAt: '2026-09-01T00:00:00.000Z',
      paidThroughAt: '2026-09-01T00:00:00.000Z',
    },
    ink: {
      plan: {
        name: 'author',
        allowance: 100,
        available: 87,
        reserved: 1,
        periodStartedAt: '2026-08-01T00:00:00.000Z',
        resetsAt: '2026-09-01T00:00:00.000Z',
      },
      purchased: { available: 25, reserved: 0, expiresAt: null },
      totalAvailable: 112,
      totalReserved: 1,
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('useAvailablePlans identity isolation', () => {
  beforeEach(() => {
    fetchBillingAccountMock.mockReset();
    fetchBillingCatalogMock.mockReset();
  });

  it('hides the previous account immediately when the authenticated identity changes', async () => {
    const secondCatalog = deferred<BillingCatalogResponse>();
    const secondAccount = deferred<BillingAccountResponse>();
    fetchBillingCatalogMock
      .mockResolvedValueOnce(catalog)
      .mockReturnValueOnce(secondCatalog.promise);
    fetchBillingAccountMock
      .mockResolvedValueOnce(billingAccount(10))
      .mockReturnValueOnce(secondAccount.promise);

    const initialProps: { enabled: boolean; identityKey: string | null } = {
      enabled: true,
      identityKey: 'user-a:token-a',
    };
    const { result, rerender } = renderHook(
      ({ enabled, identityKey }: { enabled: boolean; identityKey: string | null }) =>
        useAvailablePlans({ enabled, identityKey }),
      { initialProps },
    );

    await waitFor(() => expect(result.current.billingAccount?.ink.totalAvailable).toBe(10));

    rerender({ enabled: true, identityKey: 'user-b:token-b' });

    expect(result.current.billingAccount).toBeNull();
    expect(result.current.availablePlans).toEqual([]);
    expect(result.current.loading).toBe(true);

    await act(async () => {
      secondCatalog.resolve(catalog);
      secondAccount.resolve(billingAccount(25));
      await Promise.all([secondCatalog.promise, secondAccount.promise]);
    });

    await waitFor(() => expect(result.current.billingAccount?.ink.totalAvailable).toBe(25));

    rerender({ enabled: false, identityKey: null });
    expect(result.current.billingAccount).toBeNull();
    expect(result.current.availablePlans).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('retains the last authoritative paid account after a same-identity refresh failure', async () => {
    fetchBillingCatalogMock.mockResolvedValueOnce(paidCatalog);
    fetchBillingAccountMock.mockResolvedValueOnce(paidBillingAccount());

    const { result } = renderHook(() =>
      useAvailablePlans({ enabled: true, identityKey: 'paid-user:token-a' }),
    );

    await waitFor(() => expect(result.current.billingAccount?.subscription?.plan).toBe('author'));
    expect(result.current.availablePlans).toEqual(paidCatalog.items);

    fetchBillingCatalogMock.mockRejectedValueOnce(new Error('temporary catalog outage'));
    fetchBillingAccountMock.mockRejectedValueOnce(new Error('temporary account outage'));

    await act(async () => {
      await result.current.refreshBilling();
    });

    expect(result.current.error?.message).toBe('temporary catalog outage');
    expect(result.current.billingAccount?.subscription?.plan).toBe('author');
    expect(result.current.billingAccount?.ink.totalAvailable).toBe(112);
    expect(result.current.availablePlans).toEqual(paidCatalog.items);
  });
});
