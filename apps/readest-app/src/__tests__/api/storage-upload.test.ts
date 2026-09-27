import type { NextApiRequest, NextApiResponse } from 'next';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => {
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const key of ['select', 'eq', 'limit']) query[key] = vi.fn(() => query);
  query['single'] = vi.fn(async () => ({ data: null, error: { code: 'PGRST116' } }));
  query['insert'] = vi.fn(async () => ({ error: null }));
  return {
    active: true,
    query,
    create: vi.fn(),
    sign: vi.fn(async () => 'https://legacy.invalid/upload'),
    auth: vi.fn(async () => ({
      user: { id: '11111111-1111-4111-8111-111111111111' },
      token: 'token',
    })),
  };
});
vi.mock('@/utils/cors', () => ({ corsAllMethods: {}, runMiddleware: vi.fn() }));
vi.mock('@/utils/access', () => ({
  validateUserAndToken: mocks.auth,
  getStoragePlanData: () => ({ usage: 10, quota: 10000 }),
  STORAGE_QUOTA_GRACE_BYTES: 0,
}));
vi.mock('@/utils/supabase', () => ({
  createSupabaseAdminClient: () => ({ from: () => mocks.query }),
}));
vi.mock('@/utils/object', () => ({
  getUploadSignedUrl: mocks.sign,
  getDownloadSignedUrl: vi.fn(),
}));
vi.mock('@/services/constants', () => ({
  READEST_PUBLIC_STORAGE_BASE_URL: 'https://public.invalid',
}));
vi.mock('@/integrations/learningbored/private-beta-policy', () => ({
  getLearningBoredPrivateBetaPolicy: () => ({ active: mocks.active }),
}));
vi.mock('@/integrations/learningbored/upload-session-server', () => ({
  createReaderUploadService: () => ({ create: mocks.create }),
  readerUploadResponse: (record: unknown) => record,
  ReaderUploadError: class ReaderUploadError extends Error {
    constructor(
      readonly status: number,
      message: string,
    ) {
      super(message);
    }
  },
}));
import handler from '@/pages/api/storage/upload';
function request(body: Record<string, unknown>) {
  return { method: 'POST', headers: { authorization: 'Bearer token' }, body } as NextApiRequest;
}
function response() {
  const result: { status?: number; body?: Record<string, unknown> } = {};
  const res = {
    status: (status: number) => {
      result.status = status;
      return res;
    },
    json: (body: Record<string, unknown>) => {
      result.body = body;
      return res;
    },
  };
  return { res: res as unknown as NextApiResponse, result };
}
const input = {
  uploadId: '22222222-2222-4222-8222-222222222222',
  fileName: 'Readest/Books/Fictional.epub',
  byteSize: 64,
  contentType: 'application/epub+zip',
  sha256: 'a'.repeat(64),
};
describe('private Reader upload route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.active = true;
  });
  it('returns a service session without signing or exposing a provider write capability', async () => {
    mocks.create.mockResolvedValue({
      uploadId: input.uploadId,
      state: 'uploading',
      chunkSize: 8388608,
      nextChunkIndex: 0,
      byteSize: 64,
    });
    const { res, result } = response();
    await handler(request(input), res);
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ uploadId: input.uploadId, state: 'uploading' });
    expect(result.body).not.toHaveProperty('uploadUrl');
    expect(mocks.sign).not.toHaveBeenCalled();
    expect(mocks.create).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      expect.objectContaining({ sha256: input.sha256, quota: 10000 }),
    );
  });
  it('fails closed for legacy private-beta presign requests', async () => {
    const { res, result } = response();
    await handler(request({ fileName: input.fileName, fileSize: 64 }), res);
    expect(result.status).toBe(400);
    expect(mocks.sign).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('rejects temporary public uploads', async () => {
    const { res, result } = response();
    await handler(request({ ...input, temp: true }), res);
    expect(result.status).toBe(403);
    expect(mocks.sign).not.toHaveBeenCalled();
  });
  it.each([
    '../other.epub',
    'Readest/Books/../other.epub',
    'Readest/Books/%2e%2e',
    'Readest/Books/subdir/book.epub',
    'Readest/Books/%252fescape.epub',
  ])('rejects unsafe file name %s', async (fileName) => {
    const { res, result } = response();
    await handler(request({ ...input, fileName }), res);
    expect(result.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('retains the caller session id after a lost provider response', async () => {
    mocks.create.mockRejectedValue(new Error('unknown'));
    const { res, result } = response();
    await handler(request(input), res);
    expect(result.status).toBe(409);
    expect(result.body?.['uploadId']).toBe(input.uploadId);
    expect(result.body).not.toHaveProperty('uploadUrl');
  });
  it('preserves inherited Readest uploads outside private beta', async () => {
    mocks.active = false;
    const { res, result } = response();
    await handler(request({ fileName: 'Readest/Books/legacy.epub', fileSize: 64 }), res);
    expect(result.status).toBe(200);
    expect(result.body?.['uploadUrl']).toBe('https://legacy.invalid/upload');
    expect(mocks.sign).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111/Readest/Books/legacy.epub',
      64,
      1800,
    );
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
