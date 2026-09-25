import type { Book } from '../types/book.ts';
import type { FileSystem } from '../types/system.ts';
import {
  assertCloudLease,
  captureCloudLease,
  cloudSessionEpoch,
  hasCloudSession,
  subscribeCloudSession,
  type CloudLease,
} from './cloudOwnerSession.ts';
import {
  cloudLibraryPath,
  parseCloudLibrary,
  projectLibrary,
  sanitizeCloudBook,
  type CloudLibrary,
} from './cloudLibraryModel.ts';

type LibraryIO = Pick<FileSystem, 'readFile' | 'exists' | 'updateTextFile'>;
const selectedCloudCopies = new Set<string>();
subscribeCloudSession(() => selectedCloudCopies.clear());

export function selectCloudCopy(hash: string, selected: boolean): void {
  if (selected) selectedCloudCopies.add(hash);
  else selectedCloudCopies.delete(hash);
}

export async function readCloudLibrary(io: LibraryIO, lease: CloudLease): Promise<CloudLibrary> {
  assertCloudLease(lease);
  const path = cloudLibraryPath(lease.ownerKey);
  const text = (await io.exists(path, 'Books')) ? await io.readFile(path, 'Books', 'text') : null;
  assertCloudLease(lease);
  if (text !== null && typeof text !== 'string') throw new Error('Invalid cloud library file');
  return parseCloudLibrary(text, lease.ownerKey);
}

export async function updateCloudLibrary(
  io: LibraryIO,
  lease: CloudLease,
  update: (library: CloudLibrary) => CloudLibrary,
): Promise<CloudLibrary> {
  assertCloudLease(lease);
  if (!io.updateTextFile) throw new Error('Cloud library persistence is unavailable');
  let result: CloudLibrary | undefined;
  await io.updateTextFile(cloudLibraryPath(lease.ownerKey), 'Books', (text) => {
    assertCloudLease(lease);
    const previous = parseCloudLibrary(text, lease.ownerKey);
    const before = JSON.stringify(previous);
    result = update(previous);
    if (JSON.stringify(result) !== before) result.revision += 1;
    return JSON.stringify(result);
  });
  assertCloudLease(lease);
  return result!;
}

export async function patchCloudBooks(
  io: LibraryIO,
  books: Book[],
  guard?: () => void,
): Promise<void> {
  guard?.();
  const patches = books.filter((book) => book.libraryOrigin?.kind === 'cloud');
  if (!patches.length) return;
  const lease = await captureCloudLease();
  if (
    patches.some(
      (book) =>
        book.libraryOrigin?.kind !== 'cloud' ||
        book.libraryOrigin.ownerKey !== lease.ownerKey ||
        book.libraryOrigin.epoch !== lease.epoch,
    )
  ) {
    throw new DOMException('Cloud library account changed', 'AbortError');
  }
  await updateCloudLibrary(io, lease, (library) => {
    guard?.();
    for (const book of patches) {
      const old = library.entries[book.hash];
      if (
        !old ||
        old.state === 'delete_pending' ||
        old.state === 'tombstoned' ||
        old.book.updatedAt > book.updatedAt
      )
        continue;
      const persistent = sanitizeCloudBook(book);
      if (JSON.stringify(persistent) === JSON.stringify(sanitizeCloudBook(old.book))) continue;
      library.entries[book.hash] = {
        ...old,
        book: persistent,
        revision: old.revision + 1,
        state: old.state === 'ready' ? 'metadata_pending' : old.state,
      };
    }
    return library;
  });
}

export async function projectStoredLibrary(io: LibraryIO, local: Book[]): Promise<Book[]> {
  const capturedEpoch = cloudSessionEpoch();
  const lease = hasCloudSession() ? await captureCloudLease() : null;
  const cloud = lease ? await readCloudLibrary(io, lease) : null;
  if (capturedEpoch !== cloudSessionEpoch())
    throw new DOMException('Cloud library account changed', 'AbortError');
  return projectLibrary(local, cloud, selectedCloudCopies, capturedEpoch);
}
