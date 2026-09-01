import { AwsClient } from 'aws4fetch';
import { getLearningBoredPrivateBetaPolicy } from '@/integrations/learningbored/private-beta-policy';

const CLOUDFLARE_R2_ACCOUNT_ID = /^[0-9a-f]{32}$/iu;

function getR2Origin(): string {
  const accountId = process.env['R2_ACCOUNT_ID'];
  if (getLearningBoredPrivateBetaPolicy().active) {
    if (!accountId || !CLOUDFLARE_R2_ACCOUNT_ID.test(accountId)) {
      throw new Error('Invalid private Reader R2 account configuration.');
    }
    return `https://${accountId.toLowerCase()}.eu.r2.cloudflarestorage.com`;
  }

  if (!accountId) {
    throw new Error('Invalid R2 object path.');
  }
  return `https://${accountId}.r2.cloudflarestorage.com`;
}

export const buildR2ObjectUrl = (bucketName: string, fileKey: string) => {
  const objectSegments = fileKey.split('/');
  const segments = [bucketName, ...objectSegments];
  if (
    segments.some(
      (segment) =>
        segment.length === 0 ||
        segment === '.' ||
        segment === '..' ||
        /[\u0000-\u001f\u007f]/u.test(segment),
    )
  ) {
    throw new Error('Invalid R2 object path.');
  }

  const encodedPath = segments.map((segment) => encodeURIComponent(segment)).join('/');
  const objectUrl = new URL(`${getR2Origin()}/${encodedPath}`);
  let decodedSegments: string[];
  try {
    decodedSegments = objectUrl.pathname
      .split('/')
      .filter(Boolean)
      .map((segment) => decodeURIComponent(segment));
  } catch {
    throw new Error('Invalid R2 object path.');
  }
  if (
    decodedSegments.length !== segments.length ||
    !segments.every((segment, index) => segment === decodedSegments[index])
  ) {
    throw new Error('Invalid R2 object path.');
  }

  return objectUrl.toString();
};

export const r2Storage = {
  getR2Client: () => {
    return new AwsClient({
      service: 's3',
      region: process.env['R2_REGION'] || 'auto',
      accessKeyId: process.env['R2_ACCESS_KEY_ID']!,
      secretAccessKey: process.env['R2_SECRET_ACCESS_KEY']!,
    });
  },

  getR2Url: () => {
    return getR2Origin();
  },

  getDownloadSignedUrl: async (bucketName: string, fileKey: string, expiresIn: number) => {
    const objectUrl = new URL(buildR2ObjectUrl(bucketName, fileKey));
    objectUrl.searchParams.set('X-Amz-Expires', expiresIn.toString());
    return (
      await r2Storage.getR2Client().sign(new Request(objectUrl), {
        aws: { signQuery: true },
      })
    ).url.toString();
  },

  getUploadSignedUrl: async (
    bucketName: string,
    fileKey: string,
    contentLength: number,
    expiresIn: number,
  ) => {
    const objectUrl = new URL(buildR2ObjectUrl(bucketName, fileKey));
    objectUrl.searchParams.set('X-Amz-Expires', expiresIn.toString());
    return (
      await r2Storage.getR2Client().sign(
        new Request(objectUrl, {
          method: 'PUT',
          headers: {
            'Content-Length': contentLength.toString(),
          },
        }),
        {
          // aws4fetch excludes content-length by default. allHeaders binds the quota-authorized byte
          // count into the SigV4 canonical request and preserves it on the signed Request.
          aws: { signQuery: true, allHeaders: true },
        },
      )
    ).url.toString();
  },

  deleteObject: async (bucketName: string, fileKey: string) => {
    return await r2Storage.getR2Client().fetch(buildR2ObjectUrl(bucketName, fileKey), {
      method: 'DELETE',
    });
  },
};
