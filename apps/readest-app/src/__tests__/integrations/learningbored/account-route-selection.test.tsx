import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const probes = vi.hoisted(() => ({
  useQuotaStats: vi.fn(() => ({ quotas: [], userProfilePlan: 'free' })),
  useAvailablePlans: vi.fn(() => ({ availablePlans: [], iapAvailable: false })),
  purchaseIAPProduct: vi.fn(),
  restoreIAPPurchases: vi.fn(),
  createStripeCheckoutSession: vi.fn(),
  createStripePortalSession: vi.fn(),
  redirectToStripeCheckout: vi.fn(),
  redirectToStripePortal: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({
    appService: {
      hasIAP: false,
      hasRoundedWindow: false,
      hasTrafficLight: false,
      hasWindowBar: false,
    },
    envConfig: {},
  }),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    token: 'reader-session',
    user: {
      email: 'avery@example.test',
      user_metadata: { full_name: 'Avery North' },
    },
    refresh: vi.fn(),
  }),
}));

vi.mock('@/hooks/useTheme', () => ({ useTheme: vi.fn() }));
vi.mock('@/store/themeStore', () => ({
  useThemeStore: () => ({ safeAreaInsets: { top: 0 }, isRoundedWindow: false }),
}));
vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (value: string) => value,
}));
vi.mock('@/hooks/useQuotaStats', () => ({ useQuotaStats: probes.useQuotaStats }));
vi.mock('@/hooks/useAvailablePlans', () => ({ useAvailablePlans: probes.useAvailablePlans }));
vi.mock('@/hooks/useUserActions', () => ({
  useUserActions: () => ({
    handleLogout: vi.fn(),
    handleResetPassword: vi.fn(),
    handleUpdateEmail: vi.fn(),
    handleConfirmDelete: vi.fn(),
  }),
}));

vi.mock('@/libs/payment/iap/client', () => ({
  purchaseIAPProduct: probes.purchaseIAPProduct,
  restoreIAPPurchases: probes.restoreIAPPurchases,
  getSubscriptionSuccessUrl: vi.fn(),
}));
vi.mock('@/libs/payment/stripe/client', () => ({
  createStripeCheckoutSession: probes.createStripeCheckoutSession,
  redirectToStripeCheckout: probes.redirectToStripeCheckout,
  createStripePortalSession: probes.createStripePortalSession,
  redirectToStripePortal: probes.redirectToStripePortal,
  handleStripeCheckoutError: vi.fn(),
  getSubscriptionSuccessUrl: vi.fn(),
}));

vi.mock('@/components/Toast', () => ({ Toast: () => null }));
vi.mock('@/components/LegalLinks', () => ({ default: () => null }));
vi.mock('@/components/Spinner', () => ({ default: () => null }));
vi.mock('@/app/user/components/Header', () => ({ default: () => null }));
vi.mock('@/app/user/components/UserInfo', () => ({ default: () => null }));
vi.mock('@/app/user/components/UsageStats', () => ({ default: () => null }));
vi.mock('@/app/user/components/PlansComparison', () => ({ default: () => null }));
vi.mock('@/app/user/components/AccountActions', () => ({ default: () => null }));
vi.mock('@/app/user/components/StorageManager', () => ({ default: () => null }));
vi.mock('@/app/user/components/Checkout', () => ({ default: () => null }));
vi.mock('@/integrations/learningbored/presentation/selection', () => ({
  getLearningBoredRoutePresentation: () => 'learningbored',
}));
vi.mock('@/integrations/learningbored/presentation/LearningBoredAccountPresentation', () => ({
  default: ({ status }: { status: string }) => (
    <main aria-label='LearningBored account'>{status}</main>
  ),
}));

import ProfilePage from '@/app/user/page';
import { ReadestAccountRouteController } from '@/app/user/route-controllers';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('LearningBored account route selection', () => {
  it('does not mount quota, plan, or payment work in the selected private-beta renderer', async () => {
    render(<ProfilePage />);

    expect(await screen.findByText('ready')).toBeTruthy();
    expect(probes.useQuotaStats).not.toHaveBeenCalled();
    expect(probes.useAvailablePlans).not.toHaveBeenCalled();
    expect(probes.purchaseIAPProduct).not.toHaveBeenCalled();
    expect(probes.restoreIAPPurchases).not.toHaveBeenCalled();
    expect(probes.createStripeCheckoutSession).not.toHaveBeenCalled();
    expect(probes.createStripePortalSession).not.toHaveBeenCalled();
    expect(probes.redirectToStripeCheckout).not.toHaveBeenCalled();
    expect(probes.redirectToStripePortal).not.toHaveBeenCalled();
  });

  it('keeps the canonical Readest account controller active outside the selected profile', async () => {
    render(<ReadestAccountRouteController />);

    await waitFor(() => expect(probes.useQuotaStats).toHaveBeenCalled());
    expect(probes.useAvailablePlans).toHaveBeenCalled();
  });
});
