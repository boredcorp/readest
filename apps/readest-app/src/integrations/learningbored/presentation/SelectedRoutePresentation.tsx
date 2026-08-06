'use client';

import type { ReactNode } from 'react';

import type { LearningBoredRoutePresentation } from './selection';

interface SelectedRoutePresentationProps {
  presentation: LearningBoredRoutePresentation;
  readest: ReactNode;
  learningbored: ReactNode;
}

export default function SelectedRoutePresentation({
  presentation,
  readest,
  learningbored,
}: SelectedRoutePresentationProps) {
  return presentation === 'learningbored' ? learningbored : readest;
}
