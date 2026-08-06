import { useTranslation } from '@/hooks/useTranslation';

export type CheckoutFailureRecovery = 'retry' | 'return_to_billing';

interface CheckoutFailureActionsProps {
  recovery: CheckoutFailureRecovery;
  onRetry: () => void;
  onReturnToBilling: () => void;
}

const CheckoutFailureActions: React.FC<CheckoutFailureActionsProps> = ({
  recovery,
  onRetry,
  onReturnToBilling,
}) => {
  const _ = useTranslation();

  if (recovery === 'return_to_billing') {
    return (
      <button
        onClick={onReturnToBilling}
        className='w-full rounded-lg bg-blue-600 px-4 py-2 font-medium text-white transition-colors duration-200 hover:bg-blue-700'
      >
        {_('Back to Billing')}
      </button>
    );
  }

  return (
    <div className='space-y-3'>
      <button
        onClick={onRetry}
        className='w-full rounded-lg bg-blue-600 px-4 py-2 font-medium text-white transition-colors duration-200 hover:bg-blue-700'
      >
        {_('Try Again')}
      </button>
      <button
        onClick={onReturnToBilling}
        className='w-full rounded-lg bg-gray-200 px-4 py-2 font-medium text-gray-800 transition-colors duration-200 hover:bg-gray-300'
      >
        {_('Back to Profile')}
      </button>
    </div>
  );
};

export default CheckoutFailureActions;
