import type { Book } from '@/types/book';
import type { AppService } from '@/types/system';
import type { DBBook } from '@/types/records';
import { getAPIBaseUrl } from './environment';
import { CLOUD_BOOKS_SUBDIR } from './constants';
import {
  assertCloudLease,
  assertCloudOrigin,
  captureCloudLease,
  cloudAuthSnapshot,
  type CloudLease,
} from './cloudOwnerSession';
import {
  isOrdinaryCloudBook,
  isLegacyUnownedCloudBook,
  mergeCloudPull,
  sanitizeCloudBook,
  type CloudEntry,
} from './cloudLibraryModel';
import { readCloudLibrary, selectCloudCopy, updateCloudLibrary } from './cloudLibraryRepository';
import {
  getLocalBookFilename,
  getCoverFilename,
  getRemoteBookFilename,
  getRemoteCoverFilename,
  getConfigFilename,
  getBookNavFilename,
} from '@/utils/book';
import { transformBookFromDB } from '@/utils/transform';
import { fetchWithTimeout } from '@/utils/fetch';
import { webUpload, webDownload } from '@/utils/transfer';
import { useLibraryStore } from '@/store/libraryStore';
import { useBookDataStore } from '@/store/bookDataStore';
import { useReaderStore, retireCloudBookViews } from '@/store/readerStore';

async function request(lease: CloudLease, path: string, init: RequestInit = {}): Promise<Response> {
  const auth = cloudAuthSnapshot(lease);
  const response = await fetchWithTimeout(`${getAPIBaseUrl()}${path}`, {
    ...init,
    signal: lease.signal,
    headers: { ...init.headers, Authorization: `Bearer ${auth.token}` },
  });
  assertCloudLease(lease);
  if (!response.ok) throw new Error('Cloud library request failed');
  return response;
}

function requireBook(book: Book): void {
  if (!isOrdinaryCloudBook(book) || isLegacyUnownedCloudBook(book))
    throw new Error('This book cannot use the ordinary cloud library');
  assertCloudOrigin(book.libraryOrigin);
}

async function withBook<T>(
  app: AppService,
  hash: string,
  run: (lease: CloudLease) => Promise<T>,
): Promise<T> {
  if (app.appPlatform !== 'web' || !app.updateTextFile || !navigator.locks)
    throw new Error('Cloud library is unavailable in this browser');
  const lease = await captureCloudLease();
  return navigator.locks.request(
    `storybored-cloud:${lease.ownerKey}:${hash}`,
    { signal: lease.signal },
    async () => {
      assertCloudLease(lease);
      return run(lease);
    },
  );
}

async function editEntry(
  app: AppService,
  lease: CloudLease,
  hash: string,
  edit: (entry: CloudEntry) => CloudEntry,
): Promise<void> {
  await updateCloudLibrary(app, lease, (library) => {
    const entry = library.entries[hash];
    if (!entry) throw new Error('Cloud book is unavailable');
    library.entries[hash] = { ...edit(entry), revision: entry.revision + 1 };
    return library;
  });
}

async function pushEntry(app: AppService, lease: CloudLease, hash: string): Promise<void> {
  const entry = (await readCloudLibrary(app, lease)).entries[hash];
  if (!entry || !['metadata_pending', 'delete_pending'].includes(entry.state)) return;
  const response = await request(lease, '/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ books: [sanitizeCloudBook(entry.book)] }),
  });
  const payload = (await response.json()) as { books?: DBBook[] };
  assertCloudLease(lease);
  const acknowledged = payload.books?.find(
    (row) => row.user_id === lease.subject && row.book_hash === hash,
  );
  if (!acknowledged) throw new Error('Cloud library did not confirm this book');
  const authoritative = transformBookFromDB(acknowledged);
  if (
    Boolean(authoritative.deletedAt) !== Boolean(entry.book.deletedAt) ||
    (!entry.book.deletedAt && !authoritative.uploadedAt)
  )
    throw new Error('Cloud library confirmation did not match');
  await editEntry(app, lease, hash, (current) =>
    current.revision !== entry.revision
      ? current
      : {
          ...current,
          book: sanitizeCloudBook({
            ...authoritative,
            downloadedAt: current.book.downloadedAt,
            coverDownloadedAt: current.book.coverDownloadedAt,
          }),
          // Remote acknowledgement alone is not complete deletion: owner cache cleanup follows.
          state: authoritative.deletedAt ? 'delete_pending' : 'ready',
          operationId: authoritative.deletedAt ? current.operationId : undefined,
        },
  );
}

