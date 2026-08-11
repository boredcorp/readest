'use client';

import clsx from 'clsx';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Toast } from '@/components/Toast';
import LegalLinks from '@/components/LegalLinks';
import Spinner from '@/components/Spinner';
import { useAuth } from '@/context/AuthContext';
import { useEnv } from '@/context/EnvContext';
import { useAvailablePlans } from '@/hooks/useAvailablePlans';
import { useQuotaStats } from '@/hooks/useQuotaStats';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import { useUserActions } from '@/hooks/useUserActions';
import {
  fetchAndTransformIAPPlans,
  getSubscriptionSuccessUrl as getIAPSubscriptionSuccessUrl,
  isIAPAvailable,
  purchaseIAPProduct,
  restoreIAPPurchases,
} from '@/libs/payment/iap/client';
import { isPurchaseProduct } from '@/libs/payment/iap/utils';
import {
  createBillingCheckoutSession,
  createBillingPortalSession,
  handleBillingCheckoutError,
  redirectToHostedBilling,
  type BillingCatalogItemKey,
  type BillingInterval,
} from '@/libs/payment/stripe/client';
import { useThemeStore } from '@/store/themeStore';
import { eventDispatcher } from '@/utils/event';
import { navigateToLibrary } from '@/utils/nav';
import type { AvailablePlan } from '@/types/quota';
import AccountActions from './components/AccountActions';
import BillingPlanChooser, { type NativeIAPStatus } from './components/BillingPlanChooser';
import ProfileHeader from './components/Header';
import PlansComparison from './components/PlansComparison';
import StorageManager from './components/StorageManager';
import StoryBoredBetaBillingNotice from './components/StoryBoredBetaBillingNotice';
import UsageStats from './components/UsageStats';
import UserInfo from './components/UserInfo';
import { getNativePlanBadgeDetails, getPlanDetails } from './utils/plan';

const IAP_PRODUCT_IDS = [
  'com.bilingify.readest.monthly.plus',
  'com.bilingify.readest.monthly.pro',
  'com.bilingify.readest.storage.1gb.purchase',
  'com.bilingify.readest.storage.2gb.purchase',
  'com.bilingify.readest.storage.5gb.purchase',
  'com.bilingify.readest.storage.10gb.purchase',
];

