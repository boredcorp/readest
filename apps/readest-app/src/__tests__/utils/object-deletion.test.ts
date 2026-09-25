import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), send: vi.fn() }));
vi.mock('aws4fetch', () => ({
  AwsClient: class {
    fetch = mocks.fetch;
  },
}));
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class {
    send = mocks.send;
  },
  DeleteObjectCommand: class {
    constructor(public input: unknown) {}
  },
  GetObjectCommand: class {},
  PutObjectCommand: class {},
}));
vi.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: vi.fn() }));

import { r2Storage } from '@/utils/r2';
import { s3Storage } from '@/utils/s3';

describe('object deletion acknowledgements', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('accepts the successful R2 DELETE acknowledgement', async () => {
    const response = new Response(null, { status: 204 });
    mocks.fetch.mockResolvedValue(response);
    await expect(r2Storage.deleteObject('books', 'owner/book.epub')).resolves.toBe(response);
    expect(mocks.fetch).toHaveBeenCalledWith(expect.any(String), { method: 'DELETE' });
  });

  it.each([301, 400, 403, 404, 429, 500, 503])(
    'rejects R2 HTTP %s without exposing provider content',
    async (status) => {
      mocks.fetch.mockResolvedValue(new Response('private-provider-detail', { status }));
      await expect(r2Storage.deleteObject('books', 'owner/private.epub')).rejects.toThrow(
        `Object deletion failed (HTTP ${status})`,
      );
    },
  );

  it('sanitizes a rejected R2 request without logging its URL or credentials', async () => {
    mocks.fetch.mockRejectedValue(new Error('https://private.example/key?signature=secret'));
    await expect(r2Storage.deleteObject('books', 'owner/private.epub')).rejects.toThrow(
      /^Object deletion request failed$/,
    );
  });

  it('addresses special characters as the exact object key, not URL syntax', async () => {
    mocks.fetch.mockResolvedValue(new Response(null, { status: 204 }));
    await r2Storage.deleteObject('books', 'owner/100% #?.epub');
    expect(mocks.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/books/owner/100%25%20%23%3F.epub'),
      { method: 'DELETE' },
    );
  });

  it('preserves S3 rejection instead of acknowledging a failed deletion', async () => {
    const failure = new Error('S3 unavailable');
    mocks.send.mockRejectedValue(failure);
    await expect(s3Storage.deleteObject('books', 'owner/book.epub')).rejects.toBe(failure);
    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({ input: { Bucket: 'books', Key: 'owner/book.epub' } }),
    );
  });

  it('keeps encoded traversal text literal inside the owner namespace', async () => {
    mocks.fetch.mockResolvedValue(new Response(null, { status: 204 }));
    await r2Storage.deleteObject('books', 'owner/%2e%2e/other-owner/book.epub');
    const [url] = mocks.fetch.mock.calls[0] as [string];
    expect(new URL(url).pathname).toBe('/books/owner/%252e%252e/other-owner/book.epub');
  });

  it.each(['owner/../other/book.epub', 'owner/./book.epub', 'owner\\..\\other\\book.epub'])(
    'rejects unsafe literal keys before sending R2 deletion: %s',
    async (fileKey) => {
      mocks.fetch.mockResolvedValue(new Response(null, { status: 204 }));
      await expect(r2Storage.deleteObject('books', fileKey)).rejects.toThrow('Invalid object key');
      expect(mocks.fetch).not.toHaveBeenCalled();
    },
  );
});
