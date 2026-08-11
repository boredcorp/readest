import { useTranslation } from '@/hooks/useTranslation';
import type { BillingCheckoutStatus } from '@/libs/payment/stripe/client';
import type { PlanType } from '@/types/quota';
import CheckoutFailureActions, { type CheckoutFailureRecovery } from './CheckoutFailureActions';

interface CheckoutFailureContentProps {
  planType: PlanType;
  billingStatus?: BillingCheckoutStatus;
  recovery: CheckoutFailureRecovery;
  onRetry: () => void;
  onReturnToBilling: () => void;
}

function failureCopy(
  planType: PlanType,
  billingStatus: BillingCheckoutStatus | undefined,
  recovery: CheckoutFailureRecovery,
): { title: string; description: string } {
  const isPurchase = planType === 'purchase';

  if (recovery === 'retry') {
    return isPurchase
      ? {
          title: 'Unable to Confirm Ink Purchase',
          description:
            "We couldn't confirm your Ink purchase yet. Check its status again. If the issue persists, use the approved beta support channel from your invitation.",
        }
      : {
          title: 'Unable to Confirm Subscription',
          description:
            "We couldn't confirm your subscription yet. Check its status again. If the issue persists, use the approved beta support channel from your invitation.",
        };
  }

  if (billingStatus === 'expired') {
    return isPurchase
      ? {
          title: 'Ink Purchase Expired',
          description:
            'This Ink purchase checkout expired before payment completed. Return to billing to choose an Ink pack again.',
        }
      : {
          title: 'Subscription Checkout Expired',
          description:
            'This subscription checkout expired before payment completed. Return to billing to choose a plan again.',
        };
  }

  if (billingStatus === 'refunded') {
    return isPurchase
      ? {
          title: 'Ink Purchase Refunded',
          description:
            'This Ink purchase was refunded and is no longer active. Return to billing if you want to choose another Ink pack.',
        }
      : {
          title: 'Subscription Payment Refunded',
          description:
            'This subscription payment was refunded. Return to billing to review your current plan options.',
        };
  }

  if (billingStatus === 'disputed') {
    return isPurchase
      ? {
          title: 'Ink Purchase Under Review',
          description:
            'This Ink purchase is under payment dispute and is no longer active. Use the approved beta support channel from your invitation if you need help.',
        }
      : {
          title: 'Subscription Payment Under Review',
          description:
            'This subscription payment is under dispute. Return to billing to review your account, then use the approved beta support channel from your invitation if you need help.',
        };
  }

  return isPurchase
    ? {
        title: 'Ink Purchase Failed',
        description:
          "We couldn't process your Ink purchase. Return to billing to choose an Ink pack again. If the issue persists, use the approved beta support channel from your invitation.",
      }
    : {
        title: 'Subscription Payment Failed',
        description:
          "We couldn't process your subscription. Return to billing to choose a plan again. If the issue persists, use the approved beta support channel from your invitation.",
      };
}

const CheckoutFailureContent: React.FC<CheckoutFailureContentProps> = ({
  planType,
  billingStatus,
  recovery,
  onRetry,
  onReturnToBilling,
}) => {
  const _ = useTranslation();
  const copy = failureCopy(planType, billingStatus, recovery);

  return (
    <>
      <h2 className='mb-2 text-xl font-semibold text-gray-800'>{_(copy.title)}</h2>
      <p className='mb-6 text-gray-600'>{_(copy.description)}</p>
      <CheckoutFailureActions
        recovery={recovery}
        onRetry={onRetry}
        onReturnToBilling={onReturnToBilling}
      />
    </>
  );
};

export default CheckoutFailureContent;
