import type { NextApiRequest, NextApiResponse } from 'next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const r2Origin = 'https://abcdef0123456789abcdef0123456789.eu.r2.cloudflarestorage.com';
  const state = {
    privateBetaActive: true,
    bucketName: 'learningbored-reader-eu',
    storageType: 'r2',
    fetchResult: { data: null, error: { code: 'PGRST116' } } as {
      data: Record<string, unknown> | null;
      error: Record<string, unknown> | null;
    },
    insertResult: { error: null } as { error: Record<string, unknown> | null },
    rpcResult: { data: null, error: null } as {
      data: Record<string, unknown> | Record<string, unknown>[] | null;
      error: Record<string, unknown> | null;
    },
  };
  const queryBuilder: Record<string, ReturnType<typeof vi.fn>> = {};
  queryBuilder['select'] = vi.fn(() => queryBuilder);
  queryBuilder['eq'] = vi.fn(() => queryBuilder);
  queryBuilder['limit'] = vi.fn(() => queryBuilder);
  queryBuilder['single'] = vi.fn(async () => state.fetchResult);
  queryBuilder['insert'] = vi.fn(async () => state.insertResult);

  const from = vi.fn(() => queryBuilder);
  const rpc = vi.fn(async () => state.rpcResult);
  const createSupabaseAdminClient = vi.fn(() => ({ from, rpc }));
  const getUploadSignedUrl = vi.fn(
    async (fileKey: string, _fileSize: number, expires: number, bucketName?: string) => {
      const bucket = bucketName || 'legacy-reader';
      const path = [bucket, ...fileKey.split('/')]
        .map((segment) => encodeURIComponent(segment))
        .join('/');
      const url = new URL(`${r2Origin}/${path}`);
      url.searchParams.set('X-Amz-Date', '20260901T120000Z');
      url.searchParams.set('X-Amz-Expires', String(expires));
      url.searchParams.set('X-Amz-Algorithm', 'AWS4-HMAC-SHA256');
      url.searchParams.set('X-Amz-Credential', 'fictional-access/20260901/auto/s3/aws4_request');
      url.searchParams.set('X-Amz-SignedHeaders', 'content-length;host');
      url.searchParams.set('X-Amz-Signature', 'fictional-signature');
      return url.toString();
    },
  );

  return {
    r2Origin,
    state,
    queryBuilder,
    from,
    rpc,
    createSupabaseAdminClient,
    getUploadSignedUrl,
    validateUserAndToken: vi.fn(async () => ({
      user: { id: '11111111-1111-4111-8111-111111111111' },
      token: 'fictional-token',
    })),
  };
});

vi.mock('@/utils/cors', () => ({
  corsAllMethods: {},
  runMiddleware: vi.fn(async () => undefined),
}));
vi.mock('@/utils/access', () => ({
  STORAGE_QUOTA_GRACE_BYTES: 0,
  getStoragePlanData: vi.fn(() => ({ usage: 10, quota: 10_000 })),
  validateUserAndToken: mocks.validateUserAndToken,
}));
vi.mock('@/utils/supabase', () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}));
vi.mock('@/utils/object', () => ({
  getDefaultStorageBucketName: vi.fn(() => mocks.state.bucketName),
  getDownloadSignedUrl: vi.fn(),
  getUploadSignedUrl: mocks.getUploadSignedUrl,
}));
vi.mock('@/utils/storage', () => ({
  getStorageType: vi.fn(() => mocks.state.storageType),
}));
vi.mock('@/utils/r2', () => ({
  buildR2ObjectUrl: vi.fn((bucketName: string, fileKey: string) => {
    const path = [bucketName, ...fileKey.split('/')]
      .map((segment) => encodeURIComponent(segment))
      .join('/');
    return `${mocks.r2Origin}/${path}`;
  }),
}));
vi.mock('@/services/constants', () => ({
  READEST_PUBLIC_STORAGE_BASE_URL: 'https://public.invalid',
}));
vi.mock('@/integrations/learningbored/private-beta-policy', () => ({
  getLearningBoredPrivateBetaPolicy: vi.fn(() => ({ active: mocks.state.privateBetaActive })),
}));

import { buildReaderPermanentStorageKey } from '@/integrations/learningbored/permanent-storage-key';
import handler from '@/pages/api/storage/upload';

function createRequest(body: Record<string, unknown>): NextApiRequest {
  return {
    method: 'POST',
    headers: { authorization: 'Bearer fictional-token' },
    body,
  } as NextApiRequest;
}

function createResponse() {
  const result: { status: number; body?: Record<string, unknown> } = { status: 0 };
  const response = {
    status: vi.fn((status: number) => {
      result.status = status;
      return response;
    }),
    json: vi.fn((body: Record<string, unknown>) => {
      result.body = body;
      return response;
    }),
  } as unknown as NextApiResponse;
  return { response, result };
}

