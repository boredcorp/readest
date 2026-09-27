import type { NextApiRequest, NextApiResponse } from 'next';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import { createSupabaseAdminClient } from '@/utils/supabase';
import { validateUserAndToken } from '@/utils/access';
import { deleteObject } from '@/utils/object';
import { getLearningBoredPrivateBetaPolicy } from '@/integrations/learningbored/private-beta-policy';
import { deletePrivateReaderFile } from '@/integrations/learningbored/file-deletion';
import { ReaderUploadError } from '@/integrations/learningbored/upload-session-server';
import {
  readerStorageObjectKey,
  readerStorageProjection,
} from '@/integrations/learningbored/storage-object-key';

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

    if (!fileKey || typeof fileKey !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid fileKey' });
    }

    if (getLearningBoredPrivateBetaPolicy().active) {
      const complete = await deletePrivateReaderFile(user.id, fileKey);
      return res.status(complete ? 200 : 202).json({
        state: complete ? 'deleted' : 'cleanup_pending',
        message: complete
          ? 'File deleted successfully'
          : 'File hidden; storage cleanup is pending.',
      });
    }

    const supabase = createSupabaseAdminClient();
    const { data: fileRecord, error: fileError } = await supabase
      .from('files')
      .select(readerStorageProjection('user_id, id, file_key'))
      .eq('user_id', user.id)
      .eq('file_key', fileKey)
      .limit(1)
      .single();

    if (fileError || !fileRecord) {
      return res.status(404).json({ error: 'File not found' });
    }

    if (fileRecord.user_id !== user.id) {
      return res.status(403).json({ error: 'Unauthorized access to the file' });
    }

    try {
      await deleteObject(readerStorageObjectKey(fileRecord, user.id));
      const { error: deleteError } = await supabase.from('files').delete().eq('id', fileRecord.id);

      if (deleteError) {
        console.error('Error updating file record:', deleteError);
        return res.status(500).json({ error: 'Could not update file record' });
      }

      res.status(200).json({ message: 'File deleted successfully' });
    } catch (error) {
      console.error('Error deleting file from S3:', error);
      res.status(500).json({ error: 'Could not delete file from storage' });
    }
  } catch (error) {
    if (error instanceof ReaderUploadError)
      return res.status(error.status).json({ error: error.message });
    console.error(error);
    return res.status(500).json({ error: 'Something went wrong' });
  }
}
