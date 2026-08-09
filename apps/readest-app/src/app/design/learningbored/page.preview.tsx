import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import LearningBoredPreview from '@/integrations/learningbored/preview/LearningBoredPreview';
import { isLearningBoredPreviewEnabled } from '@/integrations/learningbored/preview/gate';

export const metadata: Metadata = {
  title: 'LearningBored Reader state preview',
  description: 'Fixture-only LearningBored Reader presentation states.',
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default function LearningBoredPreviewPage() {
  if (!isLearningBoredPreviewEnabled()) {
    notFound();
  }

  return <LearningBoredPreview />;
}
