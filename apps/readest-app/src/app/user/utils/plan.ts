import type {
  BillingCatalogItem,
  BillingCatalogItemKey,
  BillingInterval,
  StoryBoredPlan,
} from '@/libs/payment/stripe/client';
import type { UserPlan } from '@/types/quota';
import { stubTranslation as _ } from '@/utils/misc';

type FeatureType = {
  label: string;
  description?: string;
};

export type BillingSurface = StoryBoredPlan | 'ink_top_up';

export type ProductInfo = {
  key: BillingCatalogItemKey;
  name: string;
  description: string;
  price: number;
  currency: string;
  inkAmount: number;
};

export type PlanDetails = {
  name: string;
  plan: BillingSurface;
  type: 'subscription' | 'ink_top_up';
  color: string;
  hintColor: string;
  price: number;
  currency: string;
  catalogItemKey?: BillingCatalogItemKey;
  billingInterval?: BillingInterval;
  interval: string;
  features: FeatureType[];
  limits?: Record<string, string | number>;
  products?: ProductInfo[];
};

export type PlanBadgeDetails = Pick<PlanDetails, 'color' | 'name'>;

export function getNativePlanBadgeDetails(planCode: UserPlan): PlanBadgeDetails {
  switch (planCode) {
    case 'plus':
      return { name: _('Plus Plan'), color: 'bg-blue-200 text-blue-800' };
    case 'pro':
      return { name: _('Pro Plan'), color: 'bg-purple-200 text-purple-800' };
    case 'purchase':
      return { name: _('Lifetime Plan'), color: 'bg-green-100 text-green-800' };
    case 'free':
    default:
      return { name: _('Free Plan'), color: 'bg-gray-200 text-gray-800' };
  }
}

const fallbackPrices: Record<Exclude<StoryBoredPlan, 'reader'>, Record<BillingInterval, number>> = {
  author: { month: 999, year: 8999 },
  publisher: { month: 2999, year: 29999 },
};

function findSubscriptionItem(
  plan: Exclude<StoryBoredPlan, 'reader'>,
  catalog: BillingCatalogItem[],
  interval: BillingInterval,
): Extract<BillingCatalogItem, { kind: 'subscription' }> | undefined {
  return catalog.find(
    (item): item is Extract<BillingCatalogItem, { kind: 'subscription' }> =>
      item.kind === 'subscription' && item.plan === plan && item.interval === interval,
  );
}

export function getPlanDetails(
  planCode: StoryBoredPlan,
  catalog: BillingCatalogItem[],
  interval: BillingInterval = 'month',
): PlanDetails {
  const currency = catalog[0]?.currency ?? 'usd';

  if (planCode === 'reader') {
    return {
      name: _('Reader Plan'),
      plan: 'reader',
      type: 'subscription',
      color: 'bg-amber-100 text-amber-900',
      hintColor: 'text-amber-900/75',
      price: 0,
      currency,
      billingInterval: interval,
      interval: _('month'),
      features: [
        {
          label: _('10 Ink every month'),
          description: _('Create illustrated scenes while you read.'),
        },
        {
          label: _('Purchased Ink never expires'),
          description: _('Top up whenever you want more scenes.'),
        },
      ],
      limits: {
        [_('Monthly Ink')]: 10,
        [_('Plan Ink rollover')]: _('No rollover'),
      },
    };
  }

  const catalogItem = findSubscriptionItem(planCode, catalog, interval);
  const isAuthor = planCode === 'author';
  const monthlyInk = catalogItem?.monthlyInk ?? (isAuthor ? 100 : 500);
  const planName = isAuthor ? _('Author Plan') : _('Publisher Plan');

  return {
    name: planName,
    plan: planCode,
    type: 'subscription',
    color: isAuthor ? 'bg-violet-100 text-violet-900' : 'bg-indigo-100 text-indigo-900',
    hintColor: isAuthor ? 'text-violet-900/75' : 'text-indigo-900/75',
    price: catalogItem?.amountCents ?? fallbackPrices[planCode][interval],
    currency: catalogItem?.currency ?? currency,
    catalogItemKey: catalogItem?.key,
    billingInterval: interval,
    interval: interval === 'month' ? _('month') : _('year'),
    features: [
      {
        label: isAuthor ? _('100 Ink every month') : _('500 Ink every month'),
        description:
          interval === 'month'
            ? _('Billed monthly with a fresh Ink allowance each month.')
            : _('Billed annually with a fresh Ink allowance each month.'),
      },
      {
        label: _('Plan Ink is used first'),
        description: _('Your non-expiring purchased Ink stays available until you need it.'),
      },
      {
        label: _('Manage billing in Stripe'),
        description: _('Change or cancel your plan securely in the customer portal.'),
      },
    ],
    limits: {
      [_('Monthly Ink')]: monthlyInk,
      [_('Plan Ink rollover')]: _('No rollover'),
    },
  };
}

export function getInkTopUpDetails(catalog: BillingCatalogItem[]): PlanDetails {
  const products = catalog
    .filter(
      (item): item is BillingCatalogItem & { inkAmount: number } =>
        item.kind === 'ink_top_up' && item.inkAmount !== undefined,
    )
    .sort((left, right) => left.inkAmount - right.inkAmount)
    .map((item) => ({
      key: item.key,
      name: item.name,
      description: item.description,
      price: item.amountCents,
      currency: item.currency,
      inkAmount: item.inkAmount,
    }));

  return {
    name: _('Ink Top-ups'),
    plan: 'ink_top_up',
    type: 'ink_top_up',
    color: 'bg-emerald-100 text-emerald-900',
    hintColor: 'text-emerald-900/75',
    price: products[0]?.price ?? 399,
    currency: products[0]?.currency ?? 'usd',
    interval: _('one-time'),
    features: [
      {
        label: _('Purchased Ink never expires'),
        description: _('Use it after your monthly plan Ink is gone.'),
      },
      {
        label: _('One-time purchase'),
        description: _('No subscription is added or changed.'),
      },
    ],
    products,
  };
}