export async function refreshCloudLibrary(
  app: AppService,
  options: { pushChanges?: boolean } = {},
): Promise<void> {
  const lease = await captureCloudLease();
  // Only previously enrolled owner entries can push. A local import is never enrolled here.
  const initial = await readCloudLibrary(app, lease);
  for (const [hash, entry] of Object.entries(initial.entries)) {
    if (options.pushChanges && entry.state === 'metadata_pending' && !entry.operationId)
      await withBook(app, hash, async (current) => {
        if (current.epoch !== lease.epoch) throw new DOMException('Account changed', 'AbortError');
        await pushEntry(app, current, hash);
      });
  }
  const library = await readCloudLibrary(app, lease);
  const response = await request(
    lease,
    `/sync?type=books&since=${encodeURIComponent(Math.max(0, library.booksCursor - 1))}`,
  );
  const payload = (await response.json()) as { books?: DBBook[] };
  assertCloudLease(lease);
  if (!Array.isArray(payload.books)) throw new Error('Invalid cloud library response');
  const books = payload.books
    .filter(
      (row) =>
        row.user_id === lease.subject && row.book_hash !== '00000000000000000000000000000000',
    )
    .map(transformBookFromDB);
  const cursor = Math.max(
    library.booksCursor,
    ...books.map((book) => Math.max(book.updatedAt || 0, book.deletedAt || 0)),
  );
  await updateCloudLibrary(app, lease, (latest) => mergeCloudPull(latest, books, cursor));
}

export async function retryCloudBook(app: AppService, book: Book): Promise<void> {
  requireBook(book);
  const originalLease = await captureCloudLease();
  const entry = (await readCloudLibrary(app, originalLease)).entries[book.hash];
  assertCloudLease(originalLease);
  if (entry?.state === 'delete_pending') return deleteOrdinaryCloudBook(app, book);
  if (entry?.state === 'metadata_pending')
    return withBook(app, book.hash, (lease) => {
      assertCloudLease(originalLease);
      return pushEntry(app, lease, book.hash);
    });
  if (entry?.state === 'upload_pending') return uploadOrdinaryBook(app, book);
  throw new Error('No pending cloud operation');
}

export async function getCloudBookState(app: AppService, hash: string): Promise<CloudEntry | null> {
  const lease = await captureCloudLease();
  return (await readCloudLibrary(app, lease)).entries[hash] ?? null;
}

export async function hasLocalLibraryCopy(app: AppService, hash: string): Promise<boolean> {
  if (!(await app.exists('library.json', 'Books'))) return false;
  const raw = await app.readFile('library.json', 'Books', 'text');
  if (typeof raw !== 'string') throw new Error('Invalid local library');
  const books = JSON.parse(raw) as Book[];
  return books.some(
    (book) =>
      book.hash === hash &&
      !book.deletedAt &&
      !book.libraryOrigin &&
      !isLegacyUnownedCloudBook(book),
  );
}

