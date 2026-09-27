import { z } from 'zod';
import { createSupabaseAdminClient } from '@/utils/supabase';
import { deletePrivateReaderObject, ReaderUploadError } from './upload-session-server';

const admissionSchema = z.object({
  attemptId: z.string().uuid(),
  sessionId: z.string().uuid().nullable(),
  objectKey: z.string().min(1),
});

/** Hide the file and retain its exact remote identity before any DELETE can leave the service. */
export async function deletePrivateReaderFile(userId: string, fileKey: string): Promise<boolean> {
  const supabase = createSupabaseAdminClient();
  const admission = await supabase.rpc('learningbored_begin_reader_file_delete', {
    p_user_id: userId,
    p_file_key: fileKey,
  });
  if (admission.error) {
    if (admission.error.code === 'LB005') throw new ReaderUploadError(404, 'File not found.');
    throw new ReaderUploadError(503, 'File deletion state is unavailable.');
  }
  const attempt = admissionSchema.parse(admission.data);
  if (!attempt.objectKey.startsWith(`${userId}/`))
    throw new ReaderUploadError(503, 'File deletion identity is invalid.');
  const receipt = (success: boolean) =>
    supabase.rpc('learningbored_record_reader_file_delete', {
      p_user_id: userId,
      p_attempt_id: attempt.attemptId,
      p_success: success,
    });
  try {
    await deletePrivateReaderObject(attempt.objectKey);
    const result = await receipt(true);
    if (result.error) return false;
    return result.data === true;
  } catch {
    // A timeout or failed receipt cannot prove that the provider did not process the request.
    // The already-committed pending row remains a barrier even if recording unknown also fails.
    await Promise.resolve(receipt(false)).catch(() => undefined);
    return false;
  }
}
