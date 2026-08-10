import type { Book, BookFormat, MarketplaceScenePackSummary } from '@/types/book';
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
const MARKETPLACE_LOCAL_HASH_PREFIX = 'sbm2';
const MARKETPLACE_LOCAL_HASH = /^sbm2([0-9a-f]{32})[0-9a-f]{32}$/i;
const LEGACY_ENTITLEMENT_LOCAL_HASH = /^[0-9a-f]{32}$/i;
const SHARED_MARKETPLACE_SOURCE_KEY = /^[0-9a-f]{64}$/i;

type OwnedLibraryItem = StoryBoredOwnedLibrary['libraryItems'][number] & {
  scenePack?: MarketplaceScenePackSummary;
};

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

function getMarketplaceOwnerHash(userId: string): string {
  return md5(`storybored-marketplace-owner:${userId}`);
}

function getMarketplaceLocalBookHash(userId: string, libraryItemId: string): string {
  return `${MARKETPLACE_LOCAL_HASH_PREFIX}${getMarketplaceOwnerHash(userId)}${md5(
    `storybored-marketplace:${libraryItemId}`,
  )}`;
}

function getLegacyMarketplaceLocalBookHash(libraryItemId: string): string {
  return md5(`storybored-marketplace:${libraryItemId}`);
}

function isMarketplaceLocalBookHash(hash: string): boolean {
  return MARKETPLACE_LOCAL_HASH.test(hash);
}

function marketplaceOwnerHashFromLocalHash(hash: string): string | undefined {
  return MARKETPLACE_LOCAL_HASH.exec(hash)?.[1]?.toLowerCase();
}

export function canOpenStoryBoredMarketplaceBook(book: Book, userId?: string | null): boolean {
  if (book.deletedAt) return false;
  if (book.marketplaceOwnerMismatchQuarantined) return false;
  const currentOwnerHash = userId ? getMarketplaceOwnerHash(userId) : undefined;
  const hashOwner = marketplaceOwnerHashFromLocalHash(book.hash);
  if (hashOwner) {
    return (
      hashOwner === currentOwnerHash &&
      (!book.marketplace || book.marketplace.entitlementStatus === 'active')
    );
  }
  if (book.marketplace) {
    return (
      book.marketplace.ownerUserHash === currentOwnerHash &&
      book.marketplace.entitlementStatus === 'active'
    );
  }

  // Step 1-12 entitlement-local hashes are indistinguishable from an ordinary
  // MD5 while offline. Keep the row and bytes intact, but require an online
  // entitlement match (or moving a personal book out of the reserved group)
  // before opening it.
  return !(
    book.groupName === MARKETPLACE_GROUP_NAME && LEGACY_ENTITLEMENT_LOCAL_HASH.test(book.hash)
  );
}

export function quarantineStoryBoredMarketplaceLibraryForUser(
  library: Book[],
  userId: string,
): Book[] {
  const ownerHash = getMarketplaceOwnerHash(userId);
  let changed = false;
  const next = library.map((book) => {
    const hashOwner = marketplaceOwnerHashFromLocalHash(book.hash);
    const metadataOwner = book.marketplace?.ownerUserHash;
    if (!hashOwner && !book.marketplace) return book;
    if (hashOwner === ownerHash || metadataOwner === ownerHash) {
      if (!book.marketplaceOwnerMismatchQuarantined) return book;
      changed = true;
      return {
        ...book,
        deletedAt: null,
        marketplaceOwnerMismatchQuarantined: undefined,
      };
    }

    changed = true;
    return {
      ...book,
      deletedAt: book.deletedAt ?? Date.now(),
      marketplaceOwnerMismatchQuarantined: true,
    };
  });
  return changed ? next : library;
}

