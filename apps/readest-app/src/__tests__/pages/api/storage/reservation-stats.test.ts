import type { NextApiRequest, NextApiResponse } from 'next';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn(), plan: vi.fn() }));
vi.mock('@/utils/access', () => ({
  validateUserAndToken: mocks.auth,
  getStoragePlanData: mocks.plan,
  STORAGE_QUOTA_GRACE_BYTES: 10485760,
}));
vi.mock('@/utils/supabase', () => ({ createSupabaseAdminClient: () => ({ rpc: mocks.rpc }) }));
vi.mock('@/utils/cors', () => ({ corsAllMethods: vi.fn(), runMiddleware: vi.fn() }));
import handler from '@/pages/api/storage/stats';

const owner = '11111111-1111-4111-8111-111111111111';
const byBookHash = [{ bookHash: 'a'.repeat(32), fileCount: 2, totalSize: 512 }];
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_STORAGE_FIXED_QUOTA', '1024');
  mocks.auth.mockResolvedValue({ user: { id: owner }, token: 'verified' });
  mocks.plan.mockReturnValue({ usage: 999999, quota: 999999 });
  mocks.rpc.mockResolvedValue({ data: { totalFiles: 2, totalSize: 512, byBookHash }, error: null });
});
afterEach(() => vi.unstubAllEnvs());
async function request() {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
  await handler(
    { method: 'GET', headers: { authorization: 'Bearer verified' } } as NextApiRequest,
    res as unknown as NextApiResponse,
  );
  return res;
}
it('reports one owner-scoped database snapshot, including reservations, instead of JWT usage', async () => {
  const res = await request();
  expect(mocks.rpc).toHaveBeenCalledWith('get_readest_storage_stats', { p_user_id: owner });
  expect(res.json).toHaveBeenCalledWith({
    totalFiles: 2,
    totalSize: 512,
    usage: 512,
    quota: 1024,
    usagePercentage: 50,
    byBookHash,
  });
});
it('fails closed instead of returning incomplete totals on a database failure', async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: { message: 'private details' } });
  const res = await request();
  expect(res.status).toHaveBeenCalledWith(500);
  expect(JSON.stringify(res.json.mock.calls)).not.toContain('private details');
});
it('rejects unsafe totals', async () => {
  mocks.rpc.mockResolvedValue({
    data: { totalFiles: 2, totalSize: Number.MAX_SAFE_INTEGER + 1, byBookHash },
    error: null,
  });
  expect((await request()).status).toHaveBeenCalledWith(500);
});
it.each(
  [
    [{ bookHash: null, fileCount: 2, totalSize: 1 }],
    [{ bookHash: null, fileCount: 1, totalSize: 512 }],
    [{ bookHash: {}, fileCount: 2, totalSize: 512 }],
    [{ bookHash: null, fileCount: 2, totalSize: Number.MAX_SAFE_INTEGER + 1 }],
    [
      { bookHash: null, fileCount: 1, totalSize: 256 },
      { bookHash: null, fileCount: 1, totalSize: 256 },
    ],
  ].map((groups) => [groups]),
)('rejects malformed or inconsistent groups %j', async (groups) => {
  mocks.rpc.mockResolvedValue({
    data: { totalFiles: 2, totalSize: 512, byBookHash: groups },
    error: null,
  });
  expect((await request()).status).toHaveBeenCalledWith(500);
});
it('does not query an unauthenticated owner', async () => {
  mocks.auth.mockResolvedValue({});
  expect((await request()).status).toHaveBeenCalledWith(403);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
