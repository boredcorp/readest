import type { Metadata } from 'next';

import { getLearningBoredRoutePresentation } from './selection';

export type SelectedReaderRoute = 'auth' | 'library' | 'user';

const readestMetadata: Record<SelectedReaderRoute, Metadata> = {
  auth: {},
  library: {},
  user: {
    title: 'Account & Sign In',
    description:
      'Sign in to your Readest account or manage your subscription, cloud library storage, and account settings.',
  },
};

const learningBoredMetadata: Record<SelectedReaderRoute, Metadata> = {
  auth: {
    title: 'Sign in to LearningBored',
    description: 'Sign in to the LearningBored private beta.',
  },
  library: {
    title: 'LearningBored library',
    description: 'Import and open books in your private LearningBored library.',
  },
  user: {
    title: 'LearningBored account',
    description: 'Sign in to your LearningBored private-beta account or manage its settings.',
  },
};

export function getSelectedReaderRouteMetadata(route: SelectedReaderRoute): Metadata {
  return getLearningBoredRoutePresentation() === 'learningbored'
    ? learningBoredMetadata[route]
    : readestMetadata[route];
}
