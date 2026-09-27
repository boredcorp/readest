import { describe, expect, it, vi } from 'vitest';
import {
  ReaderUploadService,
  type ReaderUploadStore,
  type ReaderUploadProvider,
  type ReaderUploadRecord,
} from '@/integrations/learningbored/upload-session';

const record = (): ReaderUploadRecord => ({
  id: '11111111-1111-4111-8111-111111111111',
  userId: '22222222-2222-4222-8222-222222222222',
  fileKey: 'owner/book',
  objectKey: 'owner/book_nonce',
  byteSize: 3,
  sha256: 'a'.repeat(64),
  nonce: 'nonce',
  contentType: 'application/epub+zip',
  state: 'open',
  nextChunkIndex: 0,
  providerUploadId: 'private-provider-id',
  parts: [],
  pendingKind: null,
});
function setup(current = record()) {
  const store: ReaderUploadStore = {
    create: vi.fn(async () => current),
    read: vi.fn(async () => current),
    begin: vi.fn(async () => ({ dispatch: true, record: current })),
    receipt: vi.fn(async () => ({ ...current, state: 'ready' as const })),
    unknown: vi.fn(async () => undefined),
  };
  const provider: ReaderUploadProvider = {
    create: vi.fn(async () => 'private-provider-id'),
    uploadPart: vi.fn(async () => 'etag'),
    complete: vi.fn(async () => undefined),
    head: vi.fn(async () => null),
    abort: vi.fn(async () => undefined),
  };
  return { store, provider, service: new ReaderUploadService(store, provider) };
}
describe('Reader service uploads', () => {
  it.each(['create', 'part', 'complete', 'abort'] as const)(
    'treats a %s timeout as unknown after its durable journal',
    async (kind) => {
      const { store, provider, service } = setup();
      const timeout = new DOMException('Timed out', 'TimeoutError');
      vi.mocked(provider[kind === 'part' ? 'uploadPart' : kind]).mockRejectedValue(timeout);
      const run =
        kind === 'create'
          ? () =>
              service.create('user', {
                id: 'id',
                fileKey: 'user/book',
                byteSize: 3,
                contentType: 'application/epub+zip',
                sha256: 'a'.repeat(64),
                bookHash: null,
              })
          : kind === 'part'
            ? () => service.chunk('user', 'id', 0, new Uint8Array([1, 2, 3]))
            : () => service[kind === 'complete' ? 'finalize' : 'abort']('user', 'id');
      await expect(run()).rejects.toThrow('Upload outcome is unknown');
      expect(store.unknown).toHaveBeenCalledWith(
        'user',
        kind === 'create' ? record().id : 'id',
        kind,
        kind === 'part' ? 0 : -1,
      );
      expect(store.receipt).not.toHaveBeenCalled();
    },
  );
  it('journals before provider mutation and leaves a lost response unknown', async () => {
    const { store, provider, service } = setup();
    vi.mocked(provider.uploadPart).mockImplementation(async () => {
      expect(store.begin).toHaveBeenCalled();
      throw new Error('response lost');
    });
    await expect(service.chunk('user', 'id', 0, new Uint8Array([1, 2, 3]))).rejects.toThrow(
      'Upload outcome is unknown',
    );
    expect(store.unknown).toHaveBeenCalledWith('user', 'id', 'part', 0);
    expect(store.receipt).not.toHaveBeenCalled();
  });
  it('does not dispatch a duplicate operation authorized only for readback', async () => {
    const { store, provider, service } = setup();
    vi.mocked(store.begin).mockResolvedValue({ dispatch: false, record: record() });
    await service.chunk('user', 'id', 0, new Uint8Array([1, 2, 3]));
    expect(provider.uploadPart).not.toHaveBeenCalled();
  });
  it('never settles a missing object after an ambiguous completion', async () => {
    const current = { ...record(), state: 'unknown' as const, pendingKind: 'complete' as const };
    const { store, service } = setup(current);
    expect((await service.status('user', 'id')).state).toBe('unknown');
    expect(store.receipt).not.toHaveBeenCalled();
  });
  it('requires exact nonce, content hash and size to reconcile a completion', async () => {
    const current = { ...record(), state: 'unknown' as const, pendingKind: 'complete' as const };
    const { store, provider, service } = setup(current);
    vi.mocked(provider.head).mockResolvedValue({
      nonce: 'different',
      sha256: current.sha256,
      byteSize: 3,
    });
    await service.status('user', 'id');
    expect(store.receipt).not.toHaveBeenCalled();
    vi.mocked(provider.head).mockResolvedValue({
      nonce: current.nonce,
      sha256: current.sha256,
      byteSize: 3,
    });
    expect((await service.status('user', 'id')).state).toBe('ready');
    expect(store.receipt).toHaveBeenCalledWith('user', 'id', 'complete', -1, {});
  });
});
