'use client';

import SelectedRoutePresentation from '@/integrations/learningbored/presentation/SelectedRoutePresentation';
import { getLearningBoredRoutePresentation } from '@/integrations/learningbored/presentation/selection';
import {
  LearningBoredAccountRouteController,
  ReadestAccountRouteController,
} from './route-controllers';

const routePresentation = getLearningBoredRoutePresentation();

export default function ProfilePage() {
  return (
    <SelectedRoutePresentation
      presentation={routePresentation}
      readest={<ReadestAccountRouteController />}
      learningbored={<LearningBoredAccountRouteController />}
    />
  );
}
