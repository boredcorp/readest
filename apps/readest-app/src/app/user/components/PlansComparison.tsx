import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  BillingCatalogItem,
  BillingCatalogItemKey,
  BillingInterval,
  StoryBoredPlan,
} from '@/libs/payment/stripe/client';
import { useEnv } from '@/context/EnvContext';
import { useTranslation } from '@/hooks/useTranslation';
import { debounce } from '@/utils/debounce';
import { getInkTopUpDetails, getPlanDetails, type BillingSurface } from '../utils/plan';
import PlanNavigation from './PlanNavigation';
import PlanCard from './PlanCard';
import PlanIndicators from './PlanIndicators';

const PLAN_CODES: StoryBoredPlan[] = ['reader', 'author', 'publisher'];

interface PlansComparisonProps {
  catalog: BillingCatalogItem[];
  currentPlan?: StoryBoredPlan;
  currentSubscriptionInterval?: BillingInterval;
  hasActiveSubscription: boolean;
  billingInterval: BillingInterval;
  onBillingIntervalChange: (interval: BillingInterval) => void;
  onCheckout: (catalogItemKey: BillingCatalogItemKey) => void;
  onManageSubscription: () => void;
}

const PlansComparison: React.FC<PlansComparisonProps> = ({
  catalog,
  currentPlan,
  currentSubscriptionInterval,
  hasActiveSubscription,
  billingInterval,
  onBillingIntervalChange,
  onCheckout,
  onManageSubscription,
}) => {
  const _ = useTranslation();
  const { appService } = useEnv();
  const [currentPlanIndex, setCurrentPlanIndex] = useState(0);
  const plansScrollRef = useRef<HTMLDivElement>(null);

  const allPlans = useMemo(
    () => [
      ...PLAN_CODES.map((plan) => getPlanDetails(plan, catalog, billingInterval)),
      getInkTopUpDetails(catalog),
    ],
    [billingInterval, catalog],
  );

  useEffect(() => {
    if (!currentPlan) return;
    const initialPlanIndex = PLAN_CODES.indexOf(currentPlan);
    setCurrentPlanIndex(Math.max(0, initialPlanIndex));
  }, [currentPlan]);

  const handlePlanSwipe = (direction: 'left' | 'right') => {
    setCurrentPlanIndex((currentIndex) => {
      if (direction === 'left') return Math.min(currentIndex + 1, allPlans.length - 1);
      return Math.max(currentIndex - 1, 0);
    });
  };

  const handleTouchStart = (event: React.TouchEvent) => {
    const touchStartX = event.touches[0]!.clientX;
    const touchStartY = event.touches[0]!.clientY;
    const handleTouchMove = (moveEvent: TouchEvent) => {
      const touchEndX = moveEvent.touches[0]!.clientX;
      const touchEndY = moveEvent.touches[0]!.clientY;
      const diffX = touchStartX - touchEndX;
      const diffY = touchStartY - touchEndY;

      if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 50) {
        handlePlanSwipe(diffX > 0 ? 'left' : 'right');
        document.removeEventListener('touchmove', handleTouchMove);
      }
    };

    const handleTouchEnd = () => {
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };

    document.addEventListener('touchmove', handleTouchMove, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });
  };

  const handleScroll = useMemo(
    () =>
      debounce(() => {
        const container = plansScrollRef.current;
        if (!container) return;

        const cardWidth = container.scrollWidth / allPlans.length;
        const viewportCenter = container.scrollLeft + container.clientWidth / 2;
        const newIndex = Math.floor(viewportCenter / cardWidth);
        const clampedIndex = Math.max(0, Math.min(newIndex, allPlans.length - 1));
        setCurrentPlanIndex((currentIndex) =>
          currentIndex === clampedIndex ? currentIndex : clampedIndex,
        );
      }, 100),
    [allPlans.length],
  );

  useEffect(() => {
    const container = plansScrollRef.current;
    if (!container) return;

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  useEffect(() => {
    const container = plansScrollRef.current;
    if (!container) return;

    const planWidth = container.scrollWidth / allPlans.length;
    const cardCenter = currentPlanIndex * planWidth + planWidth / 2;
    container.scrollTo({
      left: cardCenter - container.clientWidth / 2,
      behavior: 'smooth',
    });
  }, [allPlans.length, currentPlanIndex]);

  const handleSelectPlan = useCallback(
    (plan: BillingSurface) => {
      const index = allPlans.findIndex((candidate) => candidate.plan === plan);
      if (index !== -1) setCurrentPlanIndex(index);
    },
    [allPlans],
  );

  return (
    <div className='bg-base-100 border-base-200 overflow-hidden rounded-xl border shadow-sm'>
      <PlanNavigation
        allPlans={allPlans}
        currentPlan={currentPlan ? (allPlans[currentPlanIndex]?.plan ?? currentPlan) : undefined}
        onSelectPlan={handleSelectPlan}
      />

      <div className='border-base-200 flex justify-center gap-1 border-b px-6 py-3'>
        <button
          onClick={() => onBillingIntervalChange('month')}
          aria-pressed={billingInterval === 'month'}
          className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
            billingInterval === 'month'
              ? 'bg-violet-600 text-white'
              : 'bg-base-200 text-base-content hover:bg-base-300'
          }`}
        >
          {_('Monthly')}
        </button>
        <button
          onClick={() => onBillingIntervalChange('year')}
          aria-pressed={billingInterval === 'year'}
          className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
            billingInterval === 'year'
              ? 'bg-violet-600 text-white'
              : 'bg-base-200 text-base-content hover:bg-base-300'
          }`}
        >
          {_('Yearly')}
        </button>
      </div>

      <div
        ref={plansScrollRef}
        className='plans-container scrollbar-hide flex items-start overflow-x-auto scroll-smooth sm:px-52'
        onTouchStart={handleTouchStart}
        style={{
          scrollSnapType: appService?.isIOSApp ? 'x mandatory' : 'none',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
      >
        {allPlans.map((plan, index) => (
          <PlanCard
            key={`plan-${plan.plan}`}
            plan={plan}
            currentPlan={currentPlan}
            currentSubscriptionInterval={currentSubscriptionInterval}
            hasActiveSubscription={hasActiveSubscription}
            index={index}
            currentPlanIndex={currentPlan ? currentPlanIndex : -1}
            onCheckout={onCheckout}
            onManageSubscription={onManageSubscription}
            onSelectPlan={setCurrentPlanIndex}
          />
        ))}
      </div>

      <PlanIndicators
        allPlans={allPlans}
        currentPlanIndex={currentPlanIndex}
        onSelectPlan={setCurrentPlanIndex}
      />
    </div>
  );
};

export default PlansComparison;
