import { createHash, webcrypto } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('@/utils/access', () => ({ getUserID: vi.fn(async () => 'owner') }));
vi.mock('@/utils/fetch', () => ({ fetchWithAuth: mocks.fetch }));
import { uploadPrivateReaderFile } from '@/integrations/learningbored/upload-session-client';
import {
  readerStorageObjectKey,
  readerStorageProjection,
} from '@/integrations/learningbored/storage-object-key';
const policy = vi.hoisted(() => ({ active: true }));
vi.mock('@/integrations/learningbored/private-beta-policy', () => ({
  getLearningBoredPrivateBetaPolicy: () => policy,
}));

describe('Reader browser service upload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    policy.active = true;
    vi.stubGlobal('crypto', webcrypto);
  });
  it('sends sequential bounded chunks only to authenticated Reader routes and waits for ready', async () => {
    const bytes = new Uint8Array(8388609);
    const file = {
      name: 'Readest/Books/fictional.epub',
      size: bytes.length,
      type: 'application/epub+zip',
      arrayBuffer: () => {
        throw new Error('Whole-file buffering is forbidden.');
      },
      slice: (start: number, end: number) => {
        expect(end - start).toBeLessThanOrEqual(8388608);
        const part = new Blob([bytes.slice(start, end)]);
        Object.assign(part, { arrayBuffer: async () => bytes.slice(start, end).buffer });
        return part;
      },
    } as unknown as File;
    let uploadId = '';
    let nextChunkIndex = 0;
    mocks.fetch.mockImplementation(async (url: string, init: RequestInit) => {
      if (url.endsWith('/upload')) {
        uploadId = (JSON.parse(String(init.body)) as { uploadId: string }).uploadId;
        expect(JSON.parse(String(init.body)).sha256).toBe(
          createHash('sha256').update(bytes).digest('hex'),
        );
        expect(localStorage.length).toBe(1);
      } else if (url.includes('/chunks/')) {
        expect(url).toBe(`/api/storage/upload-session/${uploadId}/chunks/${nextChunkIndex}`);
        expect((init.body as Blob).size).toBe(nextChunkIndex === 0 ? 8388608 : 1);
        nextChunkIndex += 1;
      }
      return {
        json: async () => ({
          uploadId,
          state: url.endsWith('/finalize') ? 'ready' : 'uploading',
          chunkSize: 8388608,
          nextChunkIndex,
          byteSize: bytes.length,
        }),
      };
    });
    await uploadPrivateReaderFile('/api/storage/upload', file);
    expect(mocks.fetch).toHaveBeenCalledTimes(4);
    expect(mocks.fetch.mock.calls.every(([url]) => String(url).startsWith('/api/storage/'))).toBe(
      true,
    );
    expect(localStorage.length).toBe(0);
  });
  it('retains the session id when the create response is lost', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const file = {
      name: 'fictional.epub',
      size: 3,
      type: 'application/epub+zip',
      slice: (start: number, end: number) => ({
        arrayBuffer: async () => bytes.slice(start, end).buffer,
      }),
    } as File;
    mocks.fetch.mockRejectedValue(new Error('response lost'));
    await expect(uploadPrivateReaderFile('/api/storage/upload', file)).rejects.toThrow(
      'response lost',
    );
    const firstId = (JSON.parse(String(mocks.fetch.mock.calls[0]![1].body)) as { uploadId: string })
      .uploadId;
    await expect(uploadPrivateReaderFile('/api/storage/upload', file)).rejects.toThrow(
      'response lost',
    );
    expect(
      (JSON.parse(String(mocks.fetch.mock.calls[1]![1].body)) as { uploadId: string }).uploadId,
    ).toBe(firstId);
  });
  it('uses the validated attempt key only in private beta and preserves upstream projection', () => {
    const row = { file_key: 'owner/book', storage_object_key: 'owner/book_attempt' };
    expect(readerStorageObjectKey(row, 'owner')).toBe('owner/book_attempt');
    expect(() => readerStorageObjectKey(row, 'different')).toThrow();
    policy.active = false;
    expect(readerStorageObjectKey(row, 'owner')).toBe('owner/book');
    expect(readerStorageProjection('user_id,file_key')).toBe('user_id,file_key');
  });
});
