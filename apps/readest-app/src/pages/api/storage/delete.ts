import type { NextApiRequest, NextApiResponse } from 'next';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import { createSupabaseAdminClient } from '@/utils/supabase';
import { validateUserAndToken } from '@/utils/access';
import { deleteObject } from '@/utils/object';
import { isValidStorageFileKey } from '@/utils/storageDeletion';

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

    const { fileKey } = req.query;

    if (!isValidStorageFileKey(fileKey)) {
      return res.status(400).json({ error: 'Missing or invalid fileKey' });
    }
    if (!fileKey.startsWith(`${user.id}/`)) {
      return res.status(403).json({ error: 'Unauthorized access to the file' });
    }

    const supabase = createSupabaseAdminClient();
    const { data: fileRecord, error: fileError } = await supabase
      .from('files')
      .select('user_id, id')
      .eq('user_id', user.id)
      .eq('file_key', fileKey)
      .limit(1)
      .maybeSingle();

    if (fileError) {
      return res.status(500).json({ error: 'Could not retrieve file record' });
    }

    if (fileRecord && fileRecord.user_id !== user.id) {
      return res.status(403).json({ error: 'Unauthorized access to the file' });
    }

    try {
      // A missing owner-scoped record can be an optional cover or a retry.
      // Still require storage to acknowledge DELETE before reporting success.
      await deleteObject(fileKey);
      if (fileRecord) {
        const { error: deleteError } = await supabase
          .from('files')
          .delete()
          .eq('id', fileRecord.id);
        if (deleteError) {
          return res.status(500).json({ error: 'Could not update file record' });
        }
      }

      res.status(200).json({ message: 'File deleted successfully' });
    } catch {
      res.status(500).json({ error: 'Could not delete file from storage' });
    }
  } catch {
    return res.status(500).json({ error: 'Something went wrong' });
  }
}
