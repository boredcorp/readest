import { createHash } from 'node:crypto';
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { z } from 'zod';
import { UPLOAD_CHUNK_BYTES, uploadSessionResponseSchema } from '@learningbored/sdk';
import { createSupabaseAdminClient } from '@/utils/supabase';
import { buildR2ObjectUrl } from '@/utils/r2';
import { getStorageType } from '@/utils/storage';
import { getDefaultStorageBucketName } from '@/utils/object';
import { LEARNINGBORED_READER_BUCKET_NAME } from './upload-capability';
import {
  ReaderUploadService,
  type ReaderUploadProvider,
  type ReaderUploadRecord,
  type ReaderUploadStore,
} from './upload-session';

const recordSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  fileKey: z.string(),
  objectKey: z.string(),
  byteSize: z.number().int().positive(),
  contentType: z.string(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  nonce: z.string().uuid(),
  state: z.enum(['open', 'uploading', 'ready', 'unknown', 'cleanup_pending', 'deleted']),
  providerUploadId: z.string().nullable(),
  nextChunkIndex: z.number().int().nonnegative(),
  parts: z.array(z.object({ index: z.number().int().nonnegative(), etag: z.string() })),
  pendingKind: z.enum(['create', 'part', 'complete', 'abort']).nullable(),
  completed: z.boolean().optional(),
});

export function readerUploadResponse(record: ReaderUploadRecord) {
  return uploadSessionResponseSchema.parse({
    uploadId: record.id,
    state: record.state,
    chunkSize: UPLOAD_CHUNK_BYTES,
    nextChunkIndex: record.nextChunkIndex,
    byteSize: record.byteSize,
  });
}

export class ReaderUploadError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function createReaderUploadStore(): ReaderUploadStore {
  const supabase = createSupabaseAdminClient();
  const call = async (name: string, args: Record<string, unknown>) => {
    const { data, error } = await supabase.rpc(name, args);
    if (error) {
      if (error.code === 'LB001')
        throw new ReaderUploadError(403, 'Reader access has been revoked.');
      if (error.code === 'LB005') throw new ReaderUploadError(404, 'Upload not found.');
      if (['LB004', 'LB006', '23505'].includes(error.code))
        throw new ReaderUploadError(
          409,
          'Upload cannot continue until its previous operation is settled.',
        );
      throw new ReaderUploadError(503, 'Upload state is unavailable.');
    }
    return data as unknown;
  };
  return {
    create: async (userId, input) =>
      recordSchema.parse(
        await call('learningbored_create_reader_upload', {
          p_user_id: userId,
          p_id: input.id,
          p_file_key: input.fileKey,
          p_byte_size: input.byteSize,
          p_content_type: input.contentType,
          p_sha256: input.sha256,
          p_book_hash: input.bookHash,
          p_quota: input.quota,
        }),
      ),
    read: async (userId, id) => {
      const value = await call('learningbored_get_reader_upload', { p_user_id: userId, p_id: id });
      if (!value) throw new ReaderUploadError(404, 'Upload not found.');
      return recordSchema.parse(value);
    },
    begin: async (userId, id, kind, index, hash, size) =>
      z.object({ dispatch: z.boolean(), record: recordSchema }).parse(
        await call('learningbored_begin_reader_upload_mutation', {
          p_user_id: userId,
          p_id: id,
          p_kind: kind,
          p_index: index,
          p_sha256: hash ?? null,
          p_byte_size: size ?? null,
        }),
      ),
    receipt: async (userId, id, kind, index, result) =>
      recordSchema.parse(
        await call('learningbored_record_reader_upload_receipt', {
          p_user_id: userId,
          p_id: id,
          p_kind: kind,
          p_index: index,
          p_provider_upload_id: result.providerUploadId ?? null,
          p_etag: result.etag ?? null,
        }),
      ),
    unknown: async (userId, id, kind, index) => {
      await call('learningbored_mark_reader_upload_unknown', {
        p_user_id: userId,
        p_id: id,
        p_kind: kind,
        p_index: index,
      });
    },
  };
}

