// @vitest-environment node

import { Readable } from 'node:stream';
import {
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { describe, expect, it } from 'vitest';

const bucket = 'learningbored-reader-eu';
const key = 'fixture-owner/fixture.pdf';
const uploadId = 'fixture+multipart_id=';
const etag = '"fixture-etag"';

function responseClient(root: string, receipt: string, query: Record<string, string>) {
  const openingTag = `<${root} xmlns="http://s3.amazonaws.com/doc/2006-03-01/">`;
  const response = `<Bucket>${bucket}</Bucket><Key>${key}</Key>${receipt}</${root}>`;

  return new S3Client({
    endpoint: 'https://fixture.invalid',
    region: 'auto',
    forcePathStyle: true,
    maxAttempts: 1,
    defaultsMode: 'standard',
    credentials: { accessKeyId: 'fixture', secretAccessKey: 'fixture' },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    requestHandler: {
      metadata: { handlerProtocol: 'http/1.1' },
      async handle(request: unknown) {
        expect(request).toMatchObject({ hostname: 'fixture.invalid', method: 'POST', query });
        return {
          response: {
            statusCode: 200,
            headers: { 'content-type': 'application/xml' },
            body: Readable.from([Buffer.from(openingTag), Buffer.from(response)], {
              objectMode: false,
            }),
          },
        };
      },
    },
  });
}

describe('Reader multipart S3 receipts', () => {
  it('decodes the upload ID from a successful Create response', async () => {
    const client = responseClient(
      'InitiateMultipartUploadResult',
      `<UploadId>${uploadId}</UploadId>`,
      { uploads: '' },
    );
    try {
      const result = await client.send(
        new CreateMultipartUploadCommand({
          Bucket: bucket,
          Key: key,
          ContentType: 'application/pdf',
        }),
      );
      expect(result.UploadId).toBe(uploadId);
    } finally {
      client.destroy();
    }
  });

  it('decodes the ETag from a successful Complete response', async () => {
    const client = responseClient(
      'CompleteMultipartUploadResult',
      '<ETag>&quot;fixture-etag&quot;</ETag>',
      { uploadId },
    );
    try {
      const result = await client.send(
        new CompleteMultipartUploadCommand({
          Bucket: bucket,
          Key: key,
          UploadId: uploadId,
          MultipartUpload: { Parts: [{ PartNumber: 1, ETag: etag }] },
        }),
      );
      expect(result.ETag).toBe(etag);
    } finally {
      client.destroy();
    }
  });
});
