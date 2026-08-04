import { describe, expect, it } from 'vitest';

import { getReaderLoginDecision } from '@/integrations/storybored/session-readiness';

describe('reader login readiness', () => {
  it('waits for Supabase before trusting or redirecting from mirrored session state', () => {
    expect(
      getReaderLoginDecision({
        isAuthReady: false,
        hasToken: false,
        hasUser: false,
        keepLogin: true,
      }),
    ).toBe('wait');

    expect(
      getReaderLoginDecision({
        isAuthReady: false,
        hasToken: true,
        hasUser: true,
        keepLogin: false,
      }),
    ).toBe('wait');
  });

  it('reconciles login persistence only after the Supabase session is ready', () => {
    expect(
      getReaderLoginDecision({
        isAuthReady: true,
        hasToken: true,
        hasUser: true,
        keepLogin: false,
      }),
    ).toBe('enable-keep-login');
    expect(
      getReaderLoginDecision({
        isAuthReady: true,
        hasToken: false,
        hasUser: false,
        keepLogin: true,
      }),
    ).toBe('redirect-to-auth');
    expect(
      getReaderLoginDecision({
        isAuthReady: true,
        hasToken: false,
        hasUser: false,
        keepLogin: false,
      }),
    ).toBe('none');
  });
});
