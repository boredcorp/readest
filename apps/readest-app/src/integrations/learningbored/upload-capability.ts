import { buildR2ObjectUrl } from '@/utils/r2';

export const READER_PERMANENT_UPLOAD_MAX_TTL_SECONDS = 30 * 60;
export const LEARNINGBORED_READER_BUCKET_NAME = 'learningbored-reader-eu';

const REQUIRED_SIGV4_QUERY_KEYS = new Set([
  'X-Amz-Algorithm',
  'X-Amz-Credential',
  'X-Amz-Date',
  'X-Amz-Expires',
  'X-Amz-SignedHeaders',
  'X-Amz-Signature',
]);
const ALLOWED_SIGV4_QUERY_KEYS = new Set([...REQUIRED_SIGV4_QUERY_KEYS, 'X-Amz-Security-Token']);

export interface ReaderUploadCapabilityWindow {
  issuedAt: string;
  expiresAt: string;
}

function parseAwsSigningDate(value: string): Date | undefined {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/u.exec(value);
  if (!match) return undefined;

  const [, year, month, day, hour, minute, second] = match;
  const timestamp = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/**
 * Returns the exact capability window encoded into an AWS v4 presigned URL. The database records this
 * bound before the URL is returned, so account deletion can conservatively wait through it plus the
 * existing 24-hour late-write grace.
 */
export function parseReaderUploadCapabilityWindow(
  signedUrl: string,
  expectedBucketName: string,
  expectedObjectKey: string,
): ReaderUploadCapabilityWindow {
  let url: URL;
  let expectedUrl: URL;
  try {
    url = new URL(signedUrl);
    expectedUrl = new URL(buildR2ObjectUrl(expectedBucketName, expectedObjectKey));
  } catch {
    throw new Error('Invalid permanent Reader upload capability path.');
  }
  if (
    url.protocol !== 'https:' ||
    url.username !== '' ||
    url.password !== '' ||
    url.port !== '' ||
    url.origin !== expectedUrl.origin ||
    url.pathname !== expectedUrl.pathname ||
    url.hash !== ''
  ) {
    throw new Error('Invalid permanent Reader upload capability path.');
  }

  const queryKeys = [...url.searchParams.keys()];
  if (
    queryKeys.some(
      (key, index) => !ALLOWED_SIGV4_QUERY_KEYS.has(key) || queryKeys.indexOf(key) !== index,
    ) ||
    [...REQUIRED_SIGV4_QUERY_KEYS].some((key) => !url.searchParams.has(key)) ||
    url.searchParams.get('X-Amz-Algorithm') !== 'AWS4-HMAC-SHA256' ||
    !url.searchParams.get('X-Amz-Credential') ||
    !url.searchParams.get('X-Amz-Signature') ||
    !url.searchParams.get('X-Amz-SignedHeaders')?.split(';').includes('content-length')
  ) {
    throw new Error('Invalid permanent Reader upload capability signature.');
  }

  const rawIssuedAt = url.searchParams.get('X-Amz-Date');
  const rawExpiresIn = url.searchParams.get('X-Amz-Expires');
  const issuedAt = rawIssuedAt ? parseAwsSigningDate(rawIssuedAt) : undefined;
  const expiresIn = rawExpiresIn ? Number(rawExpiresIn) : Number.NaN;

  if (
    !issuedAt ||
    !Number.isSafeInteger(expiresIn) ||
    expiresIn !== READER_PERMANENT_UPLOAD_MAX_TTL_SECONDS
  ) {
    throw new Error('Invalid permanent Reader upload capability window.');
  }

  const expiresAt = new Date(issuedAt.getTime() + expiresIn * 1000);
  return {
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
}
