import { Metadata } from 'next';
import { getLearningBoredPrivateBetaPolicy } from '@/integrations/learningbored/private-beta-policy';

const privateBetaPolicy = getLearningBoredPrivateBetaPolicy();

export const metadata: Metadata = {
  title: privateBetaPolicy.active ? 'LearningBored account' : 'Account & Sign In',
  description: privateBetaPolicy.active
    ? 'Sign in to your LearningBored private-beta account or manage its settings.'
    : 'Sign in to your Readest account or manage your subscription, cloud library storage, and account settings.',
};

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
