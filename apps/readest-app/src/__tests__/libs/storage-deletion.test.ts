import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ fetchWithAuth: vi.fn(), getUserID: vi.fn() }));
vi.mock('@/utils/fetch', () => ({ fetchWithAuth: mocks.fetchWithAuth }));
vi.mock('@/utils/access', () => ({ getUserID: mocks.getUserID }));
vi.mock('@/services/environment', () => ({
  getAPIBaseUrl: () => 'https://reader.example/api',
  isWebAppPlatform: () => true,
}));
vi.mock('@/utils/transfer', () => ({
  tauriUpload: vi.fn(),
  tauriDownload: vi.fn(),
  webUpload: vi.fn(),
  webDownload: vi.fn(),
}));

import { deleteFile, purgeFiles } from '@/libs/storage';

describe('storage deletion client', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getUserID.mockResolvedValue('owner');
  });

  it('waits for the authenticated deletion request', async () => {
    const request = Promise.withResolvers<Response>();
    mocks.fetchWithAuth.mockReturnValue(request.promise);
    let complete = false;
    const deletion = deleteFile('Readest/Books/book.epub').then(() => {
      complete = true;
    });
    await vi.waitFor(() => expect(mocks.fetchWithAuth).toHaveBeenCalled());
    expect(complete).toBe(false);
    request.resolve(new Response(null, { status: 204 }));
    await deletion;
    expect(complete).toBe(true);
  });

  it('propagates an authenticated deletion failure', async () => {
    mocks.fetchWithAuth.mockRejectedValue(new Error('Request failed'));
    await expect(deleteFile('Readest/Books/book.epub')).rejects.toThrow('File deletion failed');
  });

  it.each([200, 207])('rejects partial results even when HTTP %s is successful', async (status) => {
    mocks.fetchWithAuth.mockResolvedValue(
      Response.json(
        {
          success: ['owner/book.epub'],
          failed: [{ fileKey: 'owner/cover.png', error: 'Object deletion failed' }],
          deletedCount: 1,
          failedCount: 1,
        },
        { status },
      ),
    );
    await expect(purgeFiles(['owner/book.epub', 'owner/cover.png'], true)).rejects.toThrow(
      'Purge files failed',
    );
  });

  it('returns the confirmed complete result', async () => {
    const result = { success: ['owner/book.epub'], failed: [], deletedCount: 1, failedCount: 0 };
    mocks.fetchWithAuth.mockResolvedValue(Response.json(result));
    await expect(purgeFiles(['book.epub'])).resolves.toEqual(result);
    expect(JSON.parse(mocks.fetchWithAuth.mock.calls[0]![1].body)).toEqual({
      fileKeys: ['owner/book.epub'],
    });
  });

  it('does not accept an incomplete success list as a complete purge', async () => {
    mocks.fetchWithAuth.mockResolvedValue(
      Response.json({ success: [], failed: [], deletedCount: 0, failedCount: 0 }),
    );
    await expect(purgeFiles(['owner/book.epub'], true)).rejects.toThrow('Purge files failed');
  });
});
