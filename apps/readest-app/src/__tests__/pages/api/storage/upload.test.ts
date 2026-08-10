import type { NextApiRequest, NextApiResponse } from 'next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  validateUserAndToken: vi.fn(),
  getUploadSignedUrl: vi.fn(),
  getDownloadSignedUrl: vi.fn(),
}));

vi.mock('@/utils/access', () => ({
  getStoragePlanData: vi.fn(),
  validateUserAndToken: mocks.validateUserAndToken,
  STORAGE_QUOTA_GRACE_BYTES: 0,
}));

vi.mock('@/utils/cors', () => ({
  corsAllMethods: () => undefined,
  runMiddleware: async () => undefined,
}));

vi.mock('@/utils/object', () => ({
  getUploadSignedUrl: mocks.getUploadSignedUrl,
  getDownloadSignedUrl: mocks.getDownloadSignedUrl,
}));

vi.mock('@/utils/supabase', () => ({
  createSupabaseAdminClient: vi.fn(),
}));

import handler from '@/pages/api/storage/upload';

function responseRecorder() {
  let statusCode: number | undefined;
  let payload: unknown;
  const response = {
    status(code: number) {
      statusCode = code;
      return response;
    },
    json(body: unknown) {
      payload = body;
      return response;
    },
  } as unknown as NextApiResponse;

  return {
    response,
    get payload() {
      return payload;
    },
    get statusCode() {
      return statusCode;
    },
  };
}

describe('temporary Reader storage upload', () => {
  beforeEach(() => {
    vi.stubEnv('TEMP_STORAGE_PUBLIC_BUCKET_NAME', 'readest-temp-public');
    vi.stubEnv('READEST_PUBLIC_STORAGE_BASE_URL', 'https://storage.storybored.test');
    vi.stubEnv(
      'READEST_TEMP_STORAGE_NAMESPACE_SECRET',
      'readest-temp-test-namespace-secret-2026-08-10',
    );
    mocks.validateUserAndToken.mockResolvedValue({
      user: { id: 'f838fd73-378e-4ea0-bfd8-458433362851' },
      token: 'verified-token',
    });
    mocks.getUploadSignedUrl.mockResolvedValue('https://upload.example');
    mocks.getDownloadSignedUrl.mockImplementation(
      async (key: string) => `https://r2.example/readest-temp-public/${key}?signature=test`,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it('uses the pinned subject HMAC and a random opaque key without retaining identity or filename', async () => {
    const recorder = responseRecorder();

    await handler(
      {
        method: 'POST',
        headers: { authorization: 'Bearer verified-token' },
        body: {
          fileName: '../../identifying-cover-name.jpg',
          fileSize: 4_096,
          temp: true,
        },
      } as unknown as NextApiRequest,
      recorder.response,
    );

    const expectedNamespace = '705b3ca20b91c8ef14fd9d838535d6d7e67aa46f198eb4bf7ed9de5e35a4e2cc';
    const [expectedKey] = mocks.getUploadSignedUrl.mock.calls[0] as [string];
    expect(expectedKey).toMatch(new RegExp(`^temp/img/v2/${expectedNamespace}/[0-9a-f-]{36}$`));
    expect(mocks.getUploadSignedUrl).toHaveBeenCalledWith(
      expectedKey,
      4_096,
      300,
      'readest-temp-public',
    );
    expect(mocks.getDownloadSignedUrl).toHaveBeenCalledWith(
      expectedKey,
      3 * 86_400,
      'readest-temp-public',
    );
    expect(expectedKey).not.toContain('f838fd73-378e-4ea0-bfd8-458433362851');
    expect(expectedKey).not.toContain('identifying-cover-name');
    expect(recorder.statusCode).toBe(200);
    expect(recorder.payload).toEqual({
      uploadUrl: 'https://upload.example',
      downloadUrl: `https://storage.storybored.test/${expectedKey}`,
    });
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 * 1024 * 1024 + 1])(
    'rejects invalid or oversized temporary image length %s',
    async (fileSize) => {
      const recorder = responseRecorder();

      await handler(
        {
          method: 'POST',
          headers: { authorization: 'Bearer verified-token' },
          body: { fileName: 'cover.jpg', fileSize, temp: true },
        } as unknown as NextApiRequest,
        recorder.response,
      );

      expect(recorder.statusCode).toBe(400);
      expect(recorder.payload).toEqual({ error: 'Invalid temporary image size' });
      expect(mocks.getUploadSignedUrl).not.toHaveBeenCalled();
    },
  );

  it.each([
    {
      name: 'public temporary bucket',
      bucket: '',
      secret: 'a'.repeat(32),
      publicBaseUrl: 'https://storage.storybored.test',
    },
    {
      name: 'namespace secret',
      bucket: 'readest-temp-public',
      secret: 'too-short',
      publicBaseUrl: 'https://storage.storybored.test',
    },
    {
      name: 'public storage origin',
      bucket: 'readest-temp-public',
      secret: 'a'.repeat(32),
      publicBaseUrl: 'http://storage.storybored.test/path',
    },
  ])('fails closed when the $name is not configured', async ({ bucket, secret, publicBaseUrl }) => {
    vi.stubEnv('TEMP_STORAGE_PUBLIC_BUCKET_NAME', bucket);
    vi.stubEnv('READEST_TEMP_STORAGE_NAMESPACE_SECRET', secret);
    vi.stubEnv('READEST_PUBLIC_STORAGE_BASE_URL', publicBaseUrl);
    const recorder = responseRecorder();

    await handler(
      {
        method: 'POST',
        headers: { authorization: 'Bearer verified-token' },
        body: { fileName: 'cover.jpg', fileSize: 4_096, temp: true },
      } as unknown as NextApiRequest,
      recorder.response,
    );

    expect(recorder.statusCode).toBe(503);
    expect(recorder.payload).toEqual({ error: 'Temporary storage is not configured' });
    expect(mocks.getUploadSignedUrl).not.toHaveBeenCalled();
  });
});
