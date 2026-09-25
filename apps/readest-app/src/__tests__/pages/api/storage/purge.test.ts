import type { NextApiRequest, NextApiResponse } from 'next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  validateUserAndToken: vi.fn(),
  deleteObject: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  query: vi.fn(),
  queryEq: vi.fn(),
  deleteRecord: vi.fn(),
}));

vi.mock('@/utils/access', () => ({ validateUserAndToken: mocks.validateUserAndToken }));
vi.mock('@/utils/cors', () => ({
  corsAllMethods: () => undefined,
  runMiddleware: async () => undefined,
}));
vi.mock('@/utils/object', () => ({ deleteObject: mocks.deleteObject }));
vi.mock('@/utils/supabase', () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}));

import handler from '@/pages/api/storage/purge';

const owner = 'f838fd73-378e-4ea0-bfd8-458433362851';
const bookKey = `${owner}/Readest/Books/book-hash/book-hash.epub`;
const coverKey = `${owner}/Readest/Books/book-hash/cover.png`;
const records = [
  { id: 'book-row', user_id: owner, file_key: bookKey },
  { id: 'cover-row', user_id: owner, file_key: coverKey },
];

function responseRecorder() {
  let statusCode: number | undefined;
  let payload: unknown;
  const response = {
    status(code: number) {
      statusCode = code;
      return response;
    },
    json(body: unknown) {
      payload = body;
      return response;
    },
  } as unknown as NextApiResponse;
  return {
    response,
    get payload() {
      return payload;
    },
    get statusCode() {
      return statusCode;
    },
  };
}

function request(fileKeys = [bookKey, coverKey]): NextApiRequest {
  return {
    method: 'DELETE',
    headers: { authorization: 'Bearer verified-token' },
    body: { fileKeys },
  } as unknown as NextApiRequest;
}

