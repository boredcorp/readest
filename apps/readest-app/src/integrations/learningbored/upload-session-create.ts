import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { createUploadSessionRequestSchema } from '@learningbored/sdk';
import { getStoragePlanData, STORAGE_QUOTA_GRACE_BYTES } from '@/utils/access';
import { buildReaderPermanentStorageKey } from './permanent-storage-key';
import {
  createReaderUploadService,
  ReaderUploadError,
  readerUploadResponse,
} from './upload-session-server';

const inputSchema = createUploadSessionRequestSchema.extend({
  uploadId: z.string().uuid(),
  fileName: z.string().min(1).max(1024),
  bookHash: z.string().max(255).optional(),
});

export async function createPrivateReaderUpload(
  req: NextApiRequest,
  res: NextApiResponse,
  userId: string,
  token: string,
) {
  const parsed = inputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid upload session request.' });
  const input = parsed.data;
  // The owner-locked RPC counts stored bytes and reservations after recognizing an idempotent retry.
  const { quota } = getStoragePlanData(token);
  let fileKey: string;
  try {
    fileKey = buildReaderPermanentStorageKey(userId, input.fileName);
    if (fileKey.length + 33 > 1024) throw new Error('Upload key exceeds storage limit.');
  } catch {
    return res.status(400).json({ error: 'Invalid permanent Reader upload path.' });
  }
  try {
    const session = await createReaderUploadService().create(userId, {
      id: input.uploadId,
      fileKey,
      byteSize: input.byteSize,
      contentType: input.contentType,
      sha256: input.sha256,
      bookHash: input.bookHash ?? null,
      quota: quota + STORAGE_QUOTA_GRACE_BYTES,
    });
    return res.status(200).json(readerUploadResponse(session));
  } catch (error) {
    if (error instanceof ReaderUploadError)
      return res.status(error.status).json({ error: error.message });
    return res.status(409).json({
      error: 'Upload outcome is unknown. Check its status before continuing.',
      uploadId: input.uploadId,
    });
  }
}
