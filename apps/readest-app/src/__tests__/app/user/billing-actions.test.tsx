import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import AccountActions from '@/app/user/components/AccountActions';
import BillingPlanChooser from '@/app/user/components/BillingPlanChooser';
import StoryBoredBetaBillingNotice, {
  StoryBoredStripeSandboxNotice,
} from '@/app/user/components/StoryBoredBetaBillingNotice';
import PlanActionButton from '@/app/user/components/PlanActionButton';
import NativeIAPPlans from '@/app/user/components/NativeIAPPlans';
import PurchaseCallToActions from '@/app/user/components/PurchaseCallToActions';
import UsageStats from '@/app/user/components/UsageStats';
import UserInfo from '@/app/user/components/UserInfo';
import CheckoutFailureContent from '@/app/user/subscription/success/CheckoutFailureContent';
import { getInkTopUpDetails, getPlanDetails } from '@/app/user/utils/plan';
import type { BillingCatalogItem } from '@/libs/payment/stripe/client';
import type { AvailablePlan } from '@/types/quota';

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string, values?: Record<string, string>) =>
    values?.['plan'] ? key.replace('{{plan}}', values['plan']) : key,
}));

const { appServiceMock } = vi.hoisted(() => ({ appServiceMock: { hasIAP: true } }));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ appService: appServiceMock }),
}));

beforeEach(() => {
  appServiceMock.hasIAP = true;
});

afterEach(() => cleanup());

