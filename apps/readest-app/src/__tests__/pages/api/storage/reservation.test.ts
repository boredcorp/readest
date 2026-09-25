import type { NextApiRequest, NextApiResponse } from 'next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  plan: vi.fn(),
  rpc: vi.fn(),
  sign: vi.fn(),
}));
vi.mock('@/utils/access', () => ({
  validateUserAndToken: mocks.auth,
  getStoragePlanData: mocks.plan,
  STORAGE_QUOTA_GRACE_BYTES: 10 * 1024 * 1024,
}));
vi.mock('@/utils/supabase', () => ({ createSupabaseAdminClient: () => ({ rpc: mocks.rpc }) }));
vi.mock('@/utils/object', () => ({
  getUploadSignedUrl: mocks.sign,
  getDownloadSignedUrl: vi.fn(),
}));
vi.mock('@/utils/cors', () => ({ corsAllMethods: vi.fn(), runMiddleware: vi.fn() }));

import handler from '@/pages/api/storage/upload';
import { getStorageReservationQuota } from '@/utils/storageQuota';

const owner = '11111111-1111-4111-8111-111111111111';
const hash = 'a'.repeat(32);
const name = `Readest/Books/${hash}/Book & Snow.epub`;
const key = `${owner}/${name}`;
const gib = 1024 ** 3;
const body = () => ({ fileName: name, fileSize: 42, bookHash: hash, temp: false });
async function request(payload: unknown = body()) {
  const response = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
  await handler(
    {
      method: 'POST',
      headers: { authorization: 'Bearer fixture' },
      body: payload,
    } as NextApiRequest,
    response as unknown as NextApiResponse,
  );
  return response;
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_STORAGE_FIXED_QUOTA', String(gib));
  mocks.auth.mockResolvedValue({ user: { id: owner }, token: 'verified-fixture' });
  mocks.plan.mockReturnValue({ usage: 999999, quota: 100 * gib, plan: 'pro' });
  mocks.rpc.mockResolvedValue({
    data: [{ id: owner, file_key: key, file_size: 42, usage: 42, quota: gib }],
    error: null,
  });
  mocks.sign.mockResolvedValue('https://fixture.invalid/put');
});
afterEach(() => vi.unstubAllEnvs());

describe('ordinary storage reservations', () => {
  it('uses the verified owner, exact fixed beta cap and authoritative reservation usage', async () => {
    const result = await request({ ...body(), userId: 'other-owner', quota: 999999999999 });
    expect(mocks.rpc).toHaveBeenCalledWith('reserve_readest_file', {
      p_user_id: owner,
      p_file_key: key,
      p_book_hash: hash,
      p_file_size: 42,
      p_quota_bytes: gib,
    });
    expect(mocks.sign).toHaveBeenCalledWith(key, 42, 1800);
    expect(result.status).toHaveBeenCalledWith(200);
    expect(result.json).toHaveBeenCalledWith({
      uploadUrl: 'https://fixture.invalid/put',
      fileKey: key,
      usage: 42,
      quota: gib,
    });
  });
  it.each([0, -1, 1.5, '42', Number.MAX_SAFE_INTEGER + 1, null])(
    'rejects invalid size %s before reserving',
    async (fileSize) => {
      const result = await request({ ...body(), fileSize });
      expect(result.status).toHaveBeenCalledWith(400);
      expect(mocks.rpc).not.toHaveBeenCalled();
      expect(mocks.sign).not.toHaveBeenCalled();
    },
  );
  it.each([
    '../escape',
    '/absolute',
    'Readest//Books/a',
    'Readest/./file',
    'bad\\file',
    'bad\u0000file',
  ])('rejects invalid key %s', async (fileName) => {
    const result = await request({ ...body(), fileName });
    expect(result.status).toHaveBeenCalledWith(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each(['wrong', '', null, undefined, 'a'.repeat(33)])(
    'requires a canonical book hash %s',
    async (bookHash) => {
      const result = await request({ ...body(), bookHash });
      expect(result.status).toHaveBeenCalledWith(400);
      expect(mocks.rpc).not.toHaveBeenCalled();
    },
  );
  it.each([
    ['P0001', 403],
    ['23505', 409],
    ['22023', 400],
    ['XX000', 500],
  ])('maps reservation error %s safely', async (code, status) => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code, message: 'private database details' },
    });
    const result = await request();
    expect(result.status).toHaveBeenCalledWith(status);
    expect(JSON.stringify(result.json.mock.calls)).not.toContain('private database');
    expect(mocks.sign).not.toHaveBeenCalled();
  });
  it('rejects a reservation response for a different key or size before signing', async () => {
    mocks.rpc.mockResolvedValue({
      data: [{ id: owner, file_key: `${owner}/wrong`, file_size: 43, usage: 43, quota: gib }],
      error: null,
    });
    expect((await request()).status).toHaveBeenCalledWith(500);
    expect(mocks.sign).not.toHaveBeenCalled();
  });
  it('retries an existing reservation without token usage or a second table insert', async () => {
    mocks.plan.mockReturnValue({ usage: gib, quota: gib, plan: 'free' });
    await request();
    await request();
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(mocks.sign).toHaveBeenNthCalledWith(2, key, 42, 1800);
  });
  it('keeps the reservation when signing fails, because issued PUT completion may be unknown', async () => {
    mocks.sign.mockRejectedValue(new Error('signer private details'));
    const result = await request();
    expect(result.status).toHaveBeenCalledWith(500);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result.json.mock.calls)).not.toContain('private details');
  });
});

describe('server-trusted quota selection', () => {
  it('keeps beta exactly one GiB even with purchased claims and the legacy grace', () => {
    expect(getStorageReservationQuota('verified-fixture')).toEqual({
      quota: gib,
      reservationLimit: gib,
    });
  });
  it('preserves upstream paid/purchased plan quota and existing grace without a fixed cap', () => {
    vi.stubEnv('NEXT_PUBLIC_STORAGE_FIXED_QUOTA', '0');
    expect(getStorageReservationQuota('verified-fixture')).toEqual({
      quota: 100 * gib,
      reservationLimit: 100 * gib + 10 * 1024 * 1024,
    });
  });
  it.each(['-1', '1.5', '1073741824junk', '9007199254740992'])(
    'rejects invalid configured quota %s',
    (fixed) => {
      vi.stubEnv('NEXT_PUBLIC_STORAGE_FIXED_QUOTA', fixed);
      expect(() => getStorageReservationQuota('verified-fixture')).toThrow();
    },
  );
});
