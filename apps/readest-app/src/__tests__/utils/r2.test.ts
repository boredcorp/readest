import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildR2ObjectUrl, r2Storage } from '@/utils/r2';

describe('R2 object URL construction', () => {
  const previousAccountId = process.env['R2_ACCOUNT_ID'];
  const previousAccessKeyId = process.env['R2_ACCESS_KEY_ID'];
  const previousSecretAccessKey = process.env['R2_SECRET_ACCESS_KEY'];
  const previousDeploymentProfile = process.env['NEXT_PUBLIC_LEARNINGBORED_DEPLOYMENT_PROFILE'];
  const previousLearningBoredEnabled = process.env['NEXT_PUBLIC_LEARNINGBORED_ENABLED'];

  beforeEach(() => {
    process.env['R2_ACCOUNT_ID'] = 'fictional-account';
    process.env['R2_ACCESS_KEY_ID'] = 'fictional-access-key';
    process.env['R2_SECRET_ACCESS_KEY'] = 'fictional-secret-key';
    delete process.env['NEXT_PUBLIC_LEARNINGBORED_DEPLOYMENT_PROFILE'];
    delete process.env['NEXT_PUBLIC_LEARNINGBORED_ENABLED'];
  });

  afterEach(() => {
    previousAccountId === undefined
      ? delete process.env['R2_ACCOUNT_ID']
      : (process.env['R2_ACCOUNT_ID'] = previousAccountId);
    previousAccessKeyId === undefined
      ? delete process.env['R2_ACCESS_KEY_ID']
      : (process.env['R2_ACCESS_KEY_ID'] = previousAccessKeyId);
    previousSecretAccessKey === undefined
      ? delete process.env['R2_SECRET_ACCESS_KEY']
      : (process.env['R2_SECRET_ACCESS_KEY'] = previousSecretAccessKey);
    previousDeploymentProfile === undefined
      ? delete process.env['NEXT_PUBLIC_LEARNINGBORED_DEPLOYMENT_PROFILE']
      : (process.env['NEXT_PUBLIC_LEARNINGBORED_DEPLOYMENT_PROFILE'] = previousDeploymentProfile);
    previousLearningBoredEnabled === undefined
      ? delete process.env['NEXT_PUBLIC_LEARNINGBORED_ENABLED']
      : (process.env['NEXT_PUBLIC_LEARNINGBORED_ENABLED'] = previousLearningBoredEnabled);
    vi.restoreAllMocks();
  });

  it('uses the exact lowercase EU jurisdiction origin in the private-beta profile', () => {
    process.env['NEXT_PUBLIC_LEARNINGBORED_DEPLOYMENT_PROFILE'] = 'private_beta';
    process.env['R2_ACCOUNT_ID'] = 'ABCDEF0123456789ABCDEF0123456789';

    const url = new URL(buildR2ObjectUrl('learningbored-reader-eu', 'owner/opaque-name'));

    expect(url.origin).toBe('https://abcdef0123456789abcdef0123456789.eu.r2.cloudflarestorage.com');
    expect(url.pathname).toBe('/learningbored-reader-eu/owner/opaque-name');
    expect(url.search).toBe('');
    expect(url.hash).toBe('');
  });

  it.each([
    '',
    'abcdef0123456789abcdef012345678',
    'abcdef0123456789abcdef01234567890',
    'gbcdef0123456789abcdef0123456789',
    'abcdef0123456789abcdef0123456789/escape',
    'abcdef0123456789abcdef0123456789.eu',
  ])('rejects a malformed private-beta R2 account id: %s', (accountId) => {
    process.env['NEXT_PUBLIC_LEARNINGBORED_DEPLOYMENT_PROFILE'] = 'private_beta';
    process.env['R2_ACCOUNT_ID'] = accountId;

    expect(() => buildR2ObjectUrl('learningbored-reader-eu', 'owner/opaque-name')).toThrow(
      'Invalid private Reader R2 account configuration.',
    );
  });

  it('preserves the inherited global R2 origin when the private-beta profile is inactive', () => {
    expect(new URL(buildR2ObjectUrl('reader-private', 'owner/file.epub')).origin).toBe(
      'https://fictional-account.r2.cloudflarestorage.com',
    );
  });

  it('percent-encodes every segment and round-trips the exact object key', () => {
    const key = 'owner/file ?#%\\ å.epub';
    const url = new URL(buildR2ObjectUrl('reader-private', key));
    const decodedSegments = url.pathname
      .split('/')
      .filter(Boolean)
      .map((segment) => decodeURIComponent(segment));

    expect(decodedSegments).toEqual(['reader-private', 'owner', 'file ?#%\\ å.epub']);
    expect(url.search).toBe('');
    expect(url.hash).toBe('');
  });

  it.each([
    ['../other/file.epub'],
    ['owner/../other.epub'],
    ['owner/./other.epub'],
    ['./file.epub'],
  ])('rejects raw dot segments before URL normalization: %s', (key) => {
    expect(() => buildR2ObjectUrl('reader-private', key)).toThrow('Invalid R2 object path.');
  });

  it('does not reinterpret encoded traversal or slash text', () => {
    const key = 'owner/%2e%2e%2fother%5cfile';
    const url = new URL(buildR2ObjectUrl('reader-private', key));
    const decodedKey = url.pathname
      .split('/')
      .filter(Boolean)
      .slice(1)
      .map((segment) => decodeURIComponent(segment))
      .join('/');
    expect(decodedKey).toBe(key);
  });

  it('cryptographically binds Content-Length into the actual aws4fetch upload URL', async () => {
    const signedUrl = new URL(
      await r2Storage.getUploadSignedUrl('reader-private', 'owner/opaque-name', 73, 1800),
    );
    expect(signedUrl.searchParams.get('X-Amz-SignedHeaders')?.split(';')).toContain(
      'content-length',
    );
  });

  it('passes Content-Length on the Request and enables all-header signing', async () => {
    let requestToSign: Request | undefined;
    let signingOptions: { aws?: { signQuery?: boolean; allHeaders?: boolean } } | undefined;
    const sign = vi.fn(
      async (
        request: Request,
        options: { aws?: { signQuery?: boolean; allHeaders?: boolean } },
      ) => {
        requestToSign = request;
        signingOptions = options;
        const signedUrl = new URL(request.url);
        signedUrl.searchParams.set('X-Amz-SignedHeaders', 'content-length;host');
        return new Request(signedUrl, request);
      },
    );
    vi.spyOn(r2Storage, 'getR2Client').mockReturnValue({ sign } as never);

    const signedUrl = new URL(
      await r2Storage.getUploadSignedUrl('reader-private', 'owner/opaque-name', 73, 1800),
    );

    expect(requestToSign?.headers.get('content-length')).toBe('73');
    expect(signingOptions?.aws).toEqual({ signQuery: true, allHeaders: true });
    expect(signedUrl.searchParams.get('X-Amz-SignedHeaders')).toContain('content-length');
  });
});