const catalog: BillingCatalogItem[] = [
  {
    key: 'author_monthly',
    kind: 'subscription',
    name: 'Author Monthly',
    description: 'Author plan',
    amountCents: 999,
    currency: 'usd',
    plan: 'author',
    interval: 'month',
    monthlyInk: 100,
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
  {
    key: 'ink_25',
    kind: 'ink_top_up',
    name: '25 Ink',
    description: 'Permanent Ink',
    amountCents: 399,
    currency: 'usd',
    inkAmount: 25,
  },
];

const iapPlans: AvailablePlan[] = [
  {
    plan: 'plus',
    productId: 'com.bilingify.readest.monthly.plus',
    price: 499,
    currency: 'USD',
    interval: 'month',
    productName: 'Readest Plus',
  },
  {
    plan: 'pro',
    productId: 'com.bilingify.readest.monthly.pro',
    price: 999,
    currency: 'USD',
    interval: 'month',
    productName: 'Readest Pro',
  },
  {
    plan: 'purchase',
    productId: 'com.bilingify.readest.storage.1gb.purchase',
    price: 999,
    currency: 'USD',
    interval: 'lifetime',
    productName: '1 GB Storage',
  },
];

describe('StoryBored billing actions', () => {
  it('warns before beta checkout and keeps team plans unavailable', () => {
    render(<StoryBoredBetaBillingNotice />);

    expect(screen.getByText(/Stripe sandbox/i)).toBeTruthy();
    expect(screen.getByText(/no real charges/i)).toBeTruthy();
    expect(screen.getByText(/Team and Education plans are coming soon/i)).toBeTruthy();
    expect(screen.getByText(/not available during the private beta/i)).toBeTruthy();
  });

  it('renders a compact Stripe sandbox warning on checkout return surfaces', () => {
    render(<StoryBoredStripeSandboxNotice />);

    expect(screen.getByText(/Stripe sandbox/i)).toBeTruthy();
    expect(screen.getByText(/no real charges/i)).toBeTruthy();
    expect(screen.queryByText(/Team and Education plans/i)).toBeNull();
  });

  it('keeps the checkout return free of upstream or unapproved contact details', () => {
    const successPageSource = readFileSync(
      resolve(process.cwd(), 'src/app/user/subscription/success/page.tsx'),
      'utf8',
    );
    const errorPageSource = readFileSync(resolve(process.cwd(), 'src/app/error.tsx'), 'utf8');
    const checkoutFailureSource = readFileSync(
      resolve(process.cwd(), 'src/app/user/subscription/success/CheckoutFailureContent.tsx'),
      'utf8',
    );
    const readerSupportCopy = `${successPageSource}\n${errorPageSource}\n${checkoutFailureSource}`;

    expect(readerSupportCopy).not.toMatch(
      /support@readest\.com|mailto:|contact support|team has been notified/i,
    );
    expect(readerSupportCopy).toMatch(/approved beta support channel/i);
    expect(successPageSource).toMatch(/StoryBoredStripeSandboxNotice/);
    expect(successPageSource).toMatch(/isStripePayment/);
    expect(successPageSource).toMatch(/Stripe Test Purchase Confirmed/);
    expect(successPageSource).toMatch(/Stripe Test Subscription Confirmed/);
    expect(successPageSource).toMatch(/No real charge was made/);
  });

  it('starts checkout with the stable catalog key for a Reader upgrade', () => {
    const onCheckout = vi.fn();

    render(
      <PlanActionButton
        plan={getPlanDetails('author', catalog, 'month')}
        currentPlan='reader'
        hasActiveSubscription={false}
        onCheckout={onCheckout}
        onManageSubscription={vi.fn()}
        onSelectPlan={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Choose Author Plan' }));

    expect(onCheckout).toHaveBeenCalledOnce();
    expect(onCheckout).toHaveBeenCalledWith('author_monthly');
  });

  it('sends existing subscribers to the portal instead of opening a second subscription', () => {
    const onCheckout = vi.fn();
    const onManageSubscription = vi.fn();

    render(
      <PlanActionButton
        plan={getPlanDetails('publisher', [], 'year')}
        currentPlan='author'
        hasActiveSubscription
        onCheckout={onCheckout}
        onManageSubscription={onManageSubscription}
        onSelectPlan={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Change plan in billing portal' }));

    expect(onManageSubscription).toHaveBeenCalledOnce();
    expect(onCheckout).not.toHaveBeenCalled();
  });

  it('renders both permanent Ink packs and submits only their stable keys', () => {
    const onCheckout = vi.fn();

    render(<PurchaseCallToActions plan={getInkTopUpDetails(catalog)} onCheckout={onCheckout} />);
    fireEvent.click(screen.getByRole('button', { name: /25 Ink/ }));
    fireEvent.click(screen.getByRole('button', { name: /100 Ink/ }));

    expect(onCheckout.mock.calls).toEqual([['ink_25'], ['ink_100']]);
  });

  it('keeps native subscriptions and one-time purchases on the IAP product path', () => {
    const onPurchase = vi.fn();

    render(<NativeIAPPlans availablePlans={iapPlans} currentPlan='free' onPurchase={onPurchase} />);
    fireEvent.click(screen.getByRole('button', { name: 'Upgrade to Readest Plus' }));
    fireEvent.click(screen.getByRole('button', { name: /1 GB Storage/ }));

    expect(onPurchase.mock.calls).toEqual([
      ['com.bilingify.readest.monthly.plus'],
      ['com.bilingify.readest.storage.1gb.purchase'],
    ]);
  });

  it('keeps native subscription management on the IAP restore path', () => {
    render(
      <AccountActions
        billingCustomerExists
        iapAvailable
        onLogout={vi.fn()}
        onResetPassword={vi.fn()}
        onUpdateEmail={vi.fn()}
        onConfirmDelete={vi.fn()}
        onRestorePurchase={vi.fn()}
        onManageSubscription={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Restore Purchase' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Manage Subscription' })).toBeNull();
  });

  it('offers the Stripe portal only on non-IAP builds', () => {
    appServiceMock.hasIAP = false;

    render(
      <AccountActions
        billingCustomerExists
        iapAvailable={false}
        onLogout={vi.fn()}
        onResetPassword={vi.fn()}
        onUpdateEmail={vi.fn()}
        onConfirmDelete={vi.fn()}
        onRestorePurchase={vi.fn()}
        onManageSubscription={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Restore Purchase' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Manage Subscription' })).toBeTruthy();
  });

  it('keeps native store failures on a retryable IAP-only surface', () => {
    const onRetry = vi.fn();

    const { rerender } = render(
      <BillingPlanChooser
        hasNativeIAP
        nativeIAPStatus='unavailable'
        nativePlans={[]}
        currentNativePlan='free'
        onNativePurchase={vi.fn()}
        onRetryNativeIAP={onRetry}
        stripeContent={<button>Open Stripe checkout</button>}
      />,
    );

    expect(screen.getByText('App Store purchases are temporarily unavailable.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Open Stripe checkout' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();

    rerender(
      <BillingPlanChooser
        hasNativeIAP={false}
        nativeIAPStatus='idle'
        nativePlans={[]}
        currentNativePlan='free'
        onNativePurchase={vi.fn()}
        onRetryNativeIAP={onRetry}
        stripeContent={<button>Open Stripe checkout</button>}
      />,
    );
    expect(screen.getByRole('button', { name: 'Open Stripe checkout' })).toBeTruthy();
  });

  it('suppresses Stripe portal management while native IAP is unavailable', () => {
    render(
      <AccountActions
        billingCustomerExists
        iapAvailable={false}
        onLogout={vi.fn()}
        onResetPassword={vi.fn()}
        onUpdateEmail={vi.fn()}
        onConfirmDelete={vi.fn()}
        onRestorePurchase={vi.fn()}
        onManageSubscription={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Restore Purchase' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Manage Subscription' })).toBeNull();
  });

  it('shows purchase-specific copy and returns an expired Ink top-up to billing', () => {
    const onRetry = vi.fn();
    const onReturnToBilling = vi.fn();

    render(
      <CheckoutFailureContent
        planType='purchase'
        billingStatus='expired'
        recovery='return_to_billing'
        onRetry={onRetry}
        onReturnToBilling={onReturnToBilling}
      />,
    );

    expect(screen.getByText('Ink Purchase Expired')).toBeTruthy();
    expect(screen.getByText(/Ink purchase checkout expired before payment completed/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Try Again' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Back to Billing' }));
    expect(onReturnToBilling).toHaveBeenCalledOnce();
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('does not offer a lower native IAP tier as an upgrade', () => {
    const onPurchase = vi.fn();

    render(<NativeIAPPlans availablePlans={iapPlans} currentPlan='pro' onPurchase={onPurchase} />);

    const lowerTier = screen.getByRole('button', { name: 'Included in current plan' });
    expect((lowerTier as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(lowerTier);
    expect(onPurchase).not.toHaveBeenCalled();
    expect(
      (screen.getByRole('button', { name: 'Current Plan' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('matches the current-plan badge to both tier and billing interval', () => {
    const onManageSubscription = vi.fn();
    const { rerender } = render(
      <PlanActionButton
        plan={getPlanDetails('author', catalog, 'month')}
        currentPlan='author'
        currentSubscriptionInterval='year'
        hasActiveSubscription
        onCheckout={vi.fn()}
        onManageSubscription={onManageSubscription}
        onSelectPlan={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Change plan in billing portal' }));
    expect(onManageSubscription).toHaveBeenCalledOnce();

    rerender(
      <PlanActionButton
        plan={getPlanDetails('author', catalog, 'year')}
        currentPlan='author'
        currentSubscriptionInterval='year'
        hasActiveSubscription
        onCheckout={vi.fn()}
        onManageSubscription={onManageSubscription}
        onSelectPlan={vi.fn()}
      />,
    );

    expect(
      (screen.getByRole('button', { name: 'Current Plan' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('does not present Reader as authoritative before billing identity data is known', () => {
    render(
      <>
        <UserInfo userFullName='Pending User' userEmail='pending@example.com' />
        <PlanActionButton
          plan={getPlanDetails('reader', catalog)}
          hasActiveSubscription={false}
          onCheckout={vi.fn()}
          onManageSubscription={vi.fn()}
          onSelectPlan={vi.fn()}
        />
      </>,
    );

    expect(screen.queryByText('Reader Plan')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Current Plan' })).toBeNull();
  });

  it('replaces a failed billing load skeleton with an actionable retry state', () => {
    const onRetryBilling = vi.fn();

    render(
      <UsageStats
        quotas={[]}
        billingError={new Error('StoryBored API unavailable')}
        onRetryBilling={onRetryBilling}
      />,
    );

    expect(screen.getByText('Ink details are temporarily unavailable.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetryBilling).toHaveBeenCalledOnce();
  });
});