describe('Reader bulk object deletion', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.validateUserAndToken.mockResolvedValue({
      user: { id: owner },
      token: 'verified-token',
    });
    mocks.query.mockResolvedValue({ data: records, error: null });
    mocks.deleteObject.mockResolvedValue(undefined);
    mocks.deleteRecord.mockResolvedValue({ error: null });
    const query = { eq: mocks.queryEq, in: vi.fn(), is: mocks.query };
    mocks.queryEq.mockReturnValue(query);
    query.in.mockReturnValue(query);
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => query),
        delete: vi.fn(() => ({ eq: mocks.deleteRecord })),
      })),
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it('reports only successful objects and retains the rejected object row', async () => {
    mocks.deleteObject.mockImplementation(async (fileKey: string) => {
      if (fileKey === coverKey) throw new Error('provider private-signature-and-body');
    });
    const recorder = responseRecorder();
    await handler(request(), recorder.response);
    expect(mocks.queryEq).toHaveBeenCalledWith('user_id', owner);
    expect(recorder.statusCode).toBe(207);
    expect(recorder.payload).toEqual({
      success: [bookKey],
      failed: [{ fileKey: coverKey, error: expect.any(String) }],
      deletedCount: 1,
      failedCount: 1,
    });
    expect(mocks.deleteRecord).toHaveBeenCalledTimes(1);
    expect(mocks.deleteRecord).toHaveBeenCalledWith('id', 'book-row');
    expect(JSON.stringify(recorder.payload)).not.toContain('private-signature-and-body');
  });

  it('can retry the original list after one object and row were already removed', async () => {
    mocks.query.mockResolvedValueOnce({ data: records, error: null });
    mocks.query.mockResolvedValueOnce({ data: [records[1]], error: null });
    let coverAttempts = 0;
    mocks.deleteObject.mockImplementation(async (fileKey: string) => {
      if (fileKey === coverKey && coverAttempts++ === 0) throw new Error('temporary failure');
    });
    const first = responseRecorder();
    await handler(request(), first.response);
    expect(first.statusCode).toBe(207);
    const second = responseRecorder();
    await handler(request(), second.response);
    expect(second.statusCode).toBe(200);
    expect(second.payload).toEqual({
      success: [bookKey, coverKey],
      failed: [],
      deletedCount: 2,
      failedCount: 0,
    });
    expect(mocks.deleteObject.mock.calls.filter(([key]) => key === bookKey)).toHaveLength(2);
    expect(mocks.deleteRecord.mock.calls.filter(([, id]) => id === 'book-row')).toHaveLength(1);
    expect(mocks.deleteRecord).toHaveBeenCalledWith('id', 'cover-row');
  });

  it('checks provider deletion for an entirely absent owner list', async () => {
    mocks.query.mockResolvedValue({ data: [], error: null });
    const recorder = responseRecorder();
    await handler(request(), recorder.response);
    expect(recorder.statusCode).toBe(200);
    expect(mocks.deleteObject).toHaveBeenCalledWith(bookKey);
    expect(mocks.deleteObject).toHaveBeenCalledWith(coverKey);
    expect(mocks.deleteRecord).not.toHaveBeenCalled();
    expect(recorder.payload).toEqual({
      success: [bookKey, coverKey],
      failed: [],
      deletedCount: 2,
      failedCount: 0,
    });
  });

  it('waits for every provider outcome before returning the batch result', async () => {
    let release = () => {};
    let entered = () => {};
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    mocks.deleteObject.mockImplementation((fileKey: string) => {
      if (fileKey !== coverKey) return Promise.resolve();
      entered();
      return new Promise<void>((resolve) => {
        release = resolve;
      });
    });
    const recorder = responseRecorder();
    const pending = handler(request(), recorder.response);
    await started;
    try {
      expect(recorder.statusCode).toBeUndefined();
      expect(mocks.deleteRecord).not.toHaveBeenCalledWith('id', 'cover-row');
    } finally {
      release();
    }
    await pending;
    expect(recorder.statusCode).toBe(200);
    expect(mocks.deleteRecord).toHaveBeenCalledWith('id', 'cover-row');
  });

  it('fails without provider access when the database query fails', async () => {
    mocks.query.mockResolvedValue({ data: null, error: { message: 'private database detail' } });
    const recorder = responseRecorder();
    await handler(request(), recorder.response);
    expect(recorder.statusCode).toBe(500);
    expect(mocks.deleteObject).not.toHaveBeenCalled();
    expect(mocks.deleteRecord).not.toHaveBeenCalled();
    expect(JSON.stringify(recorder.payload)).not.toContain('private database detail');
  });

  it('includes row-deletion failure in the per-key failure set without exposing database detail', async () => {
    mocks.deleteRecord.mockImplementation(async (_column: string, id: string) => ({
      error: id === 'cover-row' ? { message: 'private database detail' } : null,
    }));
    const recorder = responseRecorder();
    await handler(request(), recorder.response);
    expect(recorder.statusCode).toBe(207);
    expect(recorder.payload).toEqual({
      success: [bookKey],
      failed: [{ fileKey: coverKey, error: expect.any(String) }],
      deletedCount: 1,
      failedCount: 1,
    });
    expect(JSON.stringify(recorder.payload)).not.toContain('private database detail');
  });

  it('rejects a batch containing another namespace before deleting any owner object', async () => {
    const recorder = responseRecorder();
    await handler(request([bookKey, 'another-owner/Readest/Books/cover.png']), recorder.response);
    expect(recorder.statusCode).toBe(403);
    expect(mocks.deleteObject).not.toHaveBeenCalled();
    expect(mocks.deleteRecord).not.toHaveBeenCalled();
  });

  it.each([
    `${owner}/../another-owner/book.epub`,
    `${owner}/Readest//cover.png`,
    `${owner}/Readest\\Books\\cover.png`,
  ])('rejects unsafe key %s before any provider mutation', async (fileKey) => {
    const recorder = responseRecorder();
    await handler(request([bookKey, fileKey]), recorder.response);
    expect(recorder.statusCode).toBe(400);
    expect(mocks.deleteObject).not.toHaveBeenCalled();
    expect(mocks.deleteRecord).not.toHaveBeenCalled();
  });

  it('returns a failure for each object when all provider deletions reject', async () => {
    mocks.deleteObject.mockRejectedValue(new Error('provider private-signature-and-body'));
    const recorder = responseRecorder();
    await handler(request(), recorder.response);
    expect(recorder.statusCode).toBe(500);
    expect(recorder.payload).toEqual({
      success: [],
      failed: [
        { fileKey: bookKey, error: expect.any(String) },
        { fileKey: coverKey, error: expect.any(String) },
      ],
      deletedCount: 0,
      failedCount: 2,
    });
    expect(mocks.deleteRecord).not.toHaveBeenCalled();
    expect(JSON.stringify(recorder.payload)).not.toContain('private-signature-and-body');
  });

  it('rejects inconsistent foreign owner records defensively', async () => {
    mocks.query.mockResolvedValue({
      data: [{ id: 'foreign-row', user_id: 'another-owner', file_key: bookKey }],
      error: null,
    });
    const recorder = responseRecorder();
    await handler(request(), recorder.response);
    expect(recorder.statusCode).toBe(403);
    expect(mocks.deleteObject).not.toHaveBeenCalled();
    expect(mocks.deleteRecord).not.toHaveBeenCalled();
  });
});
