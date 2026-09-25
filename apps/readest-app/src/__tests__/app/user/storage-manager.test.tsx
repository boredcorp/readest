import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Book } from '@/types/book';
import type { FileRecord } from '@/libs/storage';
import { webcrypto } from 'node:crypto';
import { publishCloudSession, captureCloudLease } from '@/services/cloudOwnerSession';

const mocks = vi.hoisted(() => ({
  listFiles: vi.fn(),
  getStorageStats: vi.fn(),
  purgeFiles: vi.fn(),
  fetchWithAuth: vi.fn(),
  saveLibraryBooks: vi.fn(),
  loadLibraryBooks: vi.fn(),
  getCloudBookState: vi.fn(),
  deleteOrdinaryCloudBook: vi.fn(),
  setLibrary: vi.fn(),
  dispatch: vi.fn(),
  library: [] as Book[],
  translate: (key: string) => key,
}));

vi.mock('@/libs/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/libs/storage')>();
  return {
    ...actual,
    listFiles: mocks.listFiles,
    getStorageStats: mocks.getStorageStats,
    purgeFiles: (...args: Parameters<typeof actual.purgeFiles>) => {
      mocks.purgeFiles(...args);
      return actual.purgeFiles(...args);
    },
  };
});
vi.mock('@/services/environment', () => ({
  getAPIBaseUrl: () => '/api',
  isWebAppPlatform: () => true,
}));
vi.mock('@/utils/access', () => ({ getUserID: async () => 'owner' }));
vi.mock('@/utils/fetch', () => ({ fetchWithAuth: mocks.fetchWithAuth }));
vi.mock('@/utils/transfer', () => ({
  tauriUpload: vi.fn(),
  tauriDownload: vi.fn(),
  webUpload: vi.fn(),
  webDownload: vi.fn(),
}));
vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({
    appService: {
      saveLibraryBooks: mocks.saveLibraryBooks,
      loadLibraryBooks: mocks.loadLibraryBooks,
    },
  }),
}));
vi.mock('@/services/ordinaryCloudLibrary', () => ({
  getCloudBookState: mocks.getCloudBookState,
  deleteOrdinaryCloudBook: mocks.deleteOrdinaryCloudBook,
}));
vi.mock('@/store/themeStore', () => ({ useThemeStore: () => ({ safeAreaInsets: {} }) }));
vi.mock('@/store/libraryStore', () => ({
  useLibraryStore: {
    getState: () => ({ library: mocks.library, setLibrary: mocks.setLibrary }),
  },
}));
vi.mock('@/hooks/useLibrary', () => ({ useLibrary: () => ({ libraryLoaded: true }) }));
vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => mocks.translate }));
vi.mock('@/hooks/useKeyDownActions', () => ({ useKeyDownActions: () => ({ current: null }) }));
vi.mock('@/utils/event', () => ({ eventDispatcher: { dispatch: mocks.dispatch } }));
vi.mock('@/components/Spinner', () => ({ default: () => null }));
vi.mock('@/services/constants', () => ({ CLOUD_BOOKS_SUBDIR: 'Readest/Books' }));
vi.mock('@/utils/book', () => ({
  getRemoteBookFilename: (book: Book) => `${book.hash}/${book.hash}.epub`,
}));

import StorageManager from '@/app/user/components/StorageManager';

const bookKey = 'owner/Readest/Books/book-hash/book-hash.epub';
const coverKey = 'owner/Readest/Books/book-hash/cover.png';
const fileRecord = (fileKey: string): FileRecord => ({
  file_key: fileKey,
  file_size: 1_024,
  book_hash: fileKey.split('/')[3] ?? null,
  created_at: '2026-09-25T08:00:00.000Z',
  updated_at: null,
});
const createBook = (hash: string): Book => ({
  hash,
  format: 'EPUB',
  title: 'A Fictional Book',
  author: 'Fictional Author',
  createdAt: 100,
  updatedAt: 200,
  uploadedAt: 300,
});

function showFiles(fileKeys: string[]) {
  mocks.listFiles.mockResolvedValue({
    files: fileKeys.map(fileRecord),
    total: fileKeys.length,
    page: 1,
    pageSize: 20,
    totalPages: 1,
  });
}

