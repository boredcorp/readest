import type { NextApiRequest, NextApiResponse } from 'next';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  deleteFile: vi.fn(),
  sign: vi.fn(),
  rows: [] as unknown[],
  queries: [] as Array<{ filters: Record<string, unknown> }>,
  rawDelete: vi.fn(),
}));
vi.mock('@/utils/cors', () => ({ corsAllMethods: {}, runMiddleware: vi.fn() }));
vi.mock('@/utils/access', () => ({
  validateUserAndToken: vi.fn(async () => ({ user: { id: 'owner' }, token: 'fictional' })),
}));
vi.mock('@/integrations/learningbored/private-beta-policy', () => ({
  getLearningBoredPrivateBetaPolicy: () => ({ active: true }),
}));
vi.mock('@/integrations/learningbored/file-deletion', () => ({
  deletePrivateReaderFile: mocks.deleteFile,
}));
vi.mock('@/integrations/learningbored/upload-session-server', () => ({
  ReaderUploadError: class extends Error {
    readonly status = 503;
  },
}));
vi.mock('@/utils/object', () => ({
  getDownloadSignedUrl: mocks.sign,
  deleteObject: mocks.rawDelete,
}));
vi.mock('@/utils/supabase', () => ({
  createSupabaseAdminClient: () => ({
    from: () => {
      const filters: Record<string, unknown> = {};
      mocks.queries.push({ filters });
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn((key: string, value: unknown) => {
          filters[key] = value;
          return query;
        }),
        is: vi.fn((key: string, value: unknown) => {
          filters[key] = value;
          return query;
        }),
        in: vi.fn(() => query),
        order: vi.fn(() => query),
        range: vi.fn(() => query),
        // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are thenable.
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve(resolve({ data: mocks.rows, error: null, count: mocks.rows.length })),
      };
      return query;
    },
  }),
}));
import deleteHandler from '@/pages/api/storage/delete';
import purgeHandler from '@/pages/api/storage/purge';
import downloadHandler from '@/pages/api/storage/download';
import listHandler from '@/pages/api/storage/list';
function response() {
  const result: { status?: number; body?: unknown } = {};
  const res = {
    status: (status: number) => {
      result.status = status;
      return res;
    },
    json: (body: unknown) => {
      result.body = body;
      return res;
    },
  };
  return { res: res as unknown as NextApiResponse, result };
}
const request = (method: string, query: Record<string, string> = {}, body?: unknown) =>
  ({ method, query, body, headers: { authorization: 'Bearer fictional' } }) as NextApiRequest;
describe('private Reader deletion and hidden file access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rows = [];
    mocks.queries = [];
  });
  it('reports ordinary unresolved deletion as202 and permits retry with the same file identity', async () => {
    mocks.deleteFile.mockResolvedValue(false);
    for (let repeat = 0; repeat < 2; repeat++) {
      const { res, result } = response();
      await deleteHandler(request('DELETE', { fileKey: 'owner/book' }), res);
      expect(result.status).toBe(202);
      expect(result.body).toMatchObject({ state: 'cleanup_pending' });
    }
    expect(mocks.deleteFile).toHaveBeenCalledTimes(2);
    expect(mocks.rawDelete).not.toHaveBeenCalled();
  });
  it('routes bulk purge through receipts and never counts pending deletion as success', async () => {
    mocks.deleteFile.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const { res, result } = response();
    await purgeHandler(request('DELETE', {}, { fileKeys: ['owner/a', 'owner/b'] }), res);
    expect(result.status).toBe(202);
    expect(result.body).toMatchObject({
      success: ['owner/a'],
      pending: ['owner/b'],
      deletedCount: 1,
      pendingCount: 1,
    });
    expect(mocks.rawDelete).not.toHaveBeenCalled();
    expect(mocks.queries).toHaveLength(0);
  });
  it('filters tombstoned files from exact and fallback download queries before signing', async () => {
    const { res, result } = response();
    await downloadHandler(request('GET', { fileKey: 'owner/Readest/Books/hash/book.epub' }), res);
    expect(result.status).toBe(404);
    expect(mocks.queries).toHaveLength(2);
    for (const { filters } of mocks.queries)
      expect(filters).toMatchObject({ user_id: 'owner', deleted_at: null });
    expect(mocks.sign).not.toHaveBeenCalled();
  });
  it('filters tombstoned files from both list and related-book queries', async () => {
    mocks.rows = [{ file_key: 'owner/book', book_hash: 'hash' }];
    const { res, result } = response();
    await listHandler(request('GET'), res);
    expect(result.status).toBe(200);
    expect(mocks.queries).toHaveLength(2);
    for (const { filters } of mocks.queries)
      expect(filters).toMatchObject({ user_id: 'owner', deleted_at: null });
  });
});
