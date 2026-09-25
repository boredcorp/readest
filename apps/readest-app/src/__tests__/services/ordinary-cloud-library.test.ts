import { beforeEach, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import type { AppService } from '@/types/system';
import type { Book } from '@/types/book';
import { publishCloudSession, captureCloudLease } from '@/services/cloudOwnerSession';
import { cloudLibraryPath, parseCloudLibrary } from '@/services/cloudLibraryModel';
import {
  uploadOrdinaryBook,
  retryCloudBook,
  deleteOrdinaryCloudBook,
  refreshCloudLibrary,
} from '@/services/ordinaryCloudLibrary';
import { fetchWithTimeout } from '@/utils/fetch';
import { webUpload } from '@/utils/transfer';

const readerFixture = vi.hoisted(() => ({
  book: null as Book | null,
  close: vi.fn(),
  clear: vi.fn(),
}));

vi.mock('@/services/environment', () => ({ getAPIBaseUrl: () => 'https://fixture.invalid/api' }));
vi.mock('@/services/constants', () => ({ CLOUD_BOOKS_SUBDIR: 'Readest/Books' }));
vi.mock('@/utils/fetch', () => ({ fetchWithTimeout: vi.fn() }));
vi.mock('@/utils/transfer', () => ({ webUpload: vi.fn(), webDownload: vi.fn() }));
vi.mock('@/utils/book', () => ({
  getLocalBookFilename: (book: Book) =>
    `${book.libraryOrigin?.kind === 'cloud' ? `cloud/v1/${book.libraryOrigin.ownerKey}/` : ''}${book.hash}/book.epub`,
  getCoverFilename: (book: Book) =>
    `${book.libraryOrigin?.kind === 'cloud' ? `cloud/v1/${book.libraryOrigin.ownerKey}/` : ''}${book.hash}/cover.png`,
  getRemoteBookFilename: (book: Book) => `${book.hash}/${book.hash}.epub`,
  getRemoteCoverFilename: (book: Book) => `${book.hash}/cover.png`,
  getConfigFilename: (book: Book) =>
    `${book.libraryOrigin?.kind === 'cloud' ? `cloud/v1/${book.libraryOrigin.ownerKey}/` : ''}${book.hash}/config.json`,
  getBookNavFilename: (book: Book) =>
    `${book.libraryOrigin?.kind === 'cloud' ? `cloud/v1/${book.libraryOrigin.ownerKey}/` : ''}${book.hash}/nav.json`,
}));
vi.mock('@/store/libraryStore', () => ({
  useLibraryStore: { getState: () => ({ setLibrary: vi.fn() }) },
}));
vi.mock('@/store/bookDataStore', () => ({
  useBookDataStore: {
    getState: () => ({
      getBookData: () => (readerFixture.book ? { book: readerFixture.book } : null),
      clearBookData: readerFixture.clear,
    }),
  },
}));
vi.mock('@/store/readerStore', () => ({
  retireCloudBookViews: (hash: string, ownerKey: string, epoch: number) => {
    const origin = readerFixture.book?.libraryOrigin;
    if (origin?.kind === 'cloud' && origin.ownerKey === ownerKey && origin.epoch === epoch) {
      readerFixture.close();
      readerFixture.clear(hash);
    }
  },
  useReaderStore: {
    getState: () => ({
      bookKeys: readerFixture.book ? [`${readerFixture.book.hash}-active`] : [],
      getView: () => ({ close: readerFixture.close, remove: vi.fn() }),
      clearViewState: vi.fn(),
      setBookKeys: vi.fn(),
    }),
  },
}));

const hash = '1'.repeat(32);
const local: Book = {
  hash,
  title: 'Fixture',
  author: 'Synthetic',
  format: 'EPUB',
  createdAt: 1,
  updatedAt: 2,
  libraryOrigin: { kind: 'local' },
};
let files: Map<string, string | File>;
let app: AppService;
const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const requestMock = vi.mocked(fetchWithTimeout);
function db(book: Book) {
  return {
    user_id: 'fixture-A',
    book_hash: book.hash,
    title: book.title,
    author: book.author,
    format: book.format,
    created_at: new Date(book.createdAt).toISOString(),
    updated_at: new Date(book.updatedAt).toISOString(),
    deleted_at: book.deletedAt ? new Date(book.deletedAt).toISOString() : null,
    uploaded_at: book.uploadedAt ? new Date(book.uploadedAt).toISOString() : null,
  };
}
async function entry() {
  const lease = await captureCloudLease();
  return parseCloudLibrary(
    (files.get(cloudLibraryPath(lease.ownerKey)) as string) ?? null,
    lease.ownerKey,
  ).entries[hash];
}

beforeEach(() => {
  vi.clearAllMocks();
  readerFixture.book = null;
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('navigator', {
    locks: {
      request: async (_name: string, _options: unknown, run: () => Promise<unknown>) => run(),
    },
  });
  publishCloudSession(null);
  publishCloudSession({ subject: 'fixture-A', token: 'synthetic-token-A' });
  files = new Map([[`${hash}/book.epub`, new File(['synthetic book'], 'book.epub')]]);
  app = {
    appPlatform: 'web',
    exists: async (path: string) => files.has(path),
    readFile: async (path: string) => files.get(path),
    openFile: async (path: string) => files.get(path),
    deleteFile: async (path: string) => {
      files.delete(path);
    },
    updateTextFile: async (
      path: string,
      _base: unknown,
      update: (text: string | null) => string,
    ) => {
      files.set(path, update((files.get(path) as string) ?? null));
    },
  } as unknown as AppService;
  vi.mocked(webUpload).mockResolvedValue(undefined);
  requestMock.mockImplementation(async (url, init) => {
    if (url.includes('/storage/list'))
      return response({ files: [], total: 0, page: 1, pageSize: 100, totalPages: 0 });
    if (url.endsWith('/storage/upload'))
      return response({ uploadUrl: 'https://fixture.invalid/signed-put' });
    if (url.includes('/storage/delete')) return response({ message: 'Deleted' });
    if (init?.method === 'POST' && url.endsWith('/sync')) {
      const payload = JSON.parse(init.body as string) as { books: Book[] };
      return response({ books: payload.books.map(db) });
    }
    return response({ books: [] });
  });
});

describe('ordinary cloud operation boundaries', () => {
  it('deletes the actual owner book object when its stored title differs from metadata', async () => {
    await uploadOrdinaryBook(app, local);
    const key = `fixture-A/Readest/Books/${hash}/Original.epub`;
    requestMock.mockImplementationOnce(async () =>
      response({
        files: [{ file_key: key, book_hash: hash }],
        total: 1,
        page: 1,
        pageSize: 100,
        totalPages: 1,
      }),
    );
    await deleteOrdinaryCloudBook(app, local);
    expect(
      requestMock.mock.calls.some(
        ([url, init]) => init?.method === 'DELETE' && url.includes(encodeURIComponent(key)),
      ),
    ).toBe(true);
    expect((await entry())?.deletedKeys).toContain(`${hash}/Original.epub`);
    expect((await entry())?.state).toBe('tombstoned');
  });

  it.each(['wrong-owner', 'wrong-hash', 'incomplete'])(
    'does not delete anything for an unverified %s listing',
    async (invalid) => {
      await uploadOrdinaryBook(app, local);
      requestMock.mockClear();
      requestMock.mockImplementationOnce(async () =>
        response({
          files: [
            {
              file_key: `${invalid === 'wrong-owner' ? 'fixture-B' : 'fixture-A'}/Readest/Books/${hash}/Original.epub`,
              book_hash: invalid === 'wrong-hash' ? '2'.repeat(32) : hash,
            },
          ],
          total: invalid === 'incomplete' ? 2 : 1,
          page: 1,
          pageSize: 100,
          totalPages: 1,
        }),
      );
      await expect(deleteOrdinaryCloudBook(app, local)).rejects.toThrow();
      expect(requestMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false);
      expect((await entry())?.state).toBe('delete_pending');
    },
  );

  it('cloud deletion preserves the separate same-hash local reader context', async () => {
    await uploadOrdinaryBook(app, local);
    readerFixture.book = local;
    await deleteOrdinaryCloudBook(app, local);
    expect(readerFixture.close).not.toHaveBeenCalled();
    expect(readerFixture.clear).not.toHaveBeenCalled();
    expect(readerFixture.book).toBe(local);
  });

  it('cloud deletion retires the matching cloud reader context', async () => {
    await uploadOrdinaryBook(app, local);
    const lease = await captureCloudLease();
    readerFixture.book = {
      ...local,
      libraryOrigin: { kind: 'cloud', ownerKey: lease.ownerKey, epoch: lease.epoch },
    };
    await deleteOrdinaryCloudBook(app, local);
    expect(readerFixture.close).toHaveBeenCalled();
    expect(readerFixture.clear).toHaveBeenCalledWith(hash);
  });
  it('does not accept a cover without required book bytes or auto-upload on discovery', async () => {
    files.delete(`${hash}/book.epub`);
    files.set(`${hash}/cover.png`, new File(['cover'], 'cover.png'));
    await refreshCloudLibrary(app);
    expect(webUpload).not.toHaveBeenCalled();
    await expect(uploadOrdinaryBook(app, local)).rejects.toThrow('local book');
    expect(webUpload).not.toHaveBeenCalled();
    expect(await entry()).toBeUndefined();
  });

  it('retains interrupted metadata and retries without another signed PUT', async () => {
    requestMock
      .mockImplementationOnce(async () =>
        response({ uploadUrl: 'https://fixture.invalid/signed-put' }),
      )
      .mockImplementationOnce(async () => response({}, 503));
    await expect(uploadOrdinaryBook(app, local)).rejects.toThrow();
    expect((await entry())?.state).toBe('metadata_pending');
    await refreshCloudLibrary(app);
    expect((await entry())?.state).toBe('metadata_pending');
    await retryCloudBook(app, local);
    expect(webUpload).toHaveBeenCalledTimes(1);
    expect((await entry())?.state).toBe('ready');
  });

  it('invalidates A signed-upload responses before transfer when B signs in', async () => {
    requestMock.mockImplementationOnce(async () => {
      publishCloudSession({ subject: 'fixture-B', token: 'synthetic-token-B' });
      return response({ uploadUrl: 'https://fixture.invalid/signed-put' });
    });
    await expect(uploadOrdinaryBook(app, local)).rejects.toThrow();
    expect(webUpload).not.toHaveBeenCalled();
    expect(await entry()).toBeUndefined();
    expect(requestMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry another account when ownership changes while reading its journal', async () => {
    requestMock
      .mockImplementationOnce(async () =>
        response({ uploadUrl: 'https://fixture.invalid/signed-put' }),
      )
      .mockImplementationOnce(async () => response({}, 503));
    await expect(uploadOrdinaryBook(app, local)).rejects.toThrow();
    const read = app.readFile;
    app.readFile = async (...args) => {
      const result = await read(...args);
      publishCloudSession({ subject: 'fixture-B', token: 'synthetic-token-B' });
      return result;
    };
    requestMock.mockClear();
    await expect(retryCloudBook(app, local)).rejects.toThrow();
    expect(requestMock).not.toHaveBeenCalled();
  });

  it('retains successful deletion substeps on a later failure', async () => {
    await uploadOrdinaryBook(app, local);
    requestMock
      .mockImplementationOnce(async () =>
        response({ files: [], total: 0, page: 1, pageSize: 100, totalPages: 0 }),
      )
      .mockImplementationOnce(async () => response({ message: 'Deleted' }))
      .mockImplementationOnce(async () => response({}, 503));
    await expect(deleteOrdinaryCloudBook(app, local)).rejects.toThrow();
    expect(await entry()).toMatchObject({ state: 'delete_pending', bookDeleted: true });
    requestMock.mockClear();
    await retryCloudBook(app, local);
    expect((await entry())?.state).toBe('tombstoned');
    expect(requestMock.mock.calls.filter(([url]) => url.includes('/storage/delete'))).toHaveLength(
      1,
    );
  });

  it('allows explicit re-enrollment after a confirmed tombstone with fresh upload flags', async () => {
    await uploadOrdinaryBook(app, local);
    await deleteOrdinaryCloudBook(app, local);
    expect(files.has(`${hash}/book.epub`)).toBe(true);
    await uploadOrdinaryBook(app, local);
    expect(webUpload).toHaveBeenCalledTimes(2);
    expect(await entry()).toMatchObject({ state: 'ready', bookUploaded: true });
    expect((await entry())?.bookDeleted).not.toBe(true);
  });

  it('keeps cache cleanup failure visible and retryable after acknowledged remote deletion', async () => {
    await uploadOrdinaryBook(app, local);
    const lease = await captureCloudLease();
    files.set(
      `cloud/v1/${lease.ownerKey}/${hash}/book.epub`,
      new File(['owner cache'], 'book.epub'),
    );
    const remove = app.deleteFile;
    app.deleteFile = vi
      .fn()
      .mockRejectedValueOnce(new Error('disk failure'))
      .mockImplementation(remove);
    await expect(deleteOrdinaryCloudBook(app, local)).rejects.toThrow();
    expect((await entry())?.state).toBe('delete_pending');
    await retryCloudBook(app, local);
    expect((await entry())?.state).toBe('tombstoned');
    expect(files.has(`${hash}/book.epub`)).toBe(true);
  });
});