async function confirmDeleteFile(filename: string, expand = false, confirm = true) {
  render(<StorageManager />);
  if (expand) fireEvent.click(await screen.findByRole('button', { name: '+' }));
  const labels = await screen.findAllByText(filename);
  const row = labels.at(-1)?.closest('tr');
  if (!row) throw new Error('Expected file row');
  const checkbox = within(row).getByRole('checkbox') as HTMLInputElement;
  await waitFor(() => expect(checkbox.disabled).toBe(false));
  fireEvent.click(checkbox);
  fireEvent.click(screen.getByRole('button', { name: 'Delete Selected' }));
  if (confirm) fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }));
}

describe('StorageManager deletion metadata', () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    vi.stubGlobal('crypto', webcrypto);
    publishCloudSession(null);
    publishCloudSession({ subject: 'owner', token: 'synthetic-owner-token' });
    const lease = await captureCloudLease();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.library = [createBook('book-hash'), createBook('unselected-book')];
    mocks.library = mocks.library.map((book) => ({
      ...book,
      libraryOrigin: { kind: 'cloud', ownerKey: lease.ownerKey, epoch: lease.epoch },
    }));
    mocks.setLibrary.mockImplementation((books: Book[]) => {
      mocks.library = books;
    });
    mocks.saveLibraryBooks.mockResolvedValue(undefined);
    mocks.loadLibraryBooks.mockImplementation(async () => mocks.library);
    mocks.getCloudBookState.mockResolvedValue(null);
    mocks.deleteOrdinaryCloudBook.mockResolvedValue(undefined);
    mocks.getStorageStats.mockResolvedValue({
      totalFiles: 2,
      totalSize: 2_048,
      quota: 100_000,
      usagePercentage: 2,
    });
    mocks.fetchWithAuth.mockImplementation(async (_url: string, options: RequestInit) => {
      const { fileKeys } = JSON.parse(options.body as string) as { fileKeys: string[] };
      return new Response(
        JSON.stringify({
          success: fileKeys,
          failed: [],
          deletedCount: fileKeys.length,
          failedCount: 0,
        }),
        { status: 200 },
      );
    });
  });

  afterEach(() => {
    cleanup();
    publishCloudSession(null);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('retains the cloud book flag when a cover is the only file visible on the page', async () => {
    showFiles([coverKey]);
    await confirmDeleteFile('cover.png');
    await waitFor(() => expect(mocks.dispatch).toHaveBeenCalled());
    expect(mocks.purgeFiles).toHaveBeenCalledWith(
      [coverKey],
      true,
      expect.objectContaining({ subject: 'owner' }),
    );
    expect(mocks.library[0]?.uploadedAt).toBe(300);
    expect(mocks.library[0]?.updatedAt).toBe(200);
  });

  it('confirms complete owned cloud deletion instead of raw book purge, preserving a local copy', async () => {
    const hash = '1'.repeat(32);
    const local = {
      ...createBook(hash),
      libraryOrigin: { kind: 'local' as const },
      uploadedAt: null,
    };
    mocks.library = [local];
    mocks.getCloudBookState.mockResolvedValue({
      book: createBook(hash),
      state: 'ready',
      revision: 1,
    });
    showFiles([
      `owner/Readest/Books/${hash}/${hash}.epub`,
      `owner/Readest/Books/${hash}/cover.png`,
    ]);
    await confirmDeleteFile(`${hash}.epub`, false, false);
    expect(
      await screen.findByText(
        'Delete the selected cloud books, including their covers, cloud library entries and downloaded cloud copies, plus any other selected files? Separate device-local copies remain.',
      ),
    ).toBeTruthy();
    expect(mocks.deleteOrdinaryCloudBook).not.toHaveBeenCalled();
    expect(mocks.purgeFiles).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(mocks.loadLibraryBooks).toHaveBeenCalled());
    expect(mocks.deleteOrdinaryCloudBook).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ hash, libraryOrigin: expect.objectContaining({ kind: 'cloud' }) }),
    );
    expect(mocks.purgeFiles).not.toHaveBeenCalled();
    expect(mocks.saveLibraryBooks).not.toHaveBeenCalled();
    expect(mocks.library).toEqual([local]);
  });

  it('fails closed with guidance when an eligible book file cannot bind to this owner sidecar', async () => {
    const hash = '1'.repeat(32);
    showFiles([`owner/Readest/Books/${hash}/${hash}.epub`]);
    await confirmDeleteFile(`${hash}.epub`, false, false);
    await waitFor(() =>
      expect(mocks.dispatch).toHaveBeenCalledWith('toast', {
        type: 'info',
        message:
          'Refresh the cloud library, then delete this book from its book details. No files were deleted.',
      }),
    );
    expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull();
    expect(mocks.deleteOrdinaryCloudBook).not.toHaveBeenCalled();
    expect(mocks.purgeFiles).not.toHaveBeenCalled();
  });

  it('keeps a failed cloud deletion retry visible without falling through to raw purge', async () => {
    const hash = '1'.repeat(32);
    showFiles([`owner/Readest/Books/${hash}/${hash}.epub`]);
    mocks.getCloudBookState.mockResolvedValue({
      book: createBook(hash),
      state: 'ready',
      revision: 1,
    });
    mocks.deleteOrdinaryCloudBook.mockRejectedValue(new Error('Interrupted'));
    await confirmDeleteFile(`${hash}.epub`);
    await waitFor(() =>
      expect(mocks.dispatch).toHaveBeenCalledWith('toast', {
        type: 'info',
        message: 'Failed to delete files',
      }),
    );
    expect(mocks.loadLibraryBooks).toHaveBeenCalled();
    expect(mocks.purgeFiles).not.toHaveBeenCalled();
    expect(mocks.saveLibraryBooks).not.toHaveBeenCalled();
  });

  it('retains the cloud book flag when only its expanded cover row is selected', async () => {
    showFiles([bookKey, coverKey]);
    await confirmDeleteFile('cover.png', true);
    await waitFor(() => expect(mocks.dispatch).toHaveBeenCalled());
    expect(mocks.purgeFiles).toHaveBeenCalledWith(
      [coverKey],
      true,
      expect.objectContaining({ subject: 'owner' }),
    );
    expect(mocks.library[0]?.uploadedAt).toBe(300);
    expect(mocks.library[0]?.updatedAt).toBe(200);
  });

  it('clears only the selected book flag after its actual object deletion succeeds', async () => {
    showFiles([bookKey, coverKey]);
    await confirmDeleteFile('book-hash.epub', true);
    await waitFor(() => expect(mocks.saveLibraryBooks).toHaveBeenCalled());
    expect(mocks.purgeFiles).toHaveBeenCalledWith(
      [bookKey],
      true,
      expect.objectContaining({ subject: 'owner' }),
    );
    expect(mocks.library[0]?.uploadedAt).toBeNull();
    expect(mocks.library[0]?.updatedAt).toBeGreaterThan(200);
    expect(mocks.library[1]?.uploadedAt).toBe(300);
    expect(mocks.library[1]?.updatedAt).toBe(200);
  });

  it('retains cloud flags when the provider request rejects', async () => {
    showFiles([bookKey, coverKey]);
    mocks.fetchWithAuth.mockRejectedValue(new Error('Provider deletion failed'));
    await confirmDeleteFile('book-hash.epub', true);
    await waitFor(() =>
      expect(mocks.dispatch).toHaveBeenCalledWith('toast', {
        type: 'info',
        message: 'Failed to delete files',
      }),
    );
    expect(mocks.library[0]?.uploadedAt).toBe(300);
    expect(mocks.library[0]?.updatedAt).toBe(200);
    expect(mocks.saveLibraryBooks).not.toHaveBeenCalled();
  });

  it('retains cloud flags when the real deletion client receives a partial HTTP 207 result', async () => {
    showFiles([bookKey, coverKey]);
    mocks.fetchWithAuth.mockResolvedValue(
      new Response(
        JSON.stringify({
          success: [bookKey],
          failed: [{ fileKey: coverKey, error: 'Could not delete file from storage' }],
          deletedCount: 1,
          failedCount: 1,
        }),
        { status: 207 },
      ),
    );
    await confirmDeleteFile('book-hash.epub');
    await waitFor(() =>
      expect(mocks.dispatch).toHaveBeenCalledWith('toast', {
        type: 'info',
        message: 'Failed to delete files',
      }),
    );
    expect(mocks.purgeFiles).toHaveBeenCalledWith(
      [bookKey, coverKey],
      true,
      expect.objectContaining({ subject: 'owner' }),
    );
    expect(mocks.fetchWithAuth).toHaveBeenCalledWith(
      '/api/storage/purge',
      expect.objectContaining({
        method: 'DELETE',
        body: JSON.stringify({ fileKeys: [bookKey, coverKey] }),
      }),
      expect.objectContaining({ subject: 'owner' }),
    );
    expect(mocks.library[0]?.uploadedAt).toBe(300);
    expect(mocks.library[0]?.updatedAt).toBe(200);
    expect(mocks.saveLibraryBooks).not.toHaveBeenCalled();
  });

  it('does not alter a device-local same-hash copy after removing account storage', async () => {
    mocks.library = [createBook('book-hash')];
    showFiles([bookKey]);
    await confirmDeleteFile('book-hash.epub');
    await waitFor(() => expect(mocks.dispatch).toHaveBeenCalled());
    expect(mocks.library[0]?.uploadedAt).toBe(300);
    expect(mocks.saveLibraryBooks).not.toHaveBeenCalled();
  });

  it('discards an old owner purge response before touching the replacement library', async () => {
    showFiles([bookKey]);
    const response = Promise.withResolvers<Response>();
    mocks.fetchWithAuth.mockReturnValue(response.promise);
    await confirmDeleteFile('book-hash.epub');
    await waitFor(() => expect(mocks.fetchWithAuth).toHaveBeenCalled());
    await act(async () => {
      publishCloudSession({ subject: 'other-owner', token: 'synthetic-other-token' });
      const lease = await captureCloudLease();
      mocks.library = [
        {
          ...createBook('book-hash'),
          libraryOrigin: { kind: 'cloud', ownerKey: lease.ownerKey, epoch: lease.epoch },
        },
      ];
      response.resolve(
        Response.json({ success: [bookKey], failed: [], deletedCount: 1, failedCount: 0 }),
      );
    });
    expect(mocks.library[0]?.uploadedAt).toBe(300);
    expect(mocks.saveLibraryBooks).not.toHaveBeenCalled();
    expect(mocks.setLibrary).not.toHaveBeenCalled();
  });

  it('discards a late old-owner file list after the new owner has loaded', async () => {
    const pending = Promise.withResolvers<unknown>();
    mocks.listFiles.mockReturnValueOnce(pending.promise);
    render(<StorageManager />);
    await waitFor(() => expect(mocks.listFiles).toHaveBeenCalledTimes(1));
    const otherKey = 'other-owner/Readest/Books/other-hash/New-owner.epub';
    showFiles([otherKey]);
    await act(async () => {
      publishCloudSession({ subject: 'other-owner', token: 'synthetic-other-token' });
    });
    expect(await screen.findByText('New-owner.epub')).toBeTruthy();
    await act(async () => {
      pending.resolve({
        files: [fileRecord(bookKey)],
        total: 1,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      });
    });
    expect(screen.queryByText('book-hash.epub')).toBeNull();
    expect(screen.getByText('New-owner.epub')).toBeTruthy();
  });

  it('does not clear replacement-owner selection or announce old deletion after refresh', async () => {
    showFiles([coverKey]);
    const pendingRefresh = Promise.withResolvers<unknown>();
    mocks.listFiles
      .mockResolvedValueOnce({
        files: [fileRecord(coverKey)],
        total: 1,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      })
      .mockReturnValueOnce(pendingRefresh.promise);
    await confirmDeleteFile('cover.png');
    await waitFor(() => expect(mocks.listFiles).toHaveBeenCalledTimes(2));

    const otherKey = 'other-owner/Readest/Books/other-hash/New-owner.epub';
    showFiles([otherKey]);
    await act(async () => {
      publishCloudSession({ subject: 'other-owner', token: 'synthetic-other-token' });
    });
    const row = (await screen.findByText('New-owner.epub')).closest('tr');
    if (!row) throw new Error('Expected replacement-owner file row');
    const checkbox = within(row).getByRole('checkbox') as HTMLInputElement;
    await waitFor(() => expect(checkbox.disabled).toBe(false));
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(true);
    mocks.dispatch.mockClear();

    await act(async () => {
      pendingRefresh.resolve({ files: [], total: 0, page: 1, pageSize: 20, totalPages: 0 });
    });
    expect(checkbox.checked).toBe(true);
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });
});
