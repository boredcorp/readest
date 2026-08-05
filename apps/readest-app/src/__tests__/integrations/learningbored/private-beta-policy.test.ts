import { describe, expect, it } from 'vitest';

import {
  LEARNINGBORED_PRIVATE_BETA_DISABLED_MESSAGE,
  LEARNINGBORED_SUPPORT_EMAIL,
  getLearningBoredPrivateBetaPolicy,
} from '@/integrations/learningbored/private-beta-policy';

describe('LearningBored private-beta policy', () => {
  it('fails closed during rollout even when the Board-it feature remains disabled', () => {
    expect(
      getLearningBoredPrivateBetaPolicy({
        deploymentProfile: 'private_beta',
        enabled: 'false',
      }),
    ).toEqual({
      active: true,
      allowTelemetry: false,
      allowSignUpLinks: false,
      allowSocialOAuth: false,
      allowPayments: false,
      allowSelfServiceAccountDeletion: false,
    });
  });

  it('also fails closed when the feature is enabled without a deployment profile', () => {
    expect(getLearningBoredPrivateBetaPolicy({ enabled: 'true' }).active).toBe(true);
  });

  it('treats an unknown nonempty LearningBored profile as restricted', () => {
    expect(
      getLearningBoredPrivateBetaPolicy({
        deploymentProfile: 'private-btea',
        enabled: 'false',
      }).active,
    ).toBe(true);
  });

  it.each([undefined, '', 'false', 'TRUE', '1'])(
    'leaves normal Readest behavior unchanged for enabled=%s',
    (enabled) => {
      expect(getLearningBoredPrivateBetaPolicy({ deploymentProfile: undefined, enabled })).toEqual({
        active: false,
        allowTelemetry: true,
        allowSignUpLinks: true,
        allowSocialOAuth: true,
        allowPayments: true,
        allowSelfServiceAccountDeletion: true,
      });
    },
  );

  it('publishes one explicit support route and disabled-feature response', () => {
    expect(LEARNINGBORED_SUPPORT_EMAIL).toBe('support@learningbored.com');
    expect(LEARNINGBORED_PRIVATE_BETA_DISABLED_MESSAGE).toBe(
      'This feature is unavailable during the LearningBored private beta.',
    );
  });
});
