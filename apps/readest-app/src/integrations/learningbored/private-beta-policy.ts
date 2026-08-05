export const LEARNINGBORED_PRIVATE_BETA_PROFILE = 'private_beta';
export const LEARNINGBORED_SUPPORT_EMAIL = 'support@learningbored.com';
export const LEARNINGBORED_PRIVATE_BETA_DISABLED_MESSAGE =
  'This feature is unavailable during the LearningBored private beta.';

export interface LearningBoredPrivateBetaEnvironment {
  deploymentProfile?: string;
  enabled?: string;
}

export interface LearningBoredPrivateBetaPolicy {
  active: boolean;
  allowTelemetry: boolean;
  allowSignUpLinks: boolean;
  allowSocialOAuth: boolean;
  allowPayments: boolean;
  allowSelfServiceAccountDeletion: boolean;
}

function getPublicEnvironment(): LearningBoredPrivateBetaEnvironment {
  return {
    deploymentProfile: process.env['NEXT_PUBLIC_LEARNINGBORED_DEPLOYMENT_PROFILE'],
    enabled: process.env['NEXT_PUBLIC_LEARNINGBORED_ENABLED'],
  };
}

/**
 * A specified LearningBored profile fails closed, including misspellings. Production validation
 * separately rejects anything except `private_beta`. The feature flag also locks inherited surfaces
 * so an accidentally enabled integration can never expose them.
 */
export function getLearningBoredPrivateBetaPolicy(
  environment: LearningBoredPrivateBetaEnvironment = getPublicEnvironment(),
): LearningBoredPrivateBetaPolicy {
  const active = environment.deploymentProfile !== undefined || environment.enabled === 'true';

  return {
    active,
    allowTelemetry: !active,
    allowSignUpLinks: !active,
    allowSocialOAuth: !active,
    allowPayments: !active,
    allowSelfServiceAccountDeletion: !active,
  };
}
