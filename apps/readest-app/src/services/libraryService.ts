import { FileSystem } from '@/types/system';
import { Book } from '@/types/book';
import { getLibraryFilename } from '@/utils/book';
import { safeLoadJSON, safeSaveJSON } from './persistence';
import { patchLocalLibrary } from './cloudLibraryModel';
import { patchCloudBooks, projectStoredLibrary } from './cloudLibraryRepository';
import { cloudSessionEpoch } from './cloudOwnerSession';

const COVER_CONCURRENCY = 20;

export async function loadLocalLibraryBooks(fs: FileSystem): Promise<Book[]> {
  return safeLoadJSON<Book[]>(fs, getLibraryFilename(), 'Books', []);
}

async function processInBatches<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  for (let i = 0; i < items.length; i += concurrency) {
    await Promise.all(items.slice(i, i + concurrency).map(fn));
  }
}

export async function loadLibraryBooks(
  fs: FileSystem,
  generateCoverImageUrl: (book: Book) => Promise<string>,
): Promise<Book[]> {
  if (!(await fs.exists('', 'Books'))) {
    await fs.createDir('', 'Books', true);
  }

  const local = await loadLocalLibraryBooks(fs);
  const epoch = cloudSessionEpoch();
  const books = await projectStoredLibrary(fs, local);

  const covers = new Set<string>();
  let failed = false;
  try {
    await processInBatches(books, COVER_CONCURRENCY, async (book) => {
      const url = await generateCoverImageUrl(book);
      if (failed || epoch !== cloudSessionEpoch()) {
        if (url.startsWith('blob:')) URL.revokeObjectURL(url);
        throw new DOMException('Cloud library account changed', 'AbortError');
      }
      if (url.startsWith('blob:')) covers.add(url);
      book.coverImageUrl = url;
      book.updatedAt ??= book.lastUpdated || Date.now();
    });
    if (epoch !== cloudSessionEpoch())
      throw new DOMException('Cloud library account changed', 'AbortError');
  } catch (error) {
    failed = true;
    for (const url of covers) URL.revokeObjectURL(url);
    throw error;
  }
  return books;
}

export async function saveLibraryBooks(
  fs: FileSystem,
  books: Book[],
  guard?: () => void,
): Promise<void> {
  guard?.();
  // A displayed cloud projection is never the replacement for the local backing file.
  await patchCloudBooks(fs, books, guard);
  guard?.();
  const local = books.filter((book) => book.libraryOrigin?.kind !== 'cloud');
  if (!local.length) return;
  if (fs.updateTextFile) {
    await fs.updateTextFile(getLibraryFilename(), 'Books', (text) => {
      guard?.();
      return JSON.stringify(patchLocalLibrary(text ? (JSON.parse(text) as Book[]) : [], local));
    });
  } else {
    // Native/CLI retain local-only persistence; cloud UI requires transactional web storage.
    const previous = await safeLoadJSON<Book[]>(fs, getLibraryFilename(), 'Books', []);
    guard?.();
    await safeSaveJSON(fs, getLibraryFilename(), 'Books', patchLocalLibrary(previous, local));
  }
}