describe('permanent Reader upload authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.state.privateBetaActive = true;
    mocks.state.bucketName = 'learningbored-reader-eu';
    mocks.state.storageType = 'r2';
    mocks.state.fetchResult = { data: null, error: { code: 'PGRST116' } };
    mocks.state.insertResult = { error: null };
    mocks.state.rpcResult = { data: null, error: null };
  });

  it('rejects private-beta temporary-public storage before any URL is signed', async () => {
    const { response, result } = createResponse();
    await handler(createRequest({ fileName: 'temporary.png', fileSize: 12, temp: true }), response);

    expect(result).toEqual({
      status: 403,
      body: { error: 'Temporary public storage is unavailable.' },
    });
    expect(mocks.getUploadSignedUrl).not.toHaveBeenCalled();
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it('records the exact signed bound before returning a canonical private-beta upload URL', async () => {
    const fileName = 'Readest/Books/Fictional ?#% å.epub';
    const fileKey = buildReaderPermanentStorageKey(
      '11111111-1111-4111-8111-111111111111',
      fileName,
    );
    mocks.state.rpcResult = {
      data: [
        {
          authorized_file_size: 64,
          capability_issued_at: '2026-09-01 12:00:00+00',
          capability_expires_at: '2026-09-01 12:30:00+00',
        },
      ],
      error: null,
    };
    const { response, result } = createResponse();
    await handler(createRequest({ fileName, fileSize: 64, bookHash: 'fictional' }), response);

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ fileKey, usage: 74, quota: 10_000 });
    expect(result.body?.['uploadUrl']).toBe(await mocks.getUploadSignedUrl.mock.results[0]?.value);
    expect(mocks.getUploadSignedUrl).toHaveBeenCalledWith(
      fileKey,
      64,
      1800,
      'learningbored-reader-eu',
    );
    expect(mocks.rpc).toHaveBeenCalledWith('learningbored_record_reader_upload_capability', {
      p_book_hash: 'fictional',
      p_capability_expires_at: '2026-09-01T12:30:00.000Z',
      p_capability_issued_at: '2026-09-01T12:00:00.000Z',
      p_file_key: fileKey,
      p_file_size: 64,
      p_user_id: '11111111-1111-4111-8111-111111111111',
    });
    expect(mocks.getUploadSignedUrl.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.rpc.mock.invocationCallOrder[0]!,
    );
    expect(mocks.queryBuilder['insert']).not.toHaveBeenCalled();
  });

  it('never returns a generated capability when the subject fence wins authorization', async () => {
    mocks.state.rpcResult = {
      data: null,
      error: { code: 'LB001', message: 'reader_access_fenced' },
    };
    const { response, result } = createResponse();
    await handler(
      createRequest({ fileName: 'Readest/Books/Fictional.epub', fileSize: 64 }),
      response,
    );

    expect(mocks.getUploadSignedUrl).toHaveBeenCalledOnce();
    expect(result).toEqual({
      status: 403,
      body: { error: 'Reader access has been revoked.' },
    });
    expect(result.body).not.toHaveProperty('uploadUrl');
  });

  it('never records or returns a URL whose signed pathname does not prove the exact object key', async () => {
    mocks.getUploadSignedUrl.mockResolvedValueOnce(
      'https://storage.example/reader-private/11111111-1111-4111-8111-111111111111/../escaped' +
        '?X-Amz-Date=20260901T120000Z&X-Amz-Expires=1800',
    );
    const { response, result } = createResponse();
    await handler(
      createRequest({ fileName: 'Readest/Books/Fictional.epub', fileSize: 64 }),
      response,
    );

    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(result.status).toBe(500);
    expect(result.body).not.toHaveProperty('uploadUrl');
  });

  it.each([
    '../other.epub',
    'Readest/Books/../other.epub',
    'Readest/Books/%2e%2e',
    'Readest/Books/subdir/book.epub',
    'Readest/Books/subdir\\book.epub',
    'Readest/Books/%2fescape.epub',
    'Readest/Books/%252fescape.epub',
  ])('rejects an unsafe permanent path before signing: %s', async (fileName) => {
    const { response, result } = createResponse();
    await handler(createRequest({ fileName, fileSize: 64 }), response);

    expect(result.status).toBe(400);
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled();
    expect(mocks.getUploadSignedUrl).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('rejects a file key that would exceed the database 1024-byte bound before signing', async () => {
    const fileName = `Readest/Books/${'a'.repeat(800)}`;
    const { response, result } = createResponse();
    await handler(createRequest({ fileName, fileSize: 64 }), response);

    expect(result.status).toBe(400);
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled();
    expect(mocks.getUploadSignedUrl).not.toHaveBeenCalled();
  });

  it.each([
    ['s3', 'learningbored-reader-eu'],
    ['r2', 'wrong-reader-bucket'],
  ])(
    'fails closed before signing when private storage is misconfigured (%s, %s)',
    async (storageType, bucketName) => {
      mocks.state.storageType = storageType;
      mocks.state.bucketName = bucketName;
      const { response, result } = createResponse();
      await handler(
        createRequest({ fileName: 'Readest/Books/Fictional.epub', fileSize: 64 }),
        response,
      );

      expect(result).toEqual({
        status: 500,
        body: { error: 'Invalid private Reader storage configuration.' },
      });
      expect(mocks.getUploadSignedUrl).not.toHaveBeenCalled();
      expect(mocks.rpc).not.toHaveBeenCalled();
    },
  );

  it('preserves inherited Readest upload behavior when the private-beta policy is inactive', async () => {
    mocks.state.privateBetaActive = false;
    const fileName = 'Readest/Books/legacy.epub';
    const legacyFileKey = `11111111-1111-4111-8111-111111111111/${fileName}`;
    const { response, result } = createResponse();
    await handler(createRequest({ fileName, fileSize: 64 }), response);

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ fileKey: legacyFileKey });
    expect(mocks.queryBuilder['insert']).toHaveBeenCalledWith({
      user_id: '11111111-1111-4111-8111-111111111111',
      book_hash: null,
      file_key: legacyFileKey,
      file_size: 64,
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.getUploadSignedUrl).toHaveBeenCalledWith(legacyFileKey, 64, 1800);
  });
});
