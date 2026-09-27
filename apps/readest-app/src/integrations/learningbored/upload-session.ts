import { createHash } from 'node:crypto';
import { UPLOAD_CHUNK_BYTES } from '@learningbored/sdk';

export const READER_UPLOAD_CHUNK_BYTES = UPLOAD_CHUNK_BYTES;
export type ReaderUploadMutation = 'create' | 'part' | 'complete' | 'abort';
export interface ReaderUploadRecord {
  id: string;
  userId: string;
  fileKey: string;
  objectKey: string;
  byteSize: number;
  contentType: string;
  sha256: string;
  nonce: string;
  state: 'open' | 'uploading' | 'ready' | 'unknown' | 'cleanup_pending' | 'deleted';
  providerUploadId: string | null;
  nextChunkIndex: number;
  parts: { index: number; etag: string }[];
  pendingKind: ReaderUploadMutation | null;
  completed?: boolean;
}
export interface ReaderUploadInput {
  id: string;
  fileKey: string;
  byteSize: number;
  contentType: string;
  sha256: string;
  bookHash: string | null;
  quota?: number;
}
export interface ReaderUploadStore {
  create(userId: string, input: ReaderUploadInput): Promise<ReaderUploadRecord>;
  read(userId: string, id: string): Promise<ReaderUploadRecord>;
  begin(
    userId: string,
    id: string,
    kind: ReaderUploadMutation,
    index: number,
    hash?: string,
    size?: number,
  ): Promise<{ dispatch: boolean; record: ReaderUploadRecord }>;
  receipt(
    userId: string,
    id: string,
    kind: ReaderUploadMutation,
    index: number,
    result: { providerUploadId?: string; etag?: string },
  ): Promise<ReaderUploadRecord>;
  unknown(userId: string, id: string, kind: ReaderUploadMutation, index: number): Promise<void>;
}
export interface ReaderUploadProvider {
  create(record: ReaderUploadRecord): Promise<string>;
  uploadPart(record: ReaderUploadRecord, index: number, bytes: Uint8Array): Promise<string>;
  complete(record: ReaderUploadRecord): Promise<void>;
  head(
    record: ReaderUploadRecord,
  ): Promise<{ nonce: string; sha256: string; byteSize: number } | null>;
  abort(record: ReaderUploadRecord): Promise<void>;
}

/** Every provider mutation follows a committed journal row. A lost response is never inferred away. */
export class ReaderUploadService {
  constructor(
    private readonly store: ReaderUploadStore,
    private readonly provider: ReaderUploadProvider,
  ) {}

  private async mutate(
    userId: string,
    id: string,
    kind: ReaderUploadMutation,
    index: number,
    run: (record: ReaderUploadRecord) => Promise<{ providerUploadId?: string; etag?: string }>,
    hash?: string,
    size?: number,
  ) {
    const admission = await this.store.begin(userId, id, kind, index, hash, size);
    if (!admission.dispatch) return admission.record;
    try {
      const result = await run(admission.record);
      return await this.store.receipt(userId, id, kind, index, result);
    } catch {
      // If this write fails too, the original durable pending row still blocks deletion and retries.
      await this.store.unknown(userId, id, kind, index).catch(() => undefined);
      throw new Error('Upload outcome is unknown. Check its status before continuing.');
    }
  }

  async create(userId: string, input: ReaderUploadInput) {
    const record = await this.store.create(userId, input);
    return this.mutate(userId, record.id, 'create', -1, async (current) => ({
      providerUploadId: await this.provider.create(current),
    }));
  }

  async chunk(userId: string, id: string, index: number, bytes: Uint8Array) {
    if (
      !Number.isSafeInteger(index) ||
      index < 0 ||
      bytes.byteLength === 0 ||
      bytes.byteLength > READER_UPLOAD_CHUNK_BYTES
    )
      throw new Error('Invalid upload chunk.');
    const hash = createHash('sha256').update(bytes).digest('hex');
    return this.mutate(
      userId,
      id,
      'part',
      index,
      async (record) => ({ etag: await this.provider.uploadPart(record, index, bytes) }),
      hash,
      bytes.byteLength,
    );
  }

  async authorizeChunk(userId: string, id: string, index: number): Promise<number> {
    const record = await this.store.read(userId, id);
    const size = Math.min(
      READER_UPLOAD_CHUNK_BYTES,
      record.byteSize - index * READER_UPLOAD_CHUNK_BYTES,
    );
    if (
      !Number.isSafeInteger(index) ||
      index < 0 ||
      index > record.nextChunkIndex ||
      size <= 0 ||
      ['cleanup_pending', 'deleted', 'ready'].includes(record.state)
    )
      throw new Error('Invalid upload chunk.');
    return size;
  }

  async finalize(userId: string, id: string) {
    return this.mutate(userId, id, 'complete', -1, async (record) => {
      await this.provider.complete(record);
      const observed = await this.provider.head(record);
      if (
        !observed ||
        observed.nonce !== record.nonce ||
        observed.sha256 !== record.sha256 ||
        observed.byteSize !== record.byteSize
      )
        throw new Error('Completed upload verification failed.');
      return {};
    });
  }

  async abort(userId: string, id: string) {
    return this.mutate(userId, id, 'abort', -1, async (record) => {
      await this.provider.abort(record);
      return {};
    });
  }

  async status(userId: string, id: string) {
    const record = await this.store.read(userId, id);
    if (record.pendingKind === 'complete') {
      const observed = await this.provider.head(record).catch(() => null);
      if (
        observed &&
        observed.nonce === record.nonce &&
        observed.sha256 === record.sha256 &&
        observed.byteSize === record.byteSize
      ) {
        return this.store.receipt(userId, id, 'complete', -1, {});
      }
    }
    return record;
  }
}
