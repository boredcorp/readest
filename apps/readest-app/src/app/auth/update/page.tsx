'use client';

import SelectedRoutePresentation from '@/integrations/learningbored/presentation/SelectedRoutePresentation';
import { getLearningBoredRoutePresentation } from '@/integrations/learningbored/presentation/selection';
import { UpdateEmailRouteController } from './route-controller';

const routePresentation = getLearningBoredRoutePresentation();

export default function UpdateEmailPage() {
  return (
    <SelectedRoutePresentation
      presentation={routePresentation}
      readest={<UpdateEmailRouteController presentation='readest' />}
      learningbored={<UpdateEmailRouteController presentation='learningbored' />}
    />
  );
}
