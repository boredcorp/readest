import type { ReactNode } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import type { AvailablePlan, UserPlan } from '@/types/quota';
import NativeIAPPlans from './NativeIAPPlans';

export type NativeIAPStatus = 'idle' | 'loading' | 'available' | 'unavailable';

interface BillingPlanChooserProps {
  hasNativeIAP: boolean;
  nativeIAPStatus: NativeIAPStatus;
  nativePlans: AvailablePlan[];
  currentNativePlan: UserPlan;
  onNativePurchase: (productId: string) => void;
  onRetryNativeIAP: () => void;
  stripeContent: ReactNode;
}

const BillingPlanChooser: React.FC<BillingPlanChooserProps> = ({
  hasNativeIAP,
  nativeIAPStatus,
  nativePlans,
  currentNativePlan,
  onNativePurchase,
  onRetryNativeIAP,
  stripeContent,
}) => {
  const _ = useTranslation();

  if (!hasNativeIAP) return <>{stripeContent}</>;

  if (nativeIAPStatus === 'available') {
    return (
      <NativeIAPPlans
        availablePlans={nativePlans}
        currentPlan={currentNativePlan}
        onPurchase={onNativePurchase}
      />
    );
  }

  if (nativeIAPStatus === 'unavailable') {
    return (
      <div
        role='status'
        className='bg-base-100 border-base-200 text-base-content rounded-xl border p-6 text-center shadow-sm'
      >
        <h3 className='text-lg font-bold'>
          {_('App Store purchases are temporarily unavailable.')}
        </h3>
        <p className='text-base-content/65 mt-2 text-sm'>
          {_(
            'Purchases on this device stay with its app store. Check your connection and try again.',
          )}
        </p>
        <button
          onClick={onRetryNativeIAP}
          className='mt-4 rounded-lg bg-blue-600 px-5 py-3 font-semibold text-white transition-colors hover:bg-blue-700'
        >
          {_('Try again')}
        </button>
      </div>
    );
  }

  return (
    <div
      role='status'
      className='bg-base-200 text-base-content/65 h-36 animate-pulse rounded-xl p-6 text-center'
    >
      {_('Loading App Store plans...')}
    </div>
  );
};

export default BillingPlanChooser;
