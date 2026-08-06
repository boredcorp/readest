import type { BillingCatalogItemKey } from '@/libs/payment/stripe/client';
import { useTranslation } from '@/hooks/useTranslation';
import { getLocale } from '@/utils/misc';
import type { PlanDetails } from '../utils/plan';

interface PurchaseCallToActionsProps {
  plan: PlanDetails;
  onCheckout: (catalogItemKey: BillingCatalogItemKey) => void;
}

const PurchaseCallToActions: React.FC<PurchaseCallToActionsProps> = ({ plan, onCheckout }) => {
  const _ = useTranslation();

  if (!plan.products || plan.products.length === 0) {
    return (
      <button
        disabled
        className='w-full cursor-not-allowed rounded-lg bg-emerald-200/70 px-6 py-3 font-semibold text-emerald-900/60'
      >
        {_('Ink top-ups are temporarily unavailable')}
      </button>
    );
  }

  return (
    <div className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
      {plan.products.map((product) => {
        const productPrice = new Intl.NumberFormat(getLocale(), {
          style: 'currency',
          currency: product.currency,
        }).format(product.price / 100);

        return (
          <button
            key={product.key}
            onClick={() => onCheckout(product.key)}
            className='flex min-h-20 w-full flex-col items-center justify-center rounded-lg bg-emerald-200 p-3 transition-colors hover:bg-emerald-300'
          >
            <span className='text-base font-semibold text-emerald-900'>
              {product.inkAmount} {_('Ink')}
            </span>
            <span className='text-sm font-bold text-emerald-700'>{productPrice}</span>
          </button>
        );
      })}
    </div>
  );
};

export default PurchaseCallToActions;