export async function uploadOrdinaryBook(app: AppService, book: Book): Promise<void> {
  requireBook(book);
  if (book.libraryOrigin?.kind === 'cloud') throw new Error('Choose the local copy to upload');
  await withBook(app, book.hash, async (lease) => {
    const existing = (await readCloudLibrary(app, lease)).entries[book.hash];
    if (existing?.state === 'ready') throw new Error('This book is already in the cloud library');
    if (existing?.state === 'delete_pending')
      throw new Error('Finish deleting the cloud book before uploading again');
    const localPath = getLocalBookFilename(book);
    if (!(await app.exists(localPath, 'Books')))
      throw new Error('Download or import the local book before uploading');
    assertCloudLease(lease);
    if (!existing || existing.state === 'tombstoned')
      await updateCloudLibrary(app, lease, (library) => {
        library.entries[book.hash] = {
          book: sanitizeCloudBook({
            ...book,
            uploadedAt: null,
            syncedAt: null,
            downloadedAt: null,
            coverDownloadedAt: null,
            deletedAt: null,
          }),
          state: 'upload_pending',
          revision: (existing?.revision ?? 0) + 1,
          operationId: crypto.randomUUID(),
        };
        return library;
      });
    let entry = (await readCloudLibrary(app, lease)).entries[book.hash]!;
    if (!entry.bookUploaded) {
      const source = await app.openFile(localPath, 'Books');
      assertCloudLease(lease);
      await uploadObject(
        lease,
        source,
        `${CLOUD_BOOKS_SUBDIR}/${getRemoteBookFilename(entry.book)}`,
        book.hash,
      );
      await editEntry(app, lease, book.hash, (current) => ({ ...current, bookUploaded: true }));
    }
    entry = (await readCloudLibrary(app, lease)).entries[book.hash]!;
    const coverPath = getCoverFilename(book);
    if (!entry.coverUploaded && (await app.exists(coverPath, 'Books'))) {
      const cover = await app.openFile(coverPath, 'Books');
      assertCloudLease(lease);
      await uploadObject(
        lease,
        cover,
        `${CLOUD_BOOKS_SUBDIR}/${getRemoteCoverFilename(entry.book)}`,
        book.hash,
      );
      await editEntry(app, lease, book.hash, (current) => ({ ...current, coverUploaded: true }));
    }
    await editEntry(app, lease, book.hash, (current) => ({
      ...current,
      state: 'metadata_pending',
      book: {
        ...current.book,
        uploadedAt: current.book.uploadedAt || Date.now(),
        updatedAt: Date.now(),
      },
    }));
    await pushEntry(app, lease, book.hash);
  });
}

async function uploadObject(
  lease: CloudLease,
  source: File,
  remotePath: string,
  hash: string,
): Promise<void> {
  const response = await request(lease, '/storage/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName: remotePath,
      fileSize: source.size,
      bookHash: hash,
      temp: false,
    }),
  });
  const payload = (await response.json()) as { uploadUrl?: string };
  assertCloudLease(lease);
  if (!payload.uploadUrl) throw new Error('Cloud upload is unavailable');
  await webUpload(source, payload.uploadUrl, undefined, lease.signal);
  assertCloudLease(lease);
}

async function downloadObject(
  app: AppService,
  lease: CloudLease,
  remote: string,
  local: string,
): Promise<void> {
  const key = `${lease.subject}/${CLOUD_BOOKS_SUBDIR}/${remote}`;
  const response = await request(lease, `/storage/download?fileKey=${encodeURIComponent(key)}`);
  const payload = (await response.json()) as { downloadUrl?: string };
  assertCloudLease(lease);
  if (!payload.downloadUrl) throw new Error('Cloud download is unavailable');
  const result = await webDownload(payload.downloadUrl, undefined, undefined, lease.signal);
  const bytes = await result.blob.arrayBuffer();
  assertCloudLease(lease);
  await app.writeFile(local, 'Books', bytes, () => assertCloudLease(lease));
  assertCloudLease(lease);
}

export async function downloadOrdinaryCloudBook(app: AppService, book: Book): Promise<void> {
  requireBook(book);
  if (book.libraryOrigin?.kind !== 'cloud') throw new Error('Choose the cloud copy first');
  await withBook(app, book.hash, async (lease) => {
    assertCloudOrigin(book.libraryOrigin);
    const entry = (await readCloudLibrary(app, lease)).entries[book.hash];
    if (!entry || !['ready', 'metadata_pending'].includes(entry.state) || entry.book.deletedAt)
      throw new Error('Cloud book is unavailable');
    const cloudBook: Book = { ...entry.book, libraryOrigin: book.libraryOrigin };
    await downloadObject(
      app,
      lease,
      getRemoteBookFilename(cloudBook),
      getLocalBookFilename(cloudBook),
    );
    let hasCover = false;
    try {
      await downloadObject(
        app,
        lease,
        getRemoteCoverFilename(cloudBook),
        getCoverFilename(cloudBook),
      );
      hasCover = true;
    } catch {
      assertCloudLease(lease);
    }
    await editEntry(app, lease, book.hash, (current) => ({
      ...current,
      book: {
        ...current.book,
        downloadedAt: Date.now(),
        coverDownloadedAt: hasCover ? Date.now() : null,
      },
    }));
    book.downloadedAt = Date.now();
    book.coverDownloadedAt = hasCover ? Date.now() : null;
  });
}

