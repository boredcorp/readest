import type { Book } from '../types/book.ts';

export type LibraryOrigin = { kind: 'local' } | { kind: 'cloud'; ownerKey: string; epoch: number };
export function sameLibraryOrigin(a: Book, b: Book): boolean {
  const left = a.libraryOrigin;
  const right = b.libraryOrigin;
  return (
    a.hash === b.hash &&
    (left?.kind ?? 'local') === (right?.kind ?? 'local') &&
    (left?.kind !== 'cloud' ||
      (right?.kind === 'cloud' && left.ownerKey === right.ownerKey && left.epoch === right.epoch))
  );
}
export type CloudOperation =
  'ready' | 'upload_pending' | 'metadata_pending' | 'delete_pending' | 'tombstoned';
export interface CloudEntry {
  book: Book;
  state: CloudOperation;
  revision: number;
  operationId?: string;
  bookUploaded?: boolean;
  coverUploaded?: boolean;
  bookDeleted?: boolean;
  coverDeleted?: boolean;
  deleteKeys?: string[];
  deletedKeys?: string[];
}
export interface CloudLibrary {
  schemaVersion: 1;
  ownerKey: string;
  revision: number;
  booksCursor: number;
  entries: Record<string, CloudEntry>;
}

export function cloudLibraryPath(ownerKey: string): string {
  if (!/^[a-f0-9]{64}$/.test(ownerKey)) throw new Error('Invalid cloud owner');
  return `cloud/v1/${ownerKey}/library.json`;
}

export const emptyCloudLibrary = (ownerKey: string): CloudLibrary => {
  cloudLibraryPath(ownerKey);
  return { schemaVersion: 1, ownerKey, revision: 0, booksCursor: 0, entries: {} };
};

export function isOrdinaryCloudBook(book: Book): boolean {
  return (
    /^[a-f0-9]{32}$/i.test(book.hash) &&
    book.hash !== '00000000000000000000000000000000' &&
    !book.marketplace &&
    !book.marketplaceOwnerMismatchQuarantined &&
    book.groupName !== 'StoryBored Marketplace' &&
    book.exportAllowed !== false
  );
}

export function isLegacyUnownedCloudBook(book: Book): boolean {
  return (
    isOrdinaryCloudBook(book) && !book.libraryOrigin && Boolean(book.uploadedAt || book.syncedAt)
  );
}

/** Explicit allowlist; transfer URLs, file paths and auth/session state never reach the sidecar. */
export function sanitizeCloudBook(book: Book): Book {
  if (!isOrdinaryCloudBook(book))
    throw new Error('This book cannot use the ordinary cloud library');
  const metadata = book.metadata
    ? {
        title: book.metadata.title,
        author: book.metadata.author,
        language: book.metadata.language,
        editor: book.metadata.editor,
        publisher: book.metadata.publisher,
        published: book.metadata.published,
        description: book.metadata.description,
        subject: book.metadata.subject,
        identifier: book.metadata.identifier,
        isbn: book.metadata.isbn,
        altIdentifier: book.metadata.altIdentifier,
        belongsTo: book.metadata.belongsTo,
        subtitle: book.metadata.subtitle,
        series: book.metadata.series,
        seriesIndex: book.metadata.seriesIndex,
        seriesTotal: book.metadata.seriesTotal,
      }
    : undefined;
  return {
    hash: book.hash,
    format: book.format,
    title: book.title,
    sourceTitle: book.sourceTitle,
    author: book.author,
    metaHash: book.metaHash,
    groupId: book.groupId,
    groupName: book.groupName,
    tags: book.tags,
    createdAt: book.createdAt,
    updatedAt: book.updatedAt,
    deletedAt: book.deletedAt,
    uploadedAt: book.uploadedAt,
    downloadedAt: book.downloadedAt,
    coverDownloadedAt: book.coverDownloadedAt,
    syncedAt: book.syncedAt,
    progress: book.progress,
    readingStatus: book.readingStatus,
    primaryLanguage: book.primaryLanguage,
    metadata,
  };
}

