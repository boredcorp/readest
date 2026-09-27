import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { UPLOAD_CHUNK_BYTES } from '@learningbored/sdk';
import { validateUserAndToken } from '@/utils/access';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import { getLearningBoredPrivateBetaPolicy } from '@/integrations/learningbored/private-beta-policy';
import {
  createReaderUploadService,
  readerUploadResponse,
  ReaderUploadError,
} from '@/integrations/learningbored/upload-session-server';

export const config = { api: { bodyParser: false } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await runMiddleware(req, res, corsAllMethods);
  if (!getLearningBoredPrivateBetaPolicy().active)
    return res.status(404).json({ error: 'Not found' });
  const { user, token } = await validateUserAndToken(req.headers.authorization);
  if (!user || !token) return res.status(403).json({ error: 'Not authenticated' });
  const path = req.query['path'];
  if (!Array.isArray(path) || !z.string().uuid().safeParse(path[0]).success)
    return res.status(400).json({ error: 'Invalid upload path.' });
  const id = path[0]!;
  try {
    const service = createReaderUploadService();
    if (req.method === 'GET' && path.length === 1)
      return res.status(200).json(readerUploadResponse(await service.status(user.id, id)));
    if (req.method === 'DELETE' && path.length === 1)
      return res.status(200).json(readerUploadResponse(await service.abort(user.id, id)));
    if (req.method === 'POST' && path.length === 2 && path[1] === 'finalize')
      return res.status(200).json(readerUploadResponse(await service.finalize(user.id, id)));
    if (
      req.method === 'PUT' &&
      path.length === 3 &&
      path[1] === 'chunks' &&
      /^(0|[1-9][0-9]*)$/u.test(path[2]!)
    ) {
      const contentLength = Number(req.headers['content-length']);
      const index = Number(path[2]);
      if (
        req.headers['content-type'] !== 'application/octet-stream' ||
        !Number.isSafeInteger(contentLength) ||
        contentLength <= 0 ||
        contentLength > UPLOAD_CHUNK_BYTES ||
        !Number.isSafeInteger(index)
      )
        return res.status(400).json({ error: 'Invalid upload chunk.' });
      const expectedSize = await service.authorizeChunk(user.id, id, index);
      if (contentLength !== expectedSize)
        return res.status(400).json({ error: 'Invalid upload chunk size.' });
      const bytes = Buffer.allocUnsafe(contentLength);
      let size = 0;
      for await (const value of req) {
        if (!(value instanceof Uint8Array))
          return res.status(400).json({ error: 'Invalid upload bytes.' });
        if (size + value.byteLength > contentLength)
          return res.status(413).json({ error: 'Upload chunk is too large.' });
        bytes.set(value, size);
        size += value.byteLength;
      }
      if (size !== contentLength)
        return res.status(400).json({ error: 'Incomplete upload chunk.' });
      return res
        .status(200)
        .json(readerUploadResponse(await service.chunk(user.id, id, index, bytes)));
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    if (error instanceof ReaderUploadError)
      return res.status(error.status).json({ error: error.message });
    return res
      .status(409)
      .json({ error: 'Upload is not settled. Check its status before continuing.' });
  }
}
