import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { deleteBook } from '@/services/cloudService';
import { deleteFile } from '@/libs/storage';
import { Book, BookFormat } from '@/types/book';
import { FileSystem } from '@/types/system';

// Mock external dependencies
vi.mock('@/utils/book', () => ({
  getDir: vi.fn((book: Book) => book.hash),
  getLocalBookFilename: vi.fn((book: Book) => `${book.hash}/${book.title}.epub`),
  getRemoteBookFilename: vi.fn((book: Book) => `${book.hash}/${book.hash}.epub`),
  getCoverFilename: vi.fn((book: Book) => `${book.hash}/cover.png`),
}));

vi.mock('@/libs/storage', () => ({
  downloadFile: vi.fn().mockResolvedValue(undefined),
  uploadFile: vi.fn().mockResolvedValue('https://example.com/file'),
  deleteFile: vi.fn(),
  createProgressHandler: vi.fn().mockReturnValue(vi.fn()),
  batchGetDownloadUrls: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/utils/file', () => ({
  ClosableFile: class {},
  RemoteFile: class {
    async open() {
      return new File(['content'], 'test.epub');
    }
  },
}));

function createMockBook(overrides: Partial<Book> = {}): Book {
  return {
    hash: 'abc123',
    format: 'EPUB' as BookFormat,
    title: 'Test Book',
    author: 'Author',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    deletedAt: null,
    uploadedAt: null,
    downloadedAt: Date.now(),
    coverDownloadedAt: Date.now(),
    ...overrides,
  };
}

function createMockFs(): FileSystem {
  return {
    resolvePath: vi
      .fn()
      .mockReturnValue({ baseDir: 0, basePrefix: async () => '', fp: 'test', base: 'Books' }),
    getURL: vi.fn().mockReturnValue('url'),
    getBlobURL: vi.fn().mockResolvedValue('blob:url'),
    getImageURL: vi.fn().mockResolvedValue('image:url'),
    openFile: vi.fn().mockResolvedValue(new File(['content'], 'test.epub')),
    copyFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue('content'),
    writeFile: vi.fn().mockResolvedValue(undefined),
    removeFile: vi.fn().mockResolvedValue(undefined),
    readDir: vi.fn().mockResolvedValue([]),
    createDir: vi.fn().mockResolvedValue(undefined),
    removeDir: vi.fn().mockResolvedValue(undefined),
    exists: vi.fn().mockResolvedValue(true),
    stats: vi.fn().mockResolvedValue({
      isFile: true,
      isDirectory: false,
      size: 100,
      mtime: null,
      atime: null,
      birthtime: null,
    }),
    getPrefix: vi.fn().mockResolvedValue('Readest/Books'),
  };
}