export function parseCloudLibrary(text: string | null, owner: string): CloudLibrary {
  if (text === null) return emptyCloudLibrary(owner);
  const value = JSON.parse(text) as CloudLibrary;
  if (
    value.schemaVersion !== 1 ||
    value.ownerKey !== owner ||
    !Number.isSafeInteger(value.revision) ||
    !Number.isFinite(value.booksCursor) ||
    !value.entries ||
    typeof value.entries !== 'object' ||
    Array.isArray(value.entries)
  ) {
    throw new Error('Invalid cloud library');
  }
  for (const [hash, entry] of Object.entries(value.entries)) {
    if (
      !entry ||
      entry.book?.hash !== hash ||
      !isOrdinaryCloudBook(entry.book) ||
      !['ready', 'upload_pending', 'metadata_pending', 'delete_pending', 'tombstoned'].includes(
        entry.state,
      )
    ) {
      throw new Error('Invalid cloud library entry');
    }
    entry.book = sanitizeCloudBook(entry.book);
  }
  return value;
}

export function projectLibrary(
  local: Book[],
  cloud: CloudLibrary | null,
  selected = new Set<string>(),
  epoch = 0,
): Book[] {
  const rows = new Map(
    local
      .filter((book) => !isLegacyUnownedCloudBook(book))
      .map((book) => [
        book.hash,
        {
          ...book,
          libraryOrigin: { kind: 'local' } as LibraryOrigin,
        },
      ]),
  );
  if (cloud)
    for (const entry of Object.values(cloud.entries)) {
      if (
        (entry.book.deletedAt && entry.state !== 'delete_pending') ||
        entry.state === 'tombstoned' ||
        entry.state === 'upload_pending'
      )
        continue;
      if (
        !rows.has(entry.book.hash) ||
        rows.get(entry.book.hash)?.deletedAt ||
        selected.has(entry.book.hash)
      ) {
        rows.set(entry.book.hash, {
          ...entry.book,
          deletedAt: entry.state === 'delete_pending' ? null : entry.book.deletedAt,
          cloudOperation: entry.state,
          libraryOrigin: { kind: 'cloud', ownerKey: cloud.ownerKey, epoch },
        });
      }
    }
  return [...rows.values()];
}

export function patchLocalLibrary(previous: Book[], patches: Book[]): Book[] {
  const rows = new Map(previous.map((book) => [book.hash, book]));
  for (const book of patches) {
    if (book.libraryOrigin?.kind === 'cloud' || isLegacyUnownedCloudBook(book)) continue;
    const {
      libraryOrigin: _origin,
      cloudOperation: _operation,
      coverImageUrl: _cover,
      ...persistent
    } = book;
    const old = rows.get(book.hash);
    if (!old || (persistent.updatedAt ?? 0) >= (old.updatedAt ?? 0))
      rows.set(book.hash, persistent);
  }
  return [...rows.values()];
}

export function mergeCloudPull(
  previous: CloudLibrary,
  books: Book[],
  cursor: number,
): CloudLibrary {
  const entries = { ...previous.entries };
  for (const book of books) {
    if (!isOrdinaryCloudBook(book) || (!book.uploadedAt && !book.deletedAt)) continue;
    const old = entries[book.hash];
    if (
      old &&
      old.state !== 'ready' &&
      !(old.state === 'tombstoned' && (book.deletedAt || book.updatedAt > old.book.updatedAt))
    )
      continue;
    if (old && old.book.updatedAt > book.updatedAt) continue;
    entries[book.hash] = {
      book: sanitizeCloudBook({
        ...book,
        downloadedAt: old?.book.downloadedAt,
        coverDownloadedAt: old?.book.coverDownloadedAt,
      }),
      state: book.deletedAt ? 'tombstoned' : 'ready',
      revision: (old?.revision ?? 0) + 1,
    };
  }
  return {
    ...previous,
    entries,
    revision: previous.revision + 1,
    booksCursor: Math.max(previous.booksCursor, cursor),
  };
}
