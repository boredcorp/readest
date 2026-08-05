import Stripe from 'stripe';
import { NextResponse } from 'next/server';
import {
  getStripe,
  createOrUpdatePayment,
  createOrUpdateSubscription,
} from '@/libs/payment/stripe/server';
import { validateUserAndToken } from '@/utils/access';
import {
  LEARNINGBORED_PRIVATE_BETA_DISABLED_MESSAGE,
  getLearningBoredPrivateBetaPolicy,
} from '@/integrations/learningbored/private-beta-policy';

export async function POST(request: Request) {
  const privateBetaPolicy = getLearningBoredPrivateBetaPolicy();
  if (!privateBetaPolicy.allowPayments) {
    return NextResponse.json(
      { error: LEARNINGBORED_PRIVATE_BETA_DISABLED_MESSAGE },
      { status: 403 },
    );
  }

  const { sessionId } = await request.json();

  const { user, token } = await validateUserAndToken(request.headers.get('authorization'));
  if (!user || !token) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 403 });
  }

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    const customerId = session.customer as string;
    if (session.payment_status === 'paid' && session.subscription) {
      await createOrUpdateSubscription(user.id, customerId, session.subscription as string);
    } else if (session.payment_status === 'paid' && session.payment_intent) {
      await createOrUpdatePayment(user.id, customerId, sessionId);
    }

    return NextResponse.json({ session });
  } catch (error) {
    if (error instanceof Stripe.errors.StripeError) {
      console.error('Stripe error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
