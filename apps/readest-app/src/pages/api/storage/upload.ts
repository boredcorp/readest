import { createHmac, randomUUID } from 'node:crypto';
import type { NextApiRequest, NextApiResponse } from 'next';
import { createSupabaseAdminClient } from '@/utils/supabase';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import { validateUserAndToken } from '@/utils/access';
import { getDownloadSignedUrl, getUploadSignedUrl } from '@/utils/object';
import { isValidStorageFileKey } from '@/utils/storageDeletion';
import { getStorageReservationQuota } from '@/utils/storageQuota';

const TEMP_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
const TEMP_UPLOAD_TTL_SECONDS = 5 * 60;
const TEMP_STORAGE_NAMESPACE_DOMAIN = 'storybored:readest-temp-storage:v2';

function configuredPublicStorageOrigin(value: string | undefined) {
  if (!value) return undefined;
  try {
    const url = new URL(value.trim());
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    ) {
      return undefined;
    }
    return url.origin;
  } catch {
    return undefined;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await runMiddleware(req, res, corsAllMethods);

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { user, token } = await validateUserAndToken(req.headers['authorization']);
  if (!user || !token) {
    return res.status(403).json({ error: 'Not authenticated' });
  }

  const { fileName, fileSize, bookHash, temp = false } = req.body ?? {};
  if (temp) {
    if (!Number.isSafeInteger(fileSize) || fileSize <= 0 || fileSize > TEMP_IMAGE_MAX_BYTES) {
      return res.status(400).json({ error: 'Invalid temporary image size' });
    }
    const bucketName = process.env['TEMP_STORAGE_PUBLIC_BUCKET_NAME']?.trim();
    const namespaceSecret = process.env['READEST_TEMP_STORAGE_NAMESPACE_SECRET'] ?? '';
    const publicBaseUrl = configuredPublicStorageOrigin(
      process.env['READEST_PUBLIC_STORAGE_BASE_URL'],
    );
    if (!bucketName || namespaceSecret.trim().length < 32 || !publicBaseUrl) {
      return res.status(503).json({ error: 'Temporary storage is not configured' });
    }
    try {
      const namespace = createHmac('sha256', namespaceSecret)
        .update(`${TEMP_STORAGE_NAMESPACE_DOMAIN}\0${user.id}`, 'utf8')
        .digest('hex');
      const fileKey = `temp/img/v2/${namespace}/${randomUUID()}`;
      const uploadUrl = await getUploadSignedUrl(
        fileKey,
        fileSize,
        TEMP_UPLOAD_TTL_SECONDS,
        bucketName,
      );
      const downloadUrl = await getDownloadSignedUrl(fileKey, 3 * 86400, bucketName);
      const pathname = new URL(downloadUrl).pathname;
      const publicDownloadUrl = `${publicBaseUrl}${pathname.replace(`/${bucketName}`, '')}`;
      return res.status(200).json({
        uploadUrl,
        downloadUrl: publicDownloadUrl,
      });
    } catch (error) {
      console.error('Error creating presigned post for temp file:', error);
      return res.status(500).json({ error: 'Could not create presigned post' });
    }
  }

  try {
    if (
      !isValidStorageFileKey(fileName) ||
      !Number.isSafeInteger(fileSize) ||
      fileSize <= 0 ||
      typeof bookHash !== 'string' ||
      !/^[a-f0-9]{32}$/.test(bookHash)
    ) {
      return res.status(400).json({ error: 'Invalid file info' });
    }

    const { quota, reservationLimit } = getStorageReservationQuota(token);
    const fileKey = `${user.id}/${fileName}`;
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase.rpc('reserve_readest_file', {
      p_user_id: user.id,
      p_file_key: fileKey,
      p_book_hash: bookHash,
      p_file_size: fileSize,
      p_quota_bytes: reservationLimit,
    });
    if (error) {
      const errors: Record<string, [number, string]> = {
        P0001: [403, 'Insufficient storage quota'],
        '23505': [409, 'File reservation does not match'],
        '22023': [400, 'Invalid file info'],
      };
      const [status, message] = errors[error.code] ?? [500, 'Could not reserve storage'];
      return res.status(status).json({ error: message });
    }
    const reservation = Array.isArray(data) && data.length === 1 ? data[0] : undefined;
    if (
      !reservation ||
      reservation.file_key !== fileKey ||
      reservation.file_size !== fileSize ||
      reservation.quota !== reservationLimit ||
      !Number.isSafeInteger(reservation.usage) ||
      reservation.usage < fileSize
    ) {
      return res.status(500).json({ error: 'Could not reserve storage' });
    }

    try {
      // Reservations survive signing/PUT failures: a retry must use the same
      // owner, key, hash and size. Issuing a URL is not proof of stored bytes.
      const uploadUrl = await getUploadSignedUrl(fileKey, fileSize, 1800);

      res.status(200).json({
        uploadUrl,
        fileKey,
        usage: reservation.usage,
        quota,
      });
    } catch (error) {
      console.error('Error creating presigned post:', error);
      res.status(500).json({ error: 'Could not create presigned post' });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Something went wrong' });
  }
}
