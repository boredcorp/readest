import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMocks = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

vi.mock('@/utils/supabase', () => ({
  supabase: {
    auth: {
      getSession: authMocks.getSession,
    },
  },
}));

vi.mock('@/services/environment', () => ({
  isWebAppPlatform: () => true,
}));

import { getAccessToken } from '@/utils/access';
import {
  beginAuthSessionResolution,
  publishAuthSessionToken,
} from '@/utils/auth-session-readiness';

describe('authoritative access-token lookup', () => {
  beforeEach(() => {
    authMocks.getSession.mockReset();
    window.localStorage.clear();
    beginAuthSessionResolution();
  });

  it('waits for readiness and does not return a stale mirrored token for no session', async () => {
    window.localStorage.setItem('token', 'stale-mirrored-token');
    let settled = false;
    const accessToken = getAccessToken().finally(() => {
      settled = true;
    });

    await Promise.resolve();
    expect(settled).toBe(false);

    publishAuthSessionToken(null);

    await expect(accessToken).resolves.toBeNull();
    expect(authMocks.getSession).not.toHaveBeenCalled();
  });

  it('returns the published Supabase session token instead of the mirror', async () => {
    window.localStorage.setItem('token', 'stale-mirrored-token');
    publishAuthSessionToken('current-session-token');

    await expect(getAccessToken()).resolves.toBe('current-session-token');
    expect(authMocks.getSession).not.toHaveBeenCalled();
  });

  it('returns no protected token as soon as local logout is published', async () => {
    publishAuthSessionToken('active-session-token');
    publishAuthSessionToken(null);

    await expect(getAccessToken()).resolves.toBeNull();
  });
});