function matchesMarketplaceBook(
  book: Book,
  item: OwnedLibraryItem,
  entitlementLocalHash: string,
): boolean {
  // A deleted legacy key is a cloud tombstone, not an ownership candidate.
  // Exact owner-marked hashes are selected separately and may be reactivated.
  if (book.deletedAt) return false;
  if (book.marketplace?.libraryItemId === item.libraryItemId) return true;

  // `book_hash` and `group_name` survive Readest's cloud transform even though
  // the nested marketplace metadata does not. The entitlement-derived hash is
  // account-specific, so restoring by it cannot merge two owners of one source.
  if (
    !book.marketplace &&
    (book.hash === entitlementLocalHash ||
      book.hash === getLegacyMarketplaceLocalBookHash(item.libraryItemId))
  ) {
    return true;
  }

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

function toMarketplaceScenePackSummary(
  item: OwnedLibraryItem,
): MarketplaceScenePackSummary | undefined {
  const scenePack = item.scenePack;
  if (!item.hasScenePack || item.entitlementStatus !== 'active' || !scenePack) {
    return undefined;
  }

  // Keep this an explicit allowlist: full packs contain expiring signed image
  // URLs, and admin responses may contain private storage keys.
  return {
    id: scenePack.id,
    version: scenePack.version,
    ...(scenePack.label === undefined ? {} : { label: scenePack.label }),
    sceneCount: scenePack.sceneCount,
  };
}

function toMarketplaceBook(item: OwnedLibraryItem, userId: string): Book {
  const now = Date.now();
  const scenePack = toMarketplaceScenePackSummary(item);

  return {
    hash: getMarketplaceLocalBookHash(userId, item.libraryItemId),
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
      ownerUserHash: getMarketplaceOwnerHash(userId),
      listingId: item.listingId,
      sourceKey: item.bookId,
      grantedByListingId: item.grantedByListingId,
      slug: item.slug,
      entitlementStatus: item.entitlementStatus,
      offlineCachedAt: null,
      hasScenePack: item.hasScenePack,
      ...(scenePack ? { scenePack } : {}),
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
  userId: string;
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
  const ownedItems: OwnedLibraryItem[] = owned.libraryItems;
  const activeOwnedItems = ownedItems.filter((item) => item.entitlementStatus === 'active');
  const activeLibraryItemIds = new Set(activeOwnedItems.map((item) => item.libraryItemId));
  const localBookHashesToPurge = new Set<string>();
  let changed = false;

  for (const item of activeOwnedItems) {
    const marketplaceBook = toMarketplaceBook(item, input.userId);
    const activeExactIdx = nextLibrary.findIndex(
      (book) => book.hash === marketplaceBook.hash && !book.deletedAt,
    );
    const exactIdx =
      activeExactIdx >= 0
        ? activeExactIdx
        : nextLibrary.findIndex((book) => book.hash === marketplaceBook.hash);
    const idx =
      exactIdx >= 0
        ? exactIdx
        : nextLibrary.findIndex((book) => matchesMarketplaceBook(book, item, marketplaceBook.hash));

    if (idx === -1) {
      nextLibrary.unshift(marketplaceBook);
      changed = true;
    } else {
      const existing = nextLibrary[idx]!;
      const rekeyed = existing.hash !== marketplaceBook.hash;
      const migratedAt = Date.now();
      if (rekeyed) {
        localBookHashesToPurge.add(existing.hash);
      }
      nextLibrary[idx] = {
        ...existing,
        hash: marketplaceBook.hash,
        title: existing.title || marketplaceBook.title,
        author: existing.author || marketplaceBook.author,
        coverImageUrl: existing.coverImageUrl || marketplaceBook.coverImageUrl,
        deletedAt: null,
        downloadedAt: rekeyed ? null : existing.downloadedAt,
        uploadedAt: existing.uploadedAt ?? marketplaceBook.uploadedAt,
        syncedAt: Date.now(),
        marketplace: {
          ...marketplaceBook.marketplace!,
          offlineCachedAt: rekeyed ? null : (existing.marketplace?.offlineCachedAt ?? null),
          contentUrlExpiresAt: rekeyed ? null : (existing.marketplace?.contentUrlExpiresAt ?? null),
        },
        exportAllowed: false,
      };
      if (rekeyed) {
        // Cloud books are upserted by `book_hash`; replacing the hash in place
        // would leave the old cloud row active forever. Persist the old key as a
        // separate tombstone alongside the new owner-bound row.
        nextLibrary.push({
          ...existing,
          updatedAt: migratedAt,
          deletedAt: migratedAt,
          downloadedAt: null,
          coverDownloadedAt: null,
          marketplace: undefined,
          marketplaceOwnerMismatchQuarantined: undefined,
          exportAllowed: false,
        });
      }
      changed = true;
    }
  }

  for (let index = 0; index < nextLibrary.length; index += 1) {
    const book = nextLibrary[index]!;
    const marketplace = book.marketplace;
    if (!marketplace && isMarketplaceLocalBookHash(book.hash)) {
      // The entitlement-derived marker survives Readest's cloud transform and
      // can safely authorize deletion when the nested metadata was stripped.
      localBookHashesToPurge.add(book.hash);
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

    localBookHashesToPurge.add(book.hash);
    const { scenePack: _revokedScenePack, ...retainedMarketplace } = marketplace;
    nextLibrary[index] = {
      ...book,
      deletedAt: book.deletedAt ?? Date.now(),
      downloadedAt: null,
      marketplace: {
        ...retainedMarketplace,
        entitlementStatus: 'revoked',
        offlineCachedAt: null,
        contentUrlExpiresAt: null,
        hasScenePack: false,
      },
    };
    changed = true;
  }

  if ((!changed && localBookHashesToPurge.size === 0) || !isCurrentSync()) {
    return input.library;
  }

  const appService = await input.envConfig.getAppService();
  if (!isCurrentSync()) return input.library;

  const persisted = await enqueueMarketplacePersistence(async () => {
    if (!isCurrentSync()) return false;

    const restoreCurrentLibrary = async () => {
      const currentLibrary = input.getCurrentLibrary?.() ?? input.library;
      await appService.saveLibraryBooks(currentLibrary);
      return false;
    };

    await appService.saveLibraryBooks(nextLibrary);
    if (!isCurrentSync()) {
      return restoreCurrentLibrary();
    }

    for (const bookHash of localBookHashesToPurge) {
      if (!isCurrentSync()) return restoreCurrentLibrary();
      const exists = await appService.exists(bookHash, 'Books');
      if (!isCurrentSync()) {
        return restoreCurrentLibrary();
      }
      if (exists) {
        await appService.deleteDir(bookHash, 'Books', true);
        if (!isCurrentSync()) {
          return restoreCurrentLibrary();
        }
      }
    }

    return true;
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
