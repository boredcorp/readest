import { getLearningBoredPrivateBetaPolicy } from './private-beta-policy';

/** Keep upstream logical filenames stable while each private upload has its own immutable key. */
export function readerStorageProjection<T extends string>(columns: T): T {
  // Preserve Supabase's inference for the common fields. The optional extra column is validated
  // at the object-key boundary below, and is never requested from an upstream Reader database.
  return (
    getLearningBoredPrivateBetaPolicy().active ? `${columns}, storage_object_key` : columns
  ) as T;
}

export function readerStorageObjectKey(
  record: { file_key: string; storage_object_key?: unknown },
  userId: string,
): string {
  if (!getLearningBoredPrivateBetaPolicy().active) return record.file_key;
  const key = record.storage_object_key ?? record.file_key;
  if (
    typeof key !== 'string' ||
    !key.startsWith(`${userId}/`) ||
    key.slice(userId.length + 1).includes('/') ||
    /[\u0000-\u001f\\]/u.test(key)
  )
    throw new Error('Invalid private Reader object identity.');
  return key;
}
