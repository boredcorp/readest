import { useTranslation } from '@/hooks/useTranslation';
import type {
  BillingCatalogItemKey,
  BillingInterval,
  StoryBoredPlan,
} from '@/libs/payment/stripe/client';
import type { PlanDetails } from '../utils/plan';

interface PlanActionButtonProps {
  plan: PlanDetails;
  currentPlan?: StoryBoredPlan;
  currentSubscriptionInterval?: BillingInterval;
  hasActiveSubscription: boolean;
  onCheckout: (catalogItemKey: BillingCatalogItemKey) => void;
  onManageSubscription: () => void;
  onSelectPlan: (index: number) => void;
}

const PlanActionButton: React.FC<PlanActionButtonProps> = ({
  plan,
  currentPlan,
  currentSubscriptionInterval,
  hasActiveSubscription,
  onCheckout,
  onManageSubscription,
  onSelectPlan,
}) => {
  const _ = useTranslation();
  const isCurrentPlan =
    plan.plan === currentPlan &&
    (plan.plan === 'reader' ||
      !hasActiveSubscription ||
      plan.billingInterval === currentSubscriptionInterval);

  if (isCurrentPlan) {
    return (
      <button
        disabled
        className='w-full cursor-default rounded-lg bg-green-100 px-6 py-3 font-semibold text-green-700'
      >
        {_('Current Plan')}
      </button>
    );
  }

  if (plan.plan === 'reader') {
    return hasActiveSubscription ? (
      <button
        onClick={onManageSubscription}
        className='w-full rounded-lg bg-blue-100 px-6 py-3 font-semibold text-blue-700 transition-colors hover:bg-blue-200'
      >
        {_('Change plan in billing portal')}
      </button>
    ) : null;
  }

  if (plan.plan === 'author' || plan.plan === 'publisher') {
    if (hasActiveSubscription) {
      return (
        <button
          onClick={onManageSubscription}
          className='w-full rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-blue-700'
        >
          {_('Change plan in billing portal')}
        </button>
      );
    }

    const catalogItemKey = plan.catalogItemKey;
    if (!catalogItemKey) {
      return (
        <button
          disabled
          className='w-full cursor-not-allowed rounded-lg bg-gray-200 px-6 py-3 font-semibold text-gray-500'
        >
          {_('Checkout temporarily unavailable')}
        </button>
      );
    }

    return (
      <button
        onClick={() => onCheckout(catalogItemKey)}
        className='w-full rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-blue-700'
      >
        {_('Choose {{plan}}', { plan: _(plan.name) })}
      </button>
    );
  }

  return (
    <button
      onClick={() => onSelectPlan(0)}
      className='w-full rounded-lg bg-blue-100 px-6 py-3 font-semibold text-blue-700 transition-colors hover:bg-blue-200'
    >
      {_('View plans')}
    </button>
  );
};

export default PlanActionButton;