function createReaderStorageClient() {
  const bucket = getDefaultStorageBucketName();
  if (getStorageType() !== 'r2' || bucket !== LEARNINGBORED_READER_BUCKET_NAME)
    throw new ReaderUploadError(503, 'Private Reader storage is unavailable.');
  const endpoint = new URL(buildR2ObjectUrl(bucket, 'configuration-check')).origin;
  const accessKeyId = process.env['R2_ACCESS_KEY_ID'];
  const secretAccessKey = process.env['R2_SECRET_ACCESS_KEY'];
  if (!accessKeyId || !secretAccessKey)
    throw new ReaderUploadError(503, 'Private Reader storage is unavailable.');
  const client = new S3Client({
    region: 'auto',
    endpoint,
    forcePathStyle: true,
    maxAttempts: 1,
    credentials: { accessKeyId, secretAccessKey },
    requestChecksumCalculation: 'WHEN_REQUIRED',
  });
  return { bucket, client };
}

export async function deletePrivateReaderObject(objectKey: string): Promise<void> {
  const { bucket, client } = createReaderStorageClient();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }), {
    abortSignal: AbortSignal.timeout(30_000),
  });
}

export function createReaderUploadProvider(): ReaderUploadProvider {
  const { bucket, client } = createReaderStorageClient();
  const identity = (record: ReaderUploadRecord) => ({ Bucket: bucket, Key: record.objectKey });
  return {
    create: async (record) => {
      const response = await client.send(
        new CreateMultipartUploadCommand({
          ...identity(record),
          ContentType: record.contentType,
          Metadata: { 'lb-upload-nonce': record.nonce, 'lb-content-sha256': record.sha256 },
        }),
        { abortSignal: AbortSignal.timeout(30_000) },
      );
      if (!response.UploadId) throw new Error('Missing provider receipt.');
      return response.UploadId;
    },
    uploadPart: async (record, index, bytes) => {
      const response = await client.send(
        new UploadPartCommand({
          ...identity(record),
          UploadId: record.providerUploadId!,
          PartNumber: index + 1,
          Body: bytes,
          ContentLength: bytes.byteLength,
          ContentMD5: createHash('md5').update(bytes).digest('base64'),
        }),
        { abortSignal: AbortSignal.timeout(30_000) },
      );
      if (!response.ETag) throw new Error('Missing provider receipt.');
      return response.ETag;
    },
    complete: async (record) => {
      await client.send(
        new CompleteMultipartUploadCommand({
          ...identity(record),
          UploadId: record.providerUploadId!,
          MultipartUpload: {
            Parts: record.parts.map((part) => ({ PartNumber: part.index + 1, ETag: part.etag })),
          },
        }),
        { abortSignal: AbortSignal.timeout(30_000) },
      );
    },
    head: async (record) => {
      // HEAD metadata identifies this attempt. Stream the bytes to independently verify the content
      // hash without buffering the whole book. Neither a 404 nor a failed read is a negative receipt.
      const result = await client.send(new HeadObjectCommand(identity(record)), {
        abortSignal: AbortSignal.timeout(30_000),
      });
      if (
        result.Metadata?.['lb-upload-nonce'] !== record.nonce ||
        result.Metadata?.['lb-content-sha256'] !== record.sha256 ||
        result.ContentLength !== record.byteSize ||
        !result.ETag
      )
        return null;
      const object = await client.send(
        new GetObjectCommand({ ...identity(record), IfMatch: result.ETag }),
        { abortSignal: AbortSignal.timeout(30_000) },
      );
      if (!object.Body) return null;
      const hash = createHash('sha256');
      let count = 0;
      const stream = object.Body.transformToWebStream();
      const reader = stream.getReader();
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          count += chunk.value.byteLength;
          if (count > record.byteSize) {
            await reader.cancel();
            return null;
          }
          hash.update(chunk.value);
        }
      } finally {
        reader.releaseLock();
      }
      return {
        nonce: result.Metadata['lb-upload-nonce'],
        sha256: hash.digest('hex'),
        byteSize: count,
      };
    },
    abort: async (record) => {
      if (record.providerUploadId)
        await client.send(
          new AbortMultipartUploadCommand({
            ...identity(record),
            UploadId: record.providerUploadId,
          }),
          { abortSignal: AbortSignal.timeout(30_000) },
        );
    },
  };
}

export const createReaderUploadService = () =>
  new ReaderUploadService(createReaderUploadStore(), createReaderUploadProvider());
