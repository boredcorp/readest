import { AwsClient } from 'aws4fetch';
import { isValidStorageFileKey } from './storageDeletion';

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
    const R2_ACCOUNT_ID = process.env['R2_ACCOUNT_ID']!;
    return `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  },

  getDownloadSignedUrl: async (bucketName: string, fileKey: string, expiresIn: number) => {
    return (
      await r2Storage
        .getR2Client()
        .sign(
          new Request(
            `${r2Storage.getR2Url()}/${bucketName}/${fileKey}?X-Amz-Expires=${expiresIn}`,
          ),
          {
            aws: { signQuery: true },
          },
        )
    ).url.toString();
  },

  getUploadSignedUrl: async (
    bucketName: string,
    fileKey: string,
    contentLength: number,
    expiresIn: number,
  ) => {
    return (
      await r2Storage.getR2Client().sign(
        new Request(
          `${r2Storage.getR2Url()}/${bucketName}/${fileKey}?X-Amz-Expires=${expiresIn}&X-Amz-SignedHeaders=content-length`,
          {
            method: 'PUT',
            headers: {
              'Content-Length': contentLength.toString(),
            },
          },
        ),
        {
          aws: { signQuery: true },
        },
      )
    ).url.toString();
  },

  deleteObject: async (bucketName: string, fileKey: string) => {
    if (!isValidStorageFileKey(fileKey)) throw new Error('Invalid object key');
    const encodedKey = fileKey.split('/').map(encodeURIComponent).join('/');
    let response: Response;
    try {
      response = await r2Storage
        .getR2Client()
        .fetch(`${r2Storage.getR2Url()}/${encodeURIComponent(bucketName)}/${encodedKey}`, {
          method: 'DELETE',
        });
    } catch {
      throw new Error('Object deletion request failed');
    }
    if (!response.ok) {
      throw new Error(`Object deletion failed (HTTP ${response.status})`);
    }
    return response;
  },
};