describe('cloudService', () => {
  let mockFs: FileSystem;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(deleteFile).mockReset().mockResolvedValue(undefined);
    mockFs = createMockFs();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('deleteBook', () => {
    describe('local delete action', () => {
      test('removes the local book file', async () => {
        const book = createMockBook();
        await deleteBook(mockFs, book, 'local');

        expect(mockFs.exists).toHaveBeenCalledWith(`${book.hash}/${book.title}.epub`, 'Books');
        expect(mockFs.removeFile).toHaveBeenCalledWith(`${book.hash}/${book.title}.epub`, 'Books');
      });

      test('sets downloadedAt to null', async () => {
        const book = createMockBook({ downloadedAt: 12345 });
        await deleteBook(mockFs, book, 'local');

        expect(book.downloadedAt).toBeNull();
      });

      test('does not set deletedAt for local-only delete', async () => {
        const book = createMockBook({ deletedAt: null });
        await deleteBook(mockFs, book, 'local');

        // local action does not modify deletedAt
        expect(book.deletedAt).toBeNull();
      });

      test('skips removal when file does not exist', async () => {
        vi.mocked(mockFs.exists).mockResolvedValue(false);
        const book = createMockBook();
        await deleteBook(mockFs, book, 'local');

        expect(mockFs.removeFile).not.toHaveBeenCalled();
      });

      test('only deletes book file, not cover (local action)', async () => {
        const book = createMockBook();
        await deleteBook(mockFs, book, 'local');

        // local action only deletes the book file
        expect(mockFs.removeFile).toHaveBeenCalledTimes(1);
        expect(mockFs.removeFile).toHaveBeenCalledWith(`${book.hash}/${book.title}.epub`, 'Books');
      });
    });

    describe('both delete action', () => {
      test('removes book file and cover', async () => {
        const book = createMockBook({ uploadedAt: 1000 });
        await deleteBook(mockFs, book, 'both');

        // 'both' deletes localBookFilename + coverFilename
        expect(mockFs.removeFile).toHaveBeenCalledWith(`${book.hash}/${book.title}.epub`, 'Books');
        expect(mockFs.removeFile).toHaveBeenCalledWith(`${book.hash}/cover.png`, 'Books');
      });

      test('sets deletedAt, clears downloadedAt and coverDownloadedAt', async () => {
        const book = createMockBook({
          uploadedAt: 1000,
          downloadedAt: 2000,
          coverDownloadedAt: 3000,
        });
        await deleteBook(mockFs, book, 'both');

        expect(book.deletedAt).toBeGreaterThan(0);
        expect(book.downloadedAt).toBeNull();
        expect(book.coverDownloadedAt).toBeNull();
      });

      test('clears uploadedAt when uploaded', async () => {
        const book = createMockBook({ uploadedAt: 1000 });
        await deleteBook(mockFs, book, 'both');

        expect(book.uploadedAt).toBeNull();
      });
    });

    describe('cloud delete action', () => {
      test('does not delete local files', async () => {
        const book = createMockBook({ uploadedAt: 1000 });
        await deleteBook(mockFs, book, 'cloud');

        expect(mockFs.removeFile).not.toHaveBeenCalled();
      });

      test('clears uploadedAt when previously uploaded', async () => {
        const book = createMockBook({ uploadedAt: 1000 });
        await deleteBook(mockFs, book, 'cloud');

        expect(book.uploadedAt).toBeNull();
      });

      test('skips cloud delete when not uploaded', async () => {
        const { deleteFile: deleteCloudFile } = await import('@/libs/storage');
        const book = createMockBook({ uploadedAt: null });
        await deleteBook(mockFs, book, 'cloud');

        expect(deleteCloudFile).not.toHaveBeenCalled();
      });

      test('calls deleteFile for remote book and cover', async () => {
        const { deleteFile: deleteCloudFile } = await import('@/libs/storage');
        const book = createMockBook({ uploadedAt: 1000 });
        await deleteBook(mockFs, book, 'cloud');

        expect(deleteCloudFile).toHaveBeenCalledTimes(2);
      });

      test('propagates cloud failure and retains uploadedAt', async () => {
        const { deleteFile: deleteCloudFile } = await import('@/libs/storage');
        vi.mocked(deleteCloudFile).mockRejectedValueOnce(new Error('network error'));
        const book = createMockBook({ uploadedAt: 1000 });

        await expect(deleteBook(mockFs, book, 'cloud')).rejects.toThrow('network error');
        expect(book.uploadedAt).toBe(1000);
      });

      test('awaits both book and cover before clearing uploadedAt', async () => {
        const { deleteFile: deleteCloudFile } = await import('@/libs/storage');
        const bookRequest = Promise.withResolvers<void>();
        const coverRequest = Promise.withResolvers<void>();
        vi.mocked(deleteCloudFile)
          .mockReturnValueOnce(bookRequest.promise)
          .mockReturnValueOnce(coverRequest.promise);
        const book = createMockBook({ uploadedAt: 1000 });
        let complete = false;
        const deletion = deleteBook(mockFs, book, 'cloud').then(() => {
          complete = true;
        });
        await vi.waitFor(() => expect(deleteCloudFile).toHaveBeenCalledTimes(1));
        expect(book.uploadedAt).toBe(1000);
        expect(complete).toBe(false);
        bookRequest.resolve();
        await vi.waitFor(() => expect(deleteCloudFile).toHaveBeenCalledTimes(2));
        expect(deleteCloudFile).toHaveBeenNthCalledWith(1, 'Readest/Books/abc123/abc123.epub');
        expect(deleteCloudFile).toHaveBeenNthCalledWith(2, 'Readest/Books/abc123/cover.png');
        expect(book.uploadedAt).toBe(1000);
        expect(complete).toBe(false);
        coverRequest.resolve();
        await deletion;
        expect(book.uploadedAt).toBeNull();
      });

      test('keeps the book retryable when only the cover deletion fails', async () => {
        const { deleteFile: deleteCloudFile } = await import('@/libs/storage');
        vi.mocked(deleteCloudFile)
          .mockResolvedValueOnce(undefined)
          .mockRejectedValueOnce(new Error('cover unavailable'));
        const book = createMockBook({ uploadedAt: 1000 });
        await expect(deleteBook(mockFs, book, 'cloud')).rejects.toThrow('cover unavailable');
        expect(book.uploadedAt).toBe(1000);
        vi.mocked(deleteCloudFile).mockResolvedValue(undefined);
        await deleteBook(mockFs, book, 'cloud');
        expect(book.uploadedAt).toBeNull();
        expect(deleteCloudFile).toHaveBeenCalledTimes(4);
      });

      test('retains local files and flags when cloud deletion fails during both', async () => {
        const { deleteFile: deleteCloudFile } = await import('@/libs/storage');
        vi.mocked(deleteCloudFile).mockRejectedValueOnce(new Error('network error'));
        const book = createMockBook({
          uploadedAt: 1000,
          downloadedAt: 2000,
          coverDownloadedAt: 3000,
        });
        await expect(deleteBook(mockFs, book, 'both')).rejects.toThrow('network error');
        expect(mockFs.removeFile).not.toHaveBeenCalled();
        expect(book).toMatchObject({
          uploadedAt: 1000,
          downloadedAt: 2000,
          coverDownloadedAt: 3000,
          deletedAt: null,
        });
      });
    });
  });
});
