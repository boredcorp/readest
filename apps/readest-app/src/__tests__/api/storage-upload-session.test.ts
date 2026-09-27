import { Readable } from 'node:stream';
import type { NextApiRequest, NextApiResponse } from 'next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  active: true,
  auth: vi.fn(),
  chunk: vi.fn(),
  status: vi.fn(),
  authorizeChunk: vi.fn(),
}));
vi.mock('@/utils/cors', () => ({ corsAllMethods: {}, runMiddleware: vi.fn() }));
vi.mock('@/utils/access', () => ({ validateUserAndToken: mocks.auth }));
vi.mock('@/integrations/learningbored/private-beta-policy', () => ({
  getLearningBoredPrivateBetaPolicy: () => ({ active: mocks.active }),
}));
vi.mock('@/integrations/learningbored/upload-session-server', () => ({
  createReaderUploadService: () => ({
    chunk: mocks.chunk,
    status: mocks.status,
    authorizeChunk: mocks.authorizeChunk,
  }),
  readerUploadResponse: (record: unknown) => record,
  ReaderUploadError: class ReaderUploadError extends Error {
    readonly status = 409;
  },
}));
import handler from '@/pages/api/storage/upload-session/[...path]';

const owner = '11111111-1111-4111-8111-111111111111';
const id = '22222222-2222-4222-8222-222222222222';
function request(bytes: Uint8Array, length = bytes.length, path = [id, 'chunks', '0']) {
  return Object.assign(Readable.from([bytes]), {
    method: 'PUT',
    query: { path },
    headers: {
      authorization: 'Bearer fictional',
      'content-length': String(length),
      'content-type': 'application/octet-stream',
    },
  }) as unknown as NextApiRequest;
}
function response() {
  const result: { status?: number; body?: unknown } = {};
  const res = {
    status: (status: number) => {
      result.status = status;
      return res;
    },
    json: (body: unknown) => {
      result.body = body;
      return res;
    },
  };
  return { res: res as unknown as NextApiResponse, result };
}

describe('private Reader authenticated chunk route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.active = true;
    mocks.auth.mockResolvedValue({ user: { id: owner }, token: 'fictional' });
    mocks.chunk.mockResolvedValue({ state: 'uploading' });
    mocks.authorizeChunk.mockResolvedValue(3);
  });
  it('binds bounded bytes to the authenticated subject and explicit part index', async () => {
    const { res, result } = response();
    await handler(request(new Uint8Array([1, 2, 3])), res);
    expect(result.status).toBe(200);
    expect(mocks.chunk).toHaveBeenCalledWith(owner, id, 0, Buffer.from([1, 2, 3]));
  });
  it.each([
    [4, 400],
    [2, 400],
    [8388609, 400],
  ])('rejects content length %s before provider dispatch', async (length, status) => {
    const { res, result } = response();
    await handler(request(new Uint8Array([1, 2, 3]), length), res);
    expect(result.status).toBe(status);
    expect(mocks.chunk).not.toHaveBeenCalled();
  });
  it('fails closed when authentication is fenced', async () => {
    mocks.auth.mockResolvedValue({ user: null, token: null });
    const { res, result } = response();
    await handler(request(new Uint8Array([1])), res);
    expect(result.status).toBe(403);
    expect(mocks.chunk).not.toHaveBeenCalled();
  });
  it('keeps the added route absent from upstream Reader', async () => {
    mocks.active = false;
    const { res, result } = response();
    await handler(request(new Uint8Array([1])), res);
    expect(result.status).toBe(404);
    expect(mocks.auth).not.toHaveBeenCalled();
  });
  it('does not read bytes when the session owner check fails', async () => {
    mocks.authorizeChunk.mockRejectedValue(new Error('not owned'));
    const req = request(new Uint8Array([1, 2, 3]));
    const read = vi.spyOn(req, Symbol.asyncIterator);
    const { res, result } = response();
    await handler(req, res);
    expect(result.status).toBe(409);
    expect(read).not.toHaveBeenCalled();
    expect(mocks.chunk).not.toHaveBeenCalled();
  });
  it('rejects excess streamed bytes despite an exact declared length', async () => {
    const { res, result } = response();
    await handler(request(new Uint8Array([1, 2, 3, 4]), 3), res);
    expect(result.status).toBe(413);
    expect(mocks.chunk).not.toHaveBeenCalled();
  });
  it('passes a full 8 MiB chunk with exact byte integrity', async () => {
    const bytes = new Uint8Array(8388608).fill(127);
    mocks.authorizeChunk.mockResolvedValue(bytes.length);
    const { res, result } = response();
    await handler(request(bytes), res);
    expect(result.status).toBe(200);
    expect((mocks.chunk.mock.calls[0]![3] as Buffer).equals(Buffer.from(bytes))).toBe(true);
  });
});
