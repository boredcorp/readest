import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const state = {
    privateBetaActive: true,
    accessResult: { data: true, error: null } as {
      data: boolean | null;
      error: Record<string, unknown> | null;
    },
  };
  const getUser = vi.fn(async () => ({
    data: { user: { id: '11111111-1111-4111-8111-111111111111' } },
    error: null,
  }));
  const rpc = vi.fn(async () => state.accessResult);
  const createSupabaseAdminClient = vi.fn(() => ({ rpc }));
  return { state, getUser, rpc, createSupabaseAdminClient };
});

vi.mock('jwt-decode', () => ({ jwtDecode: vi.fn(() => ({})) }));
vi.mock('@/services/constants', () => ({
  DEFAULT_DAILY_TRANSLATION_QUOTA: { free: 0 },
  DEFAULT_STORAGE_QUOTA: { free: 0 },
}));
vi.mock('@/services/environment', () => ({ isWebAppPlatform: vi.fn(() => false) }));
vi.mock('@/services/translators/utils', () => ({ getDailyUsage: vi.fn(() => 0) }));
vi.mock('@/utils/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null } })),
      getUser: mocks.getUser,
    },
  },
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}));
vi.mock('@/integrations/learningbored/private-beta-policy', () => ({
  getLearningBoredPrivateBetaPolicy: vi.fn(() => ({ active: mocks.state.privateBetaActive })),
}));

import { validateUserAndToken } from '@/utils/access';

describe('Reader service-route access fence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.state.privateBetaActive = true;
    mocks.state.accessResult = { data: true, error: null };
  });

  it('checks the durable fence before returning a private-beta principal', async () => {
    await expect(validateUserAndToken('Bearer fictional-token')).resolves.toEqual({
      user: { id: '11111111-1111-4111-8111-111111111111' },
      token: 'fictional-token',
    });
    expect(mocks.rpc).toHaveBeenCalledWith('learningbored_assert_reader_access', {
      p_user_id: '11111111-1111-4111-8111-111111111111',
    });
  });

  it.each([
    { data: null, error: { code: 'LB001' } },
    { data: false, error: null },
  ])('fails closed when the Reader fence cannot affirm access', async (accessResult) => {
    mocks.state.accessResult = accessResult;
    await expect(validateUserAndToken('Bearer fictional-token')).resolves.toEqual({});
  });

  it('does not require LearningBored RPCs for inherited Readest deployments', async () => {
    mocks.state.privateBetaActive = false;
    await expect(validateUserAndToken('Bearer fictional-token')).resolves.toEqual({
      user: { id: '11111111-1111-4111-8111-111111111111' },
      token: 'fictional-token',
    });
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
