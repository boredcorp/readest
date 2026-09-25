import type { NextApiRequest, NextApiResponse } from 'next';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import { createSupabaseAdminClient } from '@/utils/supabase';
import { validateUserAndToken } from '@/utils/access';
import { deleteObject } from '@/utils/object';
import { isValidStorageFileKey } from '@/utils/storageDeletion';

interface BulkDeleteResult {
  success: string[];
  failed: Array<{ fileKey: string; error: string }>;
  deletedCount: number;
  failedCount: number;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await runMiddleware(req, res, corsAllMethods);

  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { user, token } = await validateUserAndToken(req.headers['authorization']);
    if (!user || !token) {
      return res.status(403).json({ error: 'Not authenticated' });
    }

    const { fileKeys } = req.body ?? {};

    if (!fileKeys || !Array.isArray(fileKeys)) {
      return res.status(400).json({ error: 'Missing or invalid fileKeys array' });
    }

    if (fileKeys.length === 0) {
      return res.status(400).json({ error: 'fileKeys array cannot be empty' });
    }

    if (fileKeys.length > 100) {
      return res.status(400).json({ error: 'Cannot delete more than 100 files at once' });
    }

    if (!fileKeys.every((key) => typeof key === 'string')) {
      return res.status(400).json({ error: 'All fileKeys must be strings' });
    }
    if (!fileKeys.every(isValidStorageFileKey)) {
      return res.status(400).json({ error: 'Invalid fileKey' });
    }
    const uniqueFileKeys = [...new Set<string>(fileKeys)];
    if (uniqueFileKeys.some((key) => !key.startsWith(`${user.id}/`))) {
      return res.status(403).json({ error: 'Unauthorized access to one or more files' });
    }

    const supabase = createSupabaseAdminClient();

    // Fetch all files that match the provided keys and belong to the user
    const { data: fileRecords, error: fileError } = await supabase
      .from('files')
      .select('id, user_id, file_key')
      .eq('user_id', user.id)
      .in('file_key', uniqueFileKeys)
      .is('deleted_at', null);

    if (fileError) {
      return res.status(500).json({ error: 'Failed to retrieve files for deletion' });
    }

    // Verify all files belong to the user
    const unauthorizedFiles = (fileRecords ?? []).filter((record) => record.user_id !== user.id);
    if (unauthorizedFiles.length > 0) {
      return res.status(403).json({ error: 'Unauthorized access to one or more files' });
    }

    const recordsByKey = new Map((fileRecords ?? []).map((record) => [record.file_key, record]));
    // Retry missing owner records too; storage must confirm each deletion.
    const results = await Promise.all(
      uniqueFileKeys.map(async (fileKey) => {
        try {
          await deleteObject(fileKey);
          const fileRecord = recordsByKey.get(fileKey);
          if (fileRecord) {
            const { error: deleteError } = await supabase
              .from('files')
              .delete()
              .eq('id', fileRecord.id);
            if (deleteError) {
              return { fileKey, success: false, error: 'Could not update file record' };
            }
          }

          return { fileKey, success: true };
        } catch {
          return {
            fileKey,
            success: false,
            error: 'Could not delete file from storage',
          };
        }
      }),
    );

    const success: string[] = [];
    const failed: Array<{ fileKey: string; error: string }> = [];

    results.forEach((result) => {
      if (result.success) {
        success.push(result.fileKey);
      } else {
        failed.push({
          fileKey: result.fileKey,
          error: result.error || 'Could not delete file from storage',
        });
      }
    });

    const response: BulkDeleteResult = {
      success,
      failed,
      deletedCount: success.length,
      failedCount: failed.length,
    };

    // Return 207 Multi-Status if there are partial failures
    const statusCode =
      failed.length > 0 && success.length > 0 ? 207 : failed.length > 0 ? 500 : 200;

    return res.status(statusCode).json(response);
  } catch {
    return res.status(500).json({ error: 'Something went wrong' });
  }
}
