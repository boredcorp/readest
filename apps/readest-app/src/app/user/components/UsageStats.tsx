import Quota from '@/components/Quota';
import { useTranslation } from '@/hooks/useTranslation';
import type { BillingAccountResponse } from '@/libs/payment/stripe/client';
import type { QuotaType } from '@/types/quota';

interface UsageStatsProps {
  quotas: QuotaType[];
  billing?: BillingAccountResponse;
  billingError?: Error | null;
  onRetryBilling?: () => void;
}

const UsageStats: React.FC<UsageStatsProps> = ({
  quotas,
  billing,
  billingError,
  onRetryBilling,
}) => {
  const _ = useTranslation();
  const ink = billing?.ink;

  return (
    <div className='space-y-5 rounded-lg'>
      {ink ? (
        <div className='bg-base-100 border-base-300 rounded-xl border p-4'>
          <div className='flex items-start justify-between gap-4'>
            <div>
              <p className='text-base-content/60 text-sm'>{_('Ink available')}</p>
              <p className='text-base-content text-3xl font-bold'>{ink.totalAvailable}</p>
            </div>
            <div className='text-end text-sm'>
              <p className='text-base-content font-semibold'>
                {ink.plan.available} {_('plan Ink')}
              </p>
              <p className='text-base-content/70'>
                {ink.purchased.available} {_('purchased Ink')}
              </p>
              {ink.totalReserved > 0 ? (
                <p className='text-base-content/60'>
                  {ink.totalReserved} {_('reserved')}
                </p>
              ) : null}
            </div>
          </div>
          <div className='border-base-300 text-base-content/70 mt-4 border-t pt-3 text-sm'>
            <p>
              {_('Monthly Ink resets on {{date}}', {
                date: new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(
                  new Date(ink.plan.resetsAt),
                ),
              })}
            </p>
            <p>{_('Purchased Ink never expires.')}</p>
            {billing.subscription ? (
              <p className='mt-1'>
                {_('Subscription status: {{status}}', {
                  status: billing.subscription.status,
                })}
                {billing.subscription.cancelAtPeriodEnd ? ` · ${_('Cancels at period end')}` : ''}
              </p>
            ) : null}
          </div>
        </div>
      ) : billingError ? (
        <div
          role='status'
          className='border-base-300 bg-base-100 text-base-content rounded-xl border p-4'
        >
          <p className='font-semibold'>{_('Ink details are temporarily unavailable.')}</p>
          <p className='text-base-content/65 mt-1 text-sm'>
            {_('Your reading account is still available. Try loading billing details again.')}
          </p>
          {onRetryBilling ? (
            <button
              onClick={onRetryBilling}
              className='mt-3 rounded-lg bg-blue-100 px-4 py-2 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-200'
            >
              {_('Try again')}
            </button>
          ) : null}
        </div>
      ) : (
        <div className='bg-base-200 h-28 animate-pulse rounded-xl'></div>
      )}

      <div className='p-0'>
        {quotas && quotas.length > 0 ? (
          <Quota quotas={quotas} showProgress className='space-y-4' labelClassName='pl-4 pr-2' />
        ) : (
          <div className='h-10 animate-pulse'></div>
        )}
      </div>
    </div>
  );
};

export default UsageStats;