export function closeCloudBookViews(hash: string): void {
  const reader = useReaderStore.getState();
  for (const key of reader.bookKeys.filter((key) => key.split('-')[0] === hash)) {
    try {
      reader.getView(key)?.close();
      reader.getView(key)?.remove();
    } catch {
      /* still clear stale state */
    }
    reader.clearViewState(key);
  }
  reader.setBookKeys(reader.bookKeys.filter((key) => key.split('-')[0] !== hash));
  useBookDataStore.getState().clearBookData(hash);
}

function closeOwnerCloudBookViews(hash: string, lease: CloudLease): void {
  retireCloudBookViews(hash, lease.ownerKey, lease.epoch);
}

export async function chooseCloudLibraryCopy(
  app: AppService,
  hash: string,
  cloud: boolean,
): Promise<Book | undefined> {
  const lease = await captureCloudLease();
  if (cloud) {
    const entry = (await readCloudLibrary(app, lease)).entries[hash];
    if (!entry || !['ready', 'metadata_pending'].includes(entry.state) || entry.book.deletedAt)
      throw new Error('Cloud book is unavailable');
  }
  assertCloudLease(lease);
  closeCloudBookViews(hash);
  selectCloudCopy(hash, cloud);
  const books = await app.loadLibraryBooks();
  assertCloudLease(lease);
  useLibraryStore.getState().setLibrary(books);
  return books.find((book) => book.hash === hash && !book.deletedAt);
}

async function removeOwnerCache(
  app: AppService,
  lease: CloudLease,
  book: Book,
  includeReadingData = false,
): Promise<void> {
  const cloudBook: Book = {
    ...book,
    libraryOrigin: { kind: 'cloud', ownerKey: lease.ownerKey, epoch: lease.epoch },
  };
  // Exact files only: no directory-prefix deletion can match another owner's cache.
  const paths = [getLocalBookFilename(cloudBook), getCoverFilename(cloudBook)];
  if (includeReadingData) paths.push(getConfigFilename(cloudBook), getBookNavFilename(cloudBook));
  for (const path of paths) {
    assertCloudLease(lease);
    if (await app.exists(path, 'Books')) {
      assertCloudLease(lease);
      await app.deleteFile(path, 'Books', () => assertCloudLease(lease));
    }
  }
  assertCloudLease(lease);
}

export async function removeCloudDownload(app: AppService, book: Book): Promise<void> {
  requireBook(book);
  await withBook(app, book.hash, async (lease) => {
    closeOwnerCloudBookViews(book.hash, lease);
    await removeOwnerCache(app, lease, book);
    await editEntry(app, lease, book.hash, (entry) => ({
      ...entry,
      book: { ...entry.book, downloadedAt: null, coverDownloadedAt: null },
    }));
  });
}

function validateDeleteKey(book: Book, key: string): void {
  const prefix = `${book.hash}/`;
  const name = key.startsWith(prefix) ? key.slice(prefix.length) : '';
  const extension = getRemoteBookFilename(book).split('.').pop();
  if (
    !name ||
    /[/\\\x00-\x1f]/.test(name) ||
    name === '.' ||
    name === '..' ||
    (key !== getRemoteCoverFilename(book) && !name.endsWith(`.${extension}`))
  ) {
    throw new Error('Cloud file identity could not be verified');
  }
}

