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

const learningBoredReaderOrigin = 'https://reader.learningbored.com';

function createLearningBoredMetadata(
  route: SelectedReaderRoute,
  title: string,
  description: string,
): Metadata {
  const routeUrl = new URL(route === 'user' ? '/user' : `/${route}`, learningBoredReaderOrigin);
  return {
    metadataBase: new URL(learningBoredReaderOrigin),
    title: { absolute: title },
    description,
    applicationName: 'LearningBored',
    keywords: ['LearningBored', 'private library', 'Boards', 'grounded recall'],
    authors: [{ name: 'LearningBored', url: 'https://learningbored.com' }],
    manifest: null,
    icons: null,
    appleWebApp: {
      capable: true,
      title: 'LearningBored',
      statusBarStyle: 'default',
    },
    robots: {
      index: false,
      follow: false,
      nocache: true,
    },
    openGraph: {
      type: 'website',
      url: routeUrl,
      siteName: 'LearningBored',
      title,
      description,
      images: [],
    },
    twitter: {
      card: 'summary',
      title,
      description,
      images: [],
    },
    other: {
      'apple-mobile-web-app-capable': 'yes',
      'twitter:domain': 'reader.learningbored.com',
      'twitter:url': routeUrl.toString(),
    },
  };
}

const learningBoredMetadata: Record<SelectedReaderRoute, Metadata> = {
  auth: createLearningBoredMetadata(
    'auth',
    'Sign in to LearningBored',
    'Sign in to the LearningBored private beta.',
  ),
  library: createLearningBoredMetadata(
    'library',
    'LearningBored library',
    'Import and open books in your private LearningBored library.',
  ),
  user: createLearningBoredMetadata(
    'user',
    'LearningBored account',
    'Sign in to your LearningBored private-beta account or manage its settings.',
  ),
};

export function getSelectedReaderRouteMetadata(route: SelectedReaderRoute): Metadata {
  return getLearningBoredRoutePresentation() === 'learningbored'
    ? learningBoredMetadata[route]
    : readestMetadata[route];
}
