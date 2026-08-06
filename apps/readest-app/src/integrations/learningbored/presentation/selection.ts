import { getLearningBoredPrivateBetaPolicy } from '@/integrations/learningbored/private-beta-policy';

export type LearningBoredRoutePresentation = 'readest' | 'learningbored';

export function getLearningBoredRoutePresentation(): LearningBoredRoutePresentation {
  return getLearningBoredPrivateBetaPolicy().active ? 'learningbored' : 'readest';
}