async function resolveDeleteKeys(lease: CloudLease, book: Book): Promise<string[]> {
  const discovered = new Set<string>();
  const ownerPrefix = `${lease.subject}/${CLOUD_BOOKS_SUBDIR}/`;
  let total: number | undefined;
  let pages = 1;
  for (let page = 1; page <= pages; page++) {
    const response = await request(
      lease,
      `/storage/list?bookHash=${encodeURIComponent(book.hash)}&pageSize=100&sortBy=file_key&sortOrder=asc&page=${page}`,
    );
    const payload = (await response.json()) as {
      files: { file_key: string; book_hash: string }[];
      total: number;
      page: number;
      pageSize: number;
      totalPages: number;
    };
    assertCloudLease(lease);
    if (
      !Array.isArray(payload.files) ||
      !Number.isSafeInteger(payload.total) ||
      payload.total < 0 ||
      payload.total > 1000 ||
      payload.page !== page ||
      payload.pageSize !== 100 ||
      payload.totalPages !== Math.ceil(payload.total / 100) ||
      (total !== undefined && total !== payload.total)
    )
      throw new Error('Cloud file listing is incomplete');
    total = payload.total;
    pages = Math.max(1, payload.totalPages);
    for (const row of payload.files) {
      if (
        row?.book_hash !== book.hash ||
        typeof row.file_key !== 'string' ||
        !row.file_key.startsWith(ownerPrefix)
      )
        throw new Error('Cloud file identity could not be verified');
      const key = row.file_key.slice(ownerPrefix.length);
      validateDeleteKey(book, key);
      discovered.add(key);
    }
  }
  if (discovered.size !== total) throw new Error('Cloud file listing is incomplete');
  // Include expected keys for a PUT whose metadata registration/response was interrupted.
  return [...new Set([...discovered, getRemoteBookFilename(book), getRemoteCoverFilename(book)])];
}

export async function deleteOrdinaryCloudBook(app: AppService, book: Book): Promise<void> {
  requireBook(book);
  await withBook(app, book.hash, async (lease) => {
    await editEntry(app, lease, book.hash, (entry) => ({
      ...entry,
      state: 'delete_pending',
      operationId: entry.operationId || crypto.randomUUID(),
    }));
    closeOwnerCloudBookViews(book.hash, lease);
    let entry = (await readCloudLibrary(app, lease)).entries[book.hash]!;
    if (!entry.deleteKeys) {
      const keys = await resolveDeleteKeys(lease, entry.book);
      await editEntry(app, lease, book.hash, (current) => ({
        ...current,
        deleteKeys: keys,
        deletedKeys: [],
      }));
      entry = (await readCloudLibrary(app, lease)).entries[book.hash]!;
    }
    if (!Array.isArray(entry.deleteKeys) || !Array.isArray(entry.deletedKeys))
      throw new Error('Invalid cloud deletion journal');
    const deleteKeys = entry.deleteKeys;
    if (deleteKeys.length > 1002 || entry.deletedKeys.some((key) => !deleteKeys.includes(key)))
      throw new Error('Invalid cloud deletion journal');
    for (const path of deleteKeys) validateDeleteKey(entry.book, path);
    for (const path of deleteKeys) {
      if (entry.deletedKeys?.includes(path)) continue;
      const key = `${lease.subject}/${CLOUD_BOOKS_SUBDIR}/${path}`;
      await request(lease, `/storage/delete?fileKey=${encodeURIComponent(key)}`, {
        method: 'DELETE',
      });
      await editEntry(app, lease, book.hash, (current) => ({
        ...current,
        deletedKeys: [...new Set([...(current.deletedKeys ?? []), path])],
        bookDeleted: path === getRemoteBookFilename(current.book) || current.bookDeleted,
        coverDeleted: path === getRemoteCoverFilename(current.book) || current.coverDeleted,
      }));
      entry = (await readCloudLibrary(app, lease)).entries[book.hash]!;
    }
    await editEntry(app, lease, book.hash, (current) => ({
      ...current,
      book: { ...current.book, deletedAt: Date.now(), updatedAt: Date.now(), uploadedAt: null },
    }));
    await pushEntry(app, lease, book.hash);
    closeOwnerCloudBookViews(book.hash, lease);
    await removeOwnerCache(app, lease, entry.book, true);
    await editEntry(app, lease, book.hash, (current) => ({
      ...current,
      state: 'tombstoned',
      operationId: undefined,
      book: { ...current.book, downloadedAt: null, coverDownloadedAt: null },
    }));
  });
}
