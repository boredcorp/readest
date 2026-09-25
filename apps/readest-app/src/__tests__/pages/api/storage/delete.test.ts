import type { NextApiRequest, NextApiResponse } from 'next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  validateUserAndToken: vi.fn(),
  deleteObject: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  query: vi.fn(),
  deleteRecord: vi.fn(),
  queryEq: vi.fn(),
  maybeSingle: vi.fn(),
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

import handler from '@/pages/api/storage/delete';

const owner = 'f838fd73-378e-4ea0-bfd8-458433362851';
const bookKey = `${owner}/Readest/Books/book-hash/book-hash.epub`;
const coverKey = `${owner}/Readest/Books/book-hash/cover.png`;

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

function request(fileKey: string): NextApiRequest {
  return {
    method: 'DELETE',
    headers: { authorization: 'Bearer verified-token' },
    query: { fileKey },
  } as unknown as NextApiRequest;
}

describe('Reader object deletion', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.validateUserAndToken.mockResolvedValue({
      user: { id: owner },
      token: 'verified-token',
    });
    mocks.query.mockResolvedValue({ data: { id: 'book-row', user_id: owner }, error: null });
    mocks.deleteRecord.mockResolvedValue({ error: null });
    mocks.deleteObject.mockResolvedValue(undefined);
    const query = {
      eq: mocks.queryEq,
      limit: vi.fn(),
      single: mocks.query,
      maybeSingle: mocks.maybeSingle,
    };
    mocks.queryEq.mockReturnValue(query);
    query.limit.mockReturnValue(query);
    mocks.maybeSingle.mockImplementation(() => mocks.query());
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => query),
        delete: vi.fn(() => ({ eq: mocks.deleteRecord })),
      })),
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it('awaits the provider before removing the owner-scoped row and reporting success', async () => {
    let release = () => {};
    let entered = () => {};
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    mocks.deleteObject.mockImplementation(() => {
      entered();
      return new Promise<void>((resolve) => {
        release = resolve;
      });
    });
    const recorder = responseRecorder();
    const pending = handler(request(bookKey), recorder.response);
    await started;
    try {
      expect(mocks.deleteRecord).not.toHaveBeenCalled();
      expect(recorder.statusCode).toBeUndefined();
    } finally {
      release();
    }
    await pending;
    expect(mocks.queryEq).toHaveBeenCalledWith('user_id', owner);
    expect(mocks.queryEq).toHaveBeenCalledWith('file_key', bookKey);
    expect(mocks.deleteObject).toHaveBeenCalledWith(bookKey);
    expect(mocks.deleteRecord).toHaveBeenCalledWith('id', 'book-row');
    expect(recorder.statusCode).toBe(200);
  });

  it.each([bookKey, coverKey])(
    'repeats the owner-authorized DELETE when row %s is already absent',
    async (fileKey) => {
      mocks.query.mockResolvedValue({ data: null, error: null });
      const recorder = responseRecorder();
      await handler(request(fileKey), recorder.response);
      expect(mocks.maybeSingle).toHaveBeenCalled();
      expect(mocks.deleteObject).toHaveBeenCalledWith(fileKey);
      expect(mocks.deleteRecord).not.toHaveBeenCalled();
      expect(recorder.statusCode).toBe(200);
    },
  );

  it('does not treat a database query failure as an absent optional cover', async () => {
    mocks.query.mockResolvedValue({ data: null, error: { message: 'private database detail' } });
    const recorder = responseRecorder();
    await handler(request(coverKey), recorder.response);
    expect(recorder.statusCode).toBe(500);
    expect(mocks.deleteObject).not.toHaveBeenCalled();
    expect(mocks.deleteRecord).not.toHaveBeenCalled();
    expect(JSON.stringify(recorder.payload)).not.toContain('private database detail');
  });

  it('rejects another user namespace even when no row exists', async () => {
    mocks.query.mockResolvedValue({ data: null, error: null });
    const recorder = responseRecorder();
    await handler(request('another-owner/Readest/Books/book/cover.png'), recorder.response);
    expect(recorder.statusCode).toBe(403);
    expect(mocks.deleteObject).not.toHaveBeenCalled();
    expect(mocks.deleteRecord).not.toHaveBeenCalled();
  });

  it.each([
    `${owner}/../another-owner/book.epub`,
    `${owner}/./book.epub`,
    `${owner}/Readest//cover.png`,
    `${owner}/Readest\\Books\\cover.png`,
    `${owner}/Readest/Books/cover\u0000.png`,
  ])('rejects unsafe object key %s before provider access', async (fileKey) => {
    const recorder = responseRecorder();
    await handler(request(fileKey), recorder.response);
    expect(recorder.statusCode).toBe(400);
    expect(mocks.deleteObject).not.toHaveBeenCalled();
    expect(mocks.deleteRecord).not.toHaveBeenCalled();
  });

  it('keeps the row and returns a sanitized failure when object deletion rejects', async () => {
    mocks.deleteObject.mockRejectedValue(new Error('provider private-signature-and-body'));
    const recorder = responseRecorder();
    await handler(request(bookKey), recorder.response);
    expect(recorder.statusCode).toBe(500);
    expect(mocks.deleteRecord).not.toHaveBeenCalled();
    expect(JSON.stringify(recorder.payload)).not.toContain('private-signature-and-body');
  });

  it('does not claim absent-row success if provider deletion fails', async () => {
    mocks.query.mockResolvedValue({ data: null, error: null });
    mocks.deleteObject.mockRejectedValue(new Error('provider unavailable'));
    const recorder = responseRecorder();
    await handler(request(coverKey), recorder.response);
    expect(recorder.statusCode).toBe(500);
    expect(mocks.deleteObject).toHaveBeenCalledWith(coverKey);
    expect(mocks.deleteRecord).not.toHaveBeenCalled();
  });

  it('fails if the provider succeeds but row removal fails', async () => {
    mocks.deleteRecord.mockResolvedValue({ error: { message: 'private database detail' } });
    const recorder = responseRecorder();
    await handler(request(bookKey), recorder.response);
    expect(mocks.deleteObject).toHaveBeenCalledWith(bookKey);
    expect(recorder.statusCode).toBe(500);
    expect(JSON.stringify(recorder.payload)).not.toContain('private database detail');
  });

  it('rejects an inconsistent foreign owner record defensively', async () => {
    mocks.query.mockResolvedValue({
      data: { id: 'foreign-row', user_id: 'another-owner' },
      error: null,
    });
    const recorder = responseRecorder();
    await handler(request(bookKey), recorder.response);
    expect(recorder.statusCode).toBe(403);
    expect(mocks.deleteObject).not.toHaveBeenCalled();
    expect(mocks.deleteRecord).not.toHaveBeenCalled();
  });
});