const ProfilePage = () => {
  const _ = useTranslation();
  const router = useRouter();
  const { appService } = useEnv();
  const { token, user, refresh } = useAuth();
  const { safeAreaInsets, isRoundedWindow } = useThemeStore();

  const [loading, setLoading] = useState(false);
  const [showStorageManager, setShowStorageManager] = useState(false);
  const [billingInterval, setBillingInterval] = useState<BillingInterval>('month');
  const [iapStatus, setIapStatus] = useState<NativeIAPStatus>('idle');
  const [iapPlans, setIapPlans] = useState<AvailablePlan[]>([]);
  const iapRequestSequence = useRef(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted) return;

    const isAuthenticated = user && token && appService;
    if (isAuthenticated) return;

    const timer = setTimeout(() => {
      router.push('/auth?redirect=/library');
    }, 1000);

    return () => clearTimeout(timer);
  }, [appService, mounted, router, token, user]);

  const refreshIAPPlans = useCallback(async () => {
    if (!appService?.hasIAP) return;

    const requestId = ++iapRequestSequence.current;
    setIapStatus('loading');

    try {
      const available = await isIAPAvailable();
      if (!available) throw new Error('Native IAP is unavailable.');

      const plans = await fetchAndTransformIAPPlans(IAP_PRODUCT_IDS);
      if (plans.length === 0) throw new Error('Native IAP returned no products.');
      if (requestId !== iapRequestSequence.current) return;

      setIapPlans(plans);
      setIapStatus('available');
    } catch (error) {
      if (requestId !== iapRequestSequence.current) return;
      console.error('Failed to load IAP plans:', error);
      setIapPlans([]);
      setIapStatus('unavailable');
      eventDispatcher.dispatch('toast', {
        type: 'info',
        message: _('Failed to load subscription plans.'),
      });
    }
  }, [_, appService?.hasIAP]);

  useEffect(() => {
    if (!appService?.hasIAP) {
      iapRequestSequence.current += 1;
      setIapPlans([]);
      setIapStatus('idle');
      return;
    }

    void refreshIAPPlans();
    return () => {
      iapRequestSequence.current += 1;
    };
  }, [appService?.hasIAP, refreshIAPPlans]);

  useTheme({ systemUIVisible: false });

  const { quotas, userProfilePlan = 'free' } = useQuotaStats();
  const { handleLogout, handleResetPassword, handleUpdateEmail, handleConfirmDelete } =
    useUserActions();

  const handleBillingLoadError = useCallback(
    (message: string) => {
      eventDispatcher.dispatch('toast', {
        type: 'info',
        message: _(message),
      });
    },
    [_],
  );

  const {
    availablePlans,
    billingAccount,
    error: billingError,
    loading: billingLoading,
    refreshBilling,
  } = useAvailablePlans({
    enabled: Boolean(user && token),
    identityKey: user && token ? `${user.id}:${token}` : null,
    onError: handleBillingLoadError,
  });
  const subscribedInterval = billingAccount?.subscription?.interval;

  useEffect(() => {
    if (subscribedInterval) {
      setBillingInterval(subscribedInterval);
    }
  }, [subscribedInterval]);

  const handleGoBack = () => {
    if (showStorageManager) {
      setShowStorageManager(false);
      refresh();
      return;
    }
    navigateToLibrary(router);
  };

  const handleBillingCheckout = async (catalogItemKey: BillingCatalogItemKey) => {
    setLoading(true);
    try {
      const { checkoutUrl } = await createBillingCheckoutSession(catalogItemKey);
      await redirectToHostedBilling(checkoutUrl);
    } catch (error) {
      handleBillingCheckoutError(error);
      eventDispatcher.dispatch('toast', {
        type: 'info',
        message: _('Failed to create checkout session'),
      });
    } finally {
      setLoading(false);
    }
  };

  const handleIAPRestorePurchase = async () => {
    setLoading(true);
    try {
      const purchases = await restoreIAPPurchases();
      const purchase = purchases
        .filter((candidate) => !isPurchaseProduct(candidate.productId))
        .sort(
          (left, right) =>
            new Date(right.purchaseDate).getTime() - new Date(left.purchaseDate).getTime(),
        )[0];

      if (!purchase) {
        eventDispatcher.dispatch('toast', {
          type: 'info',
          message: _('No purchases found to restore.'),
        });
        return;
      }
      router.push(getIAPSubscriptionSuccessUrl(purchase));
    } catch (error) {
      console.error('Failed to restore purchases:', error);
      eventDispatcher.dispatch('toast', {
        type: 'info',
        message: _('Failed to restore purchases.'),
      });
    } finally {
      setLoading(false);
    }
  };

  const handleIAPPurchase = async (productId: string) => {
    setLoading(true);
    try {
      const purchase = await purchaseIAPProduct(productId);
      if (purchase) {
        router.push(getIAPSubscriptionSuccessUrl(purchase));
      }
    } catch (error) {
      console.error('IAP purchase error:', error);
      eventDispatcher.dispatch('toast', {
        type: 'info',
        message: _('Failed to complete purchase.'),
      });
    } finally {
      setLoading(false);
    }
  };

  const handleManageSubscription = async () => {
    setLoading(true);
    try {
      const { portalUrl } = await createBillingPortalSession();
      await redirectToHostedBilling(portalUrl);
    } catch (error) {
      console.error('Error creating portal session:', error);
      eventDispatcher.dispatch('toast', {
        type: 'info',
        message: _('Failed to manage subscription.'),
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteWithMessage = () => {
    handleConfirmDelete();
  };

  if (!mounted) return null;

  if (!user || !token || !appService) {
    return (
      <div className='mx-auto max-w-4xl px-4 py-8'>
        <div className='overflow-hidden rounded-lg shadow-md'>
          <div className='flex min-h-[300px] items-center justify-center p-6'>
            <div className='text-base-content animate-pulse'>{_('Loading profile...')}</div>
          </div>
        </div>
      </div>
    );
  }

  const avatarUrl = user.user_metadata?.['picture'] || user.user_metadata?.['avatar_url'];
  const userFullName = user.user_metadata?.['full_name'] || '-';
  const userEmail = user.email || '';
  const currentPlan = billingAccount?.ink.plan.name;
  const currentPlanInterval = subscribedInterval ?? billingInterval;
  const iapAvailable = iapStatus === 'available';
  const iapLoading = appService.hasIAP && (iapStatus === 'idle' || iapStatus === 'loading');
  const usesNativeIAPBilling = appService.hasIAP;
  const userPlanDetails = usesNativeIAPBilling
    ? getNativePlanBadgeDetails(userProfilePlan)
    : currentPlan
      ? getPlanDetails(currentPlan, availablePlans, currentPlanInterval)
      : undefined;

  return (
    <div
      className={clsx(
        'bg-base-100 full-height inset-0 select-none overflow-hidden',
        appService.hasRoundedWindow && isRoundedWindow && 'window-border rounded-window',
      )}
    >
      <div
        className='flex h-full w-full flex-col items-center overflow-y-auto'
        style={{ paddingTop: `${safeAreaInsets?.top || 0}px` }}
      >
        <ProfileHeader onGoBack={handleGoBack} />
        <div className='w-full min-w-60 max-w-4xl py-10'>
          {loading || billingLoading || iapLoading ? (
            <div className='fixed inset-0 z-50 flex items-center justify-center'>
              <Spinner loading className='text-gray-900' />
            </div>
          ) : null}

          <div className='sm:bg-base-200 overflow-hidden rounded-lg sm:p-6 sm:shadow-md'>
            <div className='flex flex-col gap-y-8'>
              <div className='flex flex-col gap-y-8 px-6'>
                <UserInfo
                  avatarUrl={avatarUrl}
                  userFullName={userFullName}
                  userEmail={userEmail}
                  planDetails={userPlanDetails}
                />

                {!showStorageManager ? (
                  <UsageStats
                    quotas={quotas}
                    billing={billingAccount ?? undefined}
                    billingError={billingError}
                    onRetryBilling={() => void refreshBilling()}
                  />
                ) : null}
              </div>

              {showStorageManager ? (
                <div className='flex flex-col gap-y-8 px-6'>
                  <StorageManager />
                </div>
              ) : (
                <>
                  <div className='flex flex-col gap-y-3 sm:px-6'>
                    <BillingPlanChooser
                      hasNativeIAP={appService.hasIAP}
                      nativeIAPStatus={iapStatus}
                      nativePlans={iapPlans}
                      currentNativePlan={userProfilePlan}
                      onNativePurchase={handleIAPPurchase}
                      onRetryNativeIAP={() => void refreshIAPPlans()}
                      stripeContent={
                        <>
                          <StoryBoredBetaBillingNotice />
                          <PlansComparison
                            catalog={availablePlans}
                            currentPlan={currentPlan}
                            currentSubscriptionInterval={subscribedInterval}
                            hasActiveSubscription={
                              billingAccount?.subscription !== null &&
                              billingAccount?.subscription !== undefined
                            }
                            billingInterval={billingInterval}
                            onBillingIntervalChange={setBillingInterval}
                            onCheckout={handleBillingCheckout}
                            onManageSubscription={handleManageSubscription}
                          />
                        </>
                      }
                    />
                  </div>
                  <div className='flex flex-col gap-y-8 px-6'>
                    <AccountActions
                      billingCustomerExists={billingAccount?.customer.exists ?? false}
                      iapAvailable={iapAvailable}
                      onLogout={handleLogout}
                      onResetPassword={handleResetPassword}
                      onUpdateEmail={handleUpdateEmail}
                      onConfirmDelete={handleDeleteWithMessage}
                      onRestorePurchase={handleIAPRestorePurchase}
                      onManageSubscription={handleManageSubscription}
                      onManageStorage={() => setShowStorageManager(true)}
                    />
                  </div>
                </>
              )}

              <LegalLinks />
            </div>
          </div>
        </div>
        <Toast />
      </div>
    </div>
  );
};

export default ProfilePage;
