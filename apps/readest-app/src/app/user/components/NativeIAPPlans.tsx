import { useTranslation } from '@/hooks/useTranslation';
import type { AvailablePlan, UserPlan } from '@/types/quota';
import { getLocale } from '@/utils/misc';

const nativeSubscriptionRank: Record<'free' | 'plus' | 'pro', number> = {
  free: 0,
  plus: 1,
  pro: 2,
};

interface NativeIAPPlansProps {
  availablePlans: AvailablePlan[];
  currentPlan: UserPlan;
  onPurchase: (productId: string) => void;
}

const NativeIAPPlans: React.FC<NativeIAPPlansProps> = ({
  availablePlans,
  currentPlan,
  onPurchase,
}) => {
  const _ = useTranslation();
  const subscriptions = availablePlans.filter(
    (plan): plan is AvailablePlan & { plan: 'plus' | 'pro' } =>
      plan.plan === 'plus' || plan.plan === 'pro',
  );
  const purchases = availablePlans.filter((plan) => plan.plan === 'purchase');

  const formatPrice = (plan: AvailablePlan) =>
    new Intl.NumberFormat(getLocale(), {
      style: 'currency',
      currency: plan.currency,
    }).format(plan.price / 100);

  return (
    <div className='bg-base-100 border-base-200 space-y-6 rounded-xl border p-4 shadow-sm sm:p-6'>
      <div>
        <h3 className='text-base-content text-xl font-bold'>{_('App Store plans')}</h3>
        <p className='text-base-content/65 mt-1 text-sm'>
          {_('Purchases on this device are securely handled by its app store.')}
        </p>
      </div>

      <div className='grid gap-4 sm:grid-cols-2'>
        {subscriptions.map((plan) => {
          const isCurrent = plan.plan === currentPlan;
          const currentSubscriptionRank =
            currentPlan === 'plus' || currentPlan === 'pro'
              ? nativeSubscriptionRank[currentPlan]
              : nativeSubscriptionRank.free;
          const isLowerTier = nativeSubscriptionRank[plan.plan] < currentSubscriptionRank;
          return (
            <div key={plan.productId} className='bg-base-200 rounded-xl p-4'>
              <h4 className='text-lg font-bold'>{_(plan.productName)}</h4>
              <p className='mb-4 mt-1 text-2xl font-bold'>
                {formatPrice(plan)}
                <span className='text-sm font-normal'>/{_(plan.interval)}</span>
              </p>
              <button
                disabled={isCurrent || isLowerTier}
                onClick={() => onPurchase(plan.productId)}
                className={`w-full rounded-lg px-5 py-3 font-semibold transition-colors ${
                  isCurrent || isLowerTier
                    ? 'cursor-default bg-green-100 text-green-700'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {isCurrent
                  ? _('Current Plan')
                  : isLowerTier
                    ? _('Included in current plan')
                    : _('Upgrade to {{plan}}', { plan: plan.productName })}
              </button>
            </div>
          );
        })}
      </div>

      {purchases.length > 0 ? (
        <div>
          <h4 className='text-base-content mb-3 font-semibold'>{_('One-time purchases')}</h4>
          <div className='grid gap-2 sm:grid-cols-2'>
            {purchases.map((plan) => (
              <button
                key={plan.productId}
                onClick={() => onPurchase(plan.productId)}
                className='rounded-lg bg-green-100 px-4 py-3 text-start text-green-900 transition-colors hover:bg-green-200'
              >
                <span className='block font-semibold'>{_(plan.productName)}</span>
                <span className='text-sm'>{formatPrice(plan)}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default NativeIAPPlans;
