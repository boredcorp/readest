import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Book } from '@/types/book';
import type { FileRecord } from '@/libs/storage';

const mocks = vi.hoisted(() => ({
  listFiles: vi.fn(),
  getStorageStats: vi.fn(),
  purgeFiles: vi.fn(),
  fetchWithAuth: vi.fn(),
  saveLibraryBooks: vi.fn(),
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
  useEnv: () => ({ appService: { saveLibraryBooks: mocks.saveLibraryBooks } }),
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
  book_hash: 'book-hash',
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

async function confirmDeleteFile(filename: string, expand = false) {
  render(<StorageManager />);
  if (expand) fireEvent.click(await screen.findByRole('button', { name: '+' }));
  const labels = await screen.findAllByText(filename);
  const row = labels.at(-1)?.closest('tr');
  if (!row) throw new Error('Expected file row');
  const checkbox = within(row).getByRole('checkbox') as HTMLInputElement;
  await waitFor(() => expect(checkbox.disabled).toBe(false));
  fireEvent.click(checkbox);
  fireEvent.click(screen.getByRole('button', { name: 'Delete Selected' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
}

describe('StorageManager deletion metadata', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.library = [createBook('book-hash'), createBook('unselected-book')];
    mocks.saveLibraryBooks.mockResolvedValue(undefined);
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
    vi.restoreAllMocks();
  });

  it('retains the cloud book flag when a cover is the only file visible on the page', async () => {
    showFiles([coverKey]);
    await confirmDeleteFile('cover.png');
    await waitFor(() => expect(mocks.dispatch).toHaveBeenCalled());
    expect(mocks.purgeFiles).toHaveBeenCalledWith([coverKey], true);
    expect(mocks.library[0]?.uploadedAt).toBe(300);
    expect(mocks.library[0]?.updatedAt).toBe(200);
  });

  it('retains the cloud book flag when only its expanded cover row is selected', async () => {
    showFiles([bookKey, coverKey]);
    await confirmDeleteFile('cover.png', true);
    await waitFor(() => expect(mocks.dispatch).toHaveBeenCalled());
    expect(mocks.purgeFiles).toHaveBeenCalledWith([coverKey], true);
    expect(mocks.library[0]?.uploadedAt).toBe(300);
    expect(mocks.library[0]?.updatedAt).toBe(200);
  });

  it('clears only the selected book flag after its actual object deletion succeeds', async () => {
    showFiles([bookKey, coverKey]);
    await confirmDeleteFile('book-hash.epub', true);
    await waitFor(() => expect(mocks.saveLibraryBooks).toHaveBeenCalled());
    expect(mocks.purgeFiles).toHaveBeenCalledWith([bookKey], true);
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
    expect(mocks.purgeFiles).toHaveBeenCalledWith([bookKey, coverKey], true);
    expect(mocks.fetchWithAuth).toHaveBeenCalledWith(
      '/api/storage/purge',
      expect.objectContaining({
        method: 'DELETE',
        body: JSON.stringify({ fileKeys: [bookKey, coverKey] }),
      }),
    );
    expect(mocks.library[0]?.uploadedAt).toBe(300);
    expect(mocks.library[0]?.updatedAt).toBe(200);
    expect(mocks.saveLibraryBooks).not.toHaveBeenCalled();
  });
});
