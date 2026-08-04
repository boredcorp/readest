import type { Book, BookFormat } from '@/types/book';
import type { EnvConfigType } from '@/services/environment';
import { INIT_BOOK_CONFIG, getLocalBookFilename } from '@/utils/book';
import { md5 } from '@/utils/md5';
import { createStoryBoredReaderClient, isStoryBoredReaderEnabled } from './client';
import type { StoryBoredOwnedLibrary } from './types';

const SUPPORTED_MARKETPLACE_FORMATS = new Set<BookFormat>([
  'EPUB',
  'PDF',
  'MOBI',
  'AZW',
  'AZW3',
  'CBZ',
  'FB2',
  'FBZ',
  'TXT',
  'MD',
]);
const MARKETPLACE_GROUP_NAME = 'StoryBored Marketplace';
const SHARED_MARKETPLACE_SOURCE_KEY = /^[0-9a-f]{64}$/i;

let marketplaceSyncVersion = 0;
let marketplacePersistenceQueue: Promise<void> = Promise.resolve();

function enqueueMarketplacePersistence<T>(persist: () => Promise<T>): Promise<T> {
  const result = marketplacePersistenceQueue.then(persist, persist);
  marketplacePersistenceQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function toBookFormat(format: string): BookFormat {
  const normalized = format.toUpperCase() as BookFormat;
  return SUPPORTED_MARKETPLACE_FORMATS.has(normalized) ? normalized : 'EPUB';
}

function getMarketplaceLocalBookHash(libraryItemId: string): string {
  return md5(`storybored-marketplace:${libraryItemId}`);
}

function matchesMarketplaceBook(
  book: Book,
  item: StoryBoredOwnedLibrary['libraryItems'][number],
  entitlementLocalHash: string,
): boolean {
  if (book.marketplace?.libraryItemId === item.libraryItemId) return true;

  // `book_hash` and `group_name` survive Readest's cloud transform even though
  // the nested marketplace metadata does not. The entitlement-derived hash is
  // account-specific, so restoring by it cannot merge two owners of one source.
  if (!book.marketplace && book.hash === entitlementLocalHash) return true;

  // Before user-scoped source keys, marketplace books used the API book ID as
  // their local hash. Only recover those marked legacy rows. Current shared
  // SHA-256 source keys must never be used as local cross-account identity.
  return (
    !book.marketplace &&
    book.groupName === MARKETPLACE_GROUP_NAME &&
    !SHARED_MARKETPLACE_SOURCE_KEY.test(item.bookId) &&
    book.hash === item.bookId
  );
}

function toMarketplaceBook(item: StoryBoredOwnedLibrary['libraryItems'][number]): Book {
  const now = Date.now();

  return {
    hash: getMarketplaceLocalBookHash(item.libraryItemId),
    format: toBookFormat(item.format),
    title: item.title,
    sourceTitle: item.title,
    author: item.author ?? '',
    primaryLanguage: item.language ?? 'en',
    coverImageUrl: item.coverImageUrl,
    createdAt: new Date(item.acquiredAt).getTime() || now,
    updatedAt: now,
    deletedAt: null,
    uploadedAt: now,
    downloadedAt: null,
    coverDownloadedAt: item.coverImageUrl ? now : null,
    syncedAt: now,
    groupName: MARKETPLACE_GROUP_NAME,
    marketplace: {
      libraryItemId: item.libraryItemId,
      listingId: item.listingId,
      sourceKey: item.bookId,
      grantedByListingId: item.grantedByListingId,
      slug: item.slug,
      entitlementStatus: item.entitlementStatus,
      offlineCachedAt: null,
      hasScenePack: item.hasScenePack,
    },
    exportAllowed: item.exportAllowed,
  };
}

function assertCurrentMarketplaceCache(input: {
  token?: string | null;
  signal?: AbortSignal;
  isCurrentSession?: () => boolean;
}): asserts input is {
  token: string;
  signal?: AbortSignal;
  isCurrentSession?: () => boolean;
} {
  if (!input.token || input.signal?.aborted || input.isCurrentSession?.() === false) {
    throw new Error('StoryBored marketplace cache was cancelled.');
  }
}

export async function syncStoryBoredMarketplaceLibrary(input: {
  envConfig: EnvConfigType;
  token?: string | null;
  library: Book[];
  getCurrentLibrary?: () => Book[];
  signal?: AbortSignal;
}): Promise<Book[]> {
  const syncVersion = ++marketplaceSyncVersion;
  const isCurrentSync = () => marketplaceSyncVersion === syncVersion && !input.signal?.aborted;

  if (!isStoryBoredReaderEnabled() || !input.token || !isCurrentSync()) {
    return input.library;
  }

  const client = createStoryBoredReaderClient({ accessToken: input.token });
  const owned = await client.listOwnedLibrary();
  if (!isCurrentSync()) return input.library;

  const nextLibrary = [...input.library];
  const activeLibraryItemIds = new Set(owned.libraryItems.map((item) => item.libraryItemId));
  let changed = false;

  for (const item of owned.libraryItems) {
    const marketplaceBook = toMarketplaceBook(item);
    const idx = nextLibrary.findIndex((book) =>
      matchesMarketplaceBook(book, item, marketplaceBook.hash),
    );

    if (idx === -1) {
      nextLibrary.unshift(marketplaceBook);
      changed = true;
    } else {
      const existing = nextLibrary[idx]!;
      nextLibrary[idx] = {
        ...existing,
        title: existing.title || marketplaceBook.title,
        author: existing.author || marketplaceBook.author,
        coverImageUrl: existing.coverImageUrl || marketplaceBook.coverImageUrl,
        deletedAt: null,
        uploadedAt: existing.uploadedAt ?? marketplaceBook.uploadedAt,
        syncedAt: Date.now(),
        marketplace: {
          ...marketplaceBook.marketplace!,
          offlineCachedAt: existing.marketplace?.offlineCachedAt ?? null,
          contentUrlExpiresAt: existing.marketplace?.contentUrlExpiresAt ?? null,
        },
        exportAllowed: false,
      };
      changed = true;
    }
  }

  for (let index = 0; index < nextLibrary.length; index += 1) {
    const book = nextLibrary[index]!;
    const marketplace = book.marketplace;
    if (!marketplace && book.groupName === MARKETPLACE_GROUP_NAME) {
      const quarantinedAt = book.deletedAt ?? Date.now();
      if (
        book.deletedAt !== quarantinedAt ||
        book.downloadedAt !== null ||
        book.exportAllowed !== false
      ) {
        nextLibrary[index] = {
          ...book,
          deletedAt: quarantinedAt,
          downloadedAt: null,
          exportAllowed: false,
        };
        changed = true;
      }
      continue;
    }

    if (!marketplace || activeLibraryItemIds.has(marketplace.libraryItemId)) {
      continue;
    }

    nextLibrary[index] = {
      ...book,
      deletedAt: book.deletedAt ?? Date.now(),
      downloadedAt: null,
      marketplace: {
        ...marketplace,
        entitlementStatus: 'revoked',
        offlineCachedAt: null,
        contentUrlExpiresAt: null,
      },
    };
    changed = true;
  }

  if (!changed || !isCurrentSync()) {
    return input.library;
  }

  const appService = await input.envConfig.getAppService();
  if (!isCurrentSync()) return input.library;

  const persisted = await enqueueMarketplacePersistence(async () => {
    if (!isCurrentSync()) return false;

    await appService.saveLibraryBooks(nextLibrary);
    if (isCurrentSync()) return true;

    const currentLibrary = input.getCurrentLibrary?.() ?? input.library;
    await appService.saveLibraryBooks(currentLibrary);
    return false;
  });

  return persisted ? nextLibrary : input.library;
}

export async function cacheStoryBoredMarketplaceBook(input: {
  envConfig: EnvConfigType;
  token?: string | null;
  book: Book;
  signal?: AbortSignal;
  isCurrentSession?: () => boolean;
}): Promise<Book> {
  const marketplace = input.book.marketplace;
  if (!marketplace?.libraryItemId) {
    return input.book;
  }

  assertCurrentMarketplaceCache(input);
  const { libraryItemId } = marketplace;
  const client = createStoryBoredReaderClient({ accessToken: input.token });
  const content = await client.getOwnedLibraryContent(libraryItemId);
  assertCurrentMarketplaceCache(input);
  const response = await fetch(content.contentUrl, input.signal ? { signal: input.signal } : {});
  assertCurrentMarketplaceCache(input);

  if (!response.ok) {
    throw new Error(`Marketplace content download failed with status ${response.status}`);
  }

  const appService = await input.envConfig.getAppService();
  assertCurrentMarketplaceCache(input);
  const bookDirectoryExists = await appService.exists(input.book.hash, 'Books');
  assertCurrentMarketplaceCache(input);
  if (!bookDirectoryExists) {
    assertCurrentMarketplaceCache(input);
    await appService.createDir(input.book.hash, 'Books', true);
    assertCurrentMarketplaceCache(input);
  }
  const contentBuffer = await response.arrayBuffer();
  assertCurrentMarketplaceCache(input);
  await appService.writeFile(getLocalBookFilename(input.book), 'Books', contentBuffer);
  assertCurrentMarketplaceCache(input);
  await appService.saveBookConfig(input.book, {
    ...INIT_BOOK_CONFIG,
    bookHash: input.book.hash,
    updatedAt: Date.now(),
  });
  assertCurrentMarketplaceCache(input);

  return {
    ...input.book,
    url: content.contentUrl,
    downloadedAt: Date.now(),
    updatedAt: Date.now(),
    marketplace: {
      ...marketplace,
      libraryItemId,
      offlineCachedAt: Date.now(),
      contentUrlExpiresAt: new Date(content.expiresAt).getTime(),
    },
  };
}
