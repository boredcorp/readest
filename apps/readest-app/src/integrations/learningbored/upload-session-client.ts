import { UPLOAD_CHUNK_BYTES, uploadSessionResponseSchema } from '@learningbored/sdk';
import { Sha256 } from '@aws-crypto/sha256-js';
import { getUserID } from '@/utils/access';
import { fetchWithAuth } from '@/utils/fetch';
import type { ProgressHandler } from '@/utils/transfer';

/** The private-beta browser sends bytes only to its authenticated Reader service. */
export async function uploadPrivateReaderFile(
  endpoint: string,
  file: File,
  onProgress?: ProgressHandler,
  bookHash?: string,
) {
  const userId = await getUserID();
  if (!userId) throw new Error('Not authenticated');
  const hash = new Sha256();
  // Hash the same bounded slices that are transmitted; a book may be much larger than one chunk.
  for (let offset = 0; offset < file.size; offset += UPLOAD_CHUNK_BYTES) {
    hash.update(
      new Uint8Array(await file.slice(offset, offset + UPLOAD_CHUNK_BYTES).arrayBuffer()),
    );
  }
  const sha256 = Array.from(hash.digestSync(), (value) => value.toString(16).padStart(2, '0')).join(
    '',
  );
  const storageKey = `learningbored:reader-upload:${userId}:${sha256}:${file.name}`;
  const uploadId = localStorage.getItem(storageKey) ?? crypto.randomUUID();
  // Retain the caller-chosen id before creation: a lost HTTP response must not create another upload.
  localStorage.setItem(storageKey, uploadId);
  const sessionEndpoint = endpoint.replace(/\/upload$/u, `/upload-session/${uploadId}`);
  let response = await fetchWithAuth(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uploadId,
      fileName: file.name,
      byteSize: file.size,
      contentType: file.type || 'application/octet-stream',
      sha256,
      ...(bookHash ? { bookHash } : {}),
    }),
  });
  let session = uploadSessionResponseSchema.parse(await response.json());
  if (
    session.byteSize !== file.size ||
    (session.state !== 'ready' && session.uploadId !== uploadId)
  )
    throw new Error('Unexpected upload session identity.');
  if (session.state === 'unknown') {
    response = await fetchWithAuth(sessionEndpoint, { method: 'GET' });
    session = uploadSessionResponseSchema.parse(await response.json());
    if (session.byteSize !== file.size || session.uploadId !== uploadId)
      throw new Error('Unexpected upload session identity.');
  }
  if (
    session.state === 'unknown' ||
    session.state === 'cleanup_pending' ||
    session.state === 'deleted'
  )
    throw new Error('This upload is not settled. Contact support before trying again.');
  const started = Date.now();
  while (session.state !== 'ready' && session.nextChunkIndex * UPLOAD_CHUNK_BYTES < file.size) {
    const index = session.nextChunkIndex;
    const part = file.slice(
      index * UPLOAD_CHUNK_BYTES,
      Math.min((index + 1) * UPLOAD_CHUNK_BYTES, file.size),
    );
    response = await fetchWithAuth(`${sessionEndpoint}/chunks/${index}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: part,
    });
    session = uploadSessionResponseSchema.parse(await response.json());
    if (session.byteSize !== file.size || session.uploadId !== uploadId)
      throw new Error('Unexpected upload session identity.');
    if (session.state !== 'uploading' || session.nextChunkIndex !== index + 1)
      throw new Error('This upload is not settled. Check its status before continuing.');
    const progress = Math.min(session.nextChunkIndex * UPLOAD_CHUNK_BYTES, file.size);
    onProgress?.({
      progress,
      total: file.size,
      transferSpeed: progress / Math.max((Date.now() - started) / 1000, 0.001),
    });
  }
  if (session.state !== 'ready') {
    response = await fetchWithAuth(`${sessionEndpoint}/finalize`, { method: 'POST' });
    session = uploadSessionResponseSchema.parse(await response.json());
    if (session.byteSize !== file.size || session.uploadId !== uploadId)
      throw new Error('Unexpected upload session identity.');
  }
  if (session.state !== 'ready')
    throw new Error('This upload is not settled. Check its status before continuing.');
  localStorage.removeItem(storageKey);
}
