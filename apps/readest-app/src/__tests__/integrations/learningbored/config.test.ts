import { describe, expect, it } from 'vitest';

import { getLearningBoredReaderConfig } from '@/integrations/learningbored/config';

describe('LearningBored reader feature gate', () => {
  it.each([
    {},
    { enabled: 'false', apiBaseUrl: 'https://api.learningbored.localhost' },
    { enabled: 'TRUE', apiBaseUrl: 'https://api.learningbored.localhost' },
    { enabled: 'true' },
    { enabled: 'true', apiBaseUrl: '   ' },
  ])('stays absent unless both public settings are explicit: %o', (environment) => {
    expect(getLearningBoredReaderConfig(environment)).toMatchObject({ enabled: false });
  });

  it('enables only exact true plus a nonempty URL and canonicalizes one trailing slash', () => {
    expect(
      getLearningBoredReaderConfig({
        enabled: 'true',
        apiBaseUrl: '  https://api.learningbored.localhost/  ',
      }),
    ).toEqual({
      enabled: true,
      apiBaseUrl: 'https://api.learningbored.localhost',
    });
  });

  it.each([
    'not-a-url',
    '//api.learningbored.com',
    'http://api.learningbored.com',
    'https://user:password@api.learningbored.com',
    'https://api.learningbored.com/v1',
  ])('fails closed for an invalid production API origin: %s', (apiBaseUrl) => {
    expect(
      getLearningBoredReaderConfig({
        enabled: 'true',
        apiBaseUrl,
        nodeEnv: 'production',
      }),
    ).toEqual({
      enabled: false,
      apiBaseUrl: '',
    });
  });

  it('pins the private-beta production client to the canonical API origin', () => {
    expect(
      getLearningBoredReaderConfig({
        deploymentProfile: 'private_beta',
        enabled: 'true',
        apiBaseUrl: 'https://api.learningbored.com',
        nodeEnv: 'production',
      }),
    ).toEqual({
      enabled: true,
      apiBaseUrl: 'https://api.learningbored.com',
    });

    expect(
      getLearningBoredReaderConfig({
        deploymentProfile: 'private_beta',
        enabled: 'true',
        apiBaseUrl: 'https://token-collector.example',
        nodeEnv: 'production',
      }),
    ).toEqual({
      enabled: false,
      apiBaseUrl: '',
    });
  });

  it('does not enable a production bearer client without the private-beta profile', () => {
    expect(
      getLearningBoredReaderConfig({
        enabled: 'true',
        apiBaseUrl: 'https://api.learningbored.com',
        nodeEnv: 'production',
      }),
    ).toEqual({
      enabled: false,
      apiBaseUrl: '',
    });
  });

  it('allows HTTP only for local development hosts', () => {
    expect(
      getLearningBoredReaderConfig({
        deploymentProfile: 'private_beta',
        enabled: 'true',
        apiBaseUrl: 'http://api.learningbored.localhost:4101/',
        nodeEnv: 'development',
      }),
    ).toEqual({
      enabled: true,
      apiBaseUrl: 'http://api.learningbored.localhost:4101',
    });

    expect(
      getLearningBoredReaderConfig({
        enabled: 'true',
        apiBaseUrl: 'http://api.learningbored.localhost:4101',
        nodeEnv: 'production',
      }),
    ).toEqual({
      enabled: false,
      apiBaseUrl: '',
    });
  });
});
