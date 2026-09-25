import type { NextApiRequest, NextApiResponse } from 'next';
import { createSupabaseAdminClient } from '@/utils/supabase';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import { validateUserAndToken } from '@/utils/access';
import { getStorageReservationQuota } from '@/utils/storageQuota';

interface StorageSnapshot {
  totalFiles: number;
  totalSize: number;
  byBookHash: { bookHash: string | null; fileCount: number; totalSize: number }[];
}

function isStorageSnapshot(value: unknown): value is StorageSnapshot {
  if (!value || typeof value !== 'object') return false;
  const data = value as Partial<StorageSnapshot>;
  if (
    typeof data.totalFiles !== 'number' ||
    !Number.isSafeInteger(data.totalFiles) ||
    data.totalFiles < 0 ||
    typeof data.totalSize !== 'number' ||
    !Number.isSafeInteger(data.totalSize) ||
    data.totalSize < 0 ||
    !Array.isArray(data.byBookHash)
  )
    return false;
  let files = 0;
  let size = 0;
  const hashes = new Set<string | null>();
  for (const group of data.byBookHash) {
    if (
      !group ||
      (group.bookHash !== null && typeof group.bookHash !== 'string') ||
      !Number.isSafeInteger(group.fileCount) ||
      group.fileCount <= 0 ||
      !Number.isSafeInteger(group.totalSize) ||
      group.totalSize <= 0 ||
      hashes.has(group.bookHash)
    )
      return false;
    hashes.add(group.bookHash);
    files += group.fileCount;
    size += group.totalSize;
    if (!Number.isSafeInteger(files) || !Number.isSafeInteger(size)) return false;
  }
  return files === data.totalFiles && size === data.totalSize;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await runMiddleware(req, res, corsAllMethods);
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { user, token } = await validateUserAndToken(req.headers['authorization']);
    if (!user || !token) return res.status(403).json({ error: 'Not authenticated' });
    const { quota } = getStorageReservationQuota(token);
    // One database snapshot includes all active reservations, including PUTs
    // which have not completed. Token usage and paginated sums are not authority.
    const { data, error } = await createSupabaseAdminClient().rpc('get_readest_storage_stats', {
      p_user_id: user.id,
    });
    if (error || !isStorageSnapshot(data)) {
      return res.status(500).json({ error: 'Failed to retrieve storage statistics' });
    }
    return res.status(200).json({
      totalFiles: data.totalFiles,
      totalSize: data.totalSize,
      usage: data.totalSize,
      quota,
      usagePercentage: Math.round((data.totalSize / quota) * 100),
      byBookHash: data.byBookHash,
    });
  } catch {
    return res.status(500).json({ error: 'Failed to retrieve storage statistics' });
  }
}
