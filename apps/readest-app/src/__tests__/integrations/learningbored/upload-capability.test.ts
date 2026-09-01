import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  LEARNINGBORED_READER_BUCKET_NAME,
  parseReaderUploadCapabilityWindow,
  READER_PERMANENT_UPLOAD_MAX_TTL_SECONDS,
} from '@/integrations/learningbored/upload-capability';

const bucketName = LEARNINGBORED_READER_BUCKET_NAME;
const accountId = 'abcdef0123456789abcdef0123456789';
const canonicalOrigin = `https://${accountId}.eu.r2.cloudflarestorage.com`;
const objectKey = '11111111-1111-4111-8111-111111111111/UmVhZGVzdC9Cb29rcy9GaWN0aW9uYWwuZXB1Yg';

function signedUrl(
  path = `/${bucketName}/${objectKey}`,
  expires = READER_PERMANENT_UPLOAD_MAX_TTL_SECONDS,
) {
  const url = new URL(`${canonicalOrigin}${path}`);
  url.searchParams.set('X-Amz-Date', '20260901T120000Z');
  url.searchParams.set('X-Amz-Expires', String(expires));
  url.searchParams.set('X-Amz-Algorithm', 'AWS4-HMAC-SHA256');
  url.searchParams.set('X-Amz-Credential', 'fictional-access/20260901/auto/s3/aws4_request');
  url.searchParams.set('X-Amz-SignedHeaders', 'content-length;host');
  url.searchParams.set('X-Amz-Signature', 'fictional-signature');
  return url.toString();
}

describe('permanent Reader upload capability proof', () => {
  const previousAccountId = process.env['R2_ACCOUNT_ID'];
  const previousDeploymentProfile = process.env['NEXT_PUBLIC_LEARNINGBORED_DEPLOYMENT_PROFILE'];

  beforeEach(() => {
    process.env['R2_ACCOUNT_ID'] = accountId;
    process.env['NEXT_PUBLIC_LEARNINGBORED_DEPLOYMENT_PROFILE'] = 'private_beta';
  });

  afterEach(() => {
    previousAccountId === undefined
      ? delete process.env['R2_ACCOUNT_ID']
      : (process.env['R2_ACCOUNT_ID'] = previousAccountId);
    previousDeploymentProfile === undefined
      ? delete process.env['NEXT_PUBLIC_LEARNINGBORED_DEPLOYMENT_PROFILE']
      : (process.env['NEXT_PUBLIC_LEARNINGBORED_DEPLOYMENT_PROFILE'] = previousDeploymentProfile);
  });

  it('parses the exact 1800-second capability only for /bucket/owner/opaque-name', () => {
    expect(parseReaderUploadCapabilityWindow(signedUrl(), bucketName, objectKey)).toEqual({
      issuedAt: '2026-09-01T12:00:00.000Z',
      expiresAt: '2026-09-01T12:30:00.000Z',
    });
  });

  it.each([
    [`/extra/${bucketName}/${objectKey}`, bucketName, objectKey],
    [`/wrong-bucket/${objectKey}`, bucketName, objectKey],
    [`/${bucketName}/${objectKey}/extra`, bucketName, objectKey],
    [`/${bucketName}/${objectKey}`, bucketName, `${objectKey}-other`],
    [`/${bucketName}/11111111-1111-4111-8111-111111111111/..`, bucketName, objectKey],
  ])('rejects a signed path that is not the exact intended object: %s', (path, bucket, key) => {
    expect(() => parseReaderUploadCapabilityWindow(signedUrl(path), bucket, key)).toThrow(
      'Invalid permanent Reader upload capability path.',
    );
  });

  it.each([1, 1799, 1801, 86400])('rejects any signing TTL other than 1800 seconds: %s', (ttl) => {
    expect(() =>
      parseReaderUploadCapabilityWindow(signedUrl(undefined, ttl), bucketName, objectKey),
    ).toThrow('Invalid permanent Reader upload capability window.');
  });

  it('rejects malformed AWS signing timestamps', () => {
    const url = new URL(signedUrl());
    url.searchParams.set('X-Amz-Date', '2026-09-01T12:00:00Z');
    expect(() => parseReaderUploadCapabilityWindow(url.toString(), bucketName, objectKey)).toThrow(
      'Invalid permanent Reader upload capability window.',
    );
  });

  it.each([
    'https://11111111111111111111111111111111.eu.r2.cloudflarestorage.com',
    `https://${accountId}.r2.cloudflarestorage.com`,
    `https://user@${accountId}.eu.r2.cloudflarestorage.com`,
    `https://${accountId}.eu.r2.cloudflarestorage.com:8443`,
  ])('rejects a capability outside the exact configured R2 origin: %s', (origin) => {
    const url = new URL(signedUrl());
    const replacement = new URL(origin);
    url.protocol = replacement.protocol;
    url.hostname = replacement.hostname;
    url.port = replacement.port;
    url.username = replacement.username;
    expect(() => parseReaderUploadCapabilityWindow(url.toString(), bucketName, objectKey)).toThrow(
      'Invalid permanent Reader upload capability path.',
    );
  });

  it.each([
    ['unexpected', 'value'],
    ['X-Amz-SignedHeaders', 'host'],
    ['X-Amz-Algorithm', 'NOT-SIGV4'],
  ])('rejects unexpected or incomplete SigV4 query state: %s', (key, value) => {
    const url = new URL(signedUrl());
    url.searchParams.set(key, value);
    expect(() => parseReaderUploadCapabilityWindow(url.toString(), bucketName, objectKey)).toThrow(
      'Invalid permanent Reader upload capability signature.',
    );
  });
});
