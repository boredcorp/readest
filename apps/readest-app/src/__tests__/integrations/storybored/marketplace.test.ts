import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EnvConfigType } from '@/services/environment';
import type { Book } from '@/types/book';
import { isMd5 } from '@/utils/md5';

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

const storyBoredMocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getOwnedLibraryContent: vi.fn(),
  listOwnedLibrary: vi.fn(),
}));

vi.mock('@/integrations/storybored/client', () => ({
  isStoryBoredReaderEnabled: () => true,
  createStoryBoredReaderClient: (options: unknown) => {
    storyBoredMocks.createClient(options);
    return {
      getOwnedLibraryContent: storyBoredMocks.getOwnedLibraryContent,
      listOwnedLibrary: storyBoredMocks.listOwnedLibrary,
    };
  },
}));

import {
  cacheStoryBoredMarketplaceBook,
  syncStoryBoredMarketplaceLibrary,
} from '@/integrations/storybored/marketplace';

const envConfig: EnvConfigType = {
  getAppService: async () => {
    throw new Error('The app service should not be needed for an unchanged library.');
  },
};

describe('StoryBored marketplace library authentication', () => {
  beforeEach(() => {
    storyBoredMocks.createClient.mockReset();
    storyBoredMocks.getOwnedLibraryContent.mockReset();
    storyBoredMocks.listOwnedLibrary.mockReset().mockResolvedValue({ libraryItems: [] });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('waits to contact the protected library endpoint until the auth session has a token', async () => {
    const library: Book[] = [];

    const result = await syncStoryBoredMarketplaceLibrary({
      envConfig,
      token: null,
      library,
    });

    expect(result).toBe(library);
    expect(storyBoredMocks.createClient).not.toHaveBeenCalled();
    expect(storyBoredMocks.listOwnedLibrary).not.toHaveBeenCalled();
  });

  it('uses the current restored token when the authenticated library sync runs', async () => {
    await syncStoryBoredMarketplaceLibrary({
      envConfig,
      token: 'restored-reader-token',
      library: [],
    });

    expect(storyBoredMocks.createClient).toHaveBeenCalledWith({
      accessToken: 'restored-reader-token',
    });
    expect(storyBoredMocks.listOwnedLibrary).toHaveBeenCalledOnce();
  });

  it('does not persist a response after its session is cancelled', async () => {
    let resolveOwnedLibrary:
      ((value: { libraryItems: Array<Record<string, unknown>> }) => void) | undefined;
    storyBoredMocks.listOwnedLibrary.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveOwnedLibrary = resolve;
        }),
    );
    const saveLibraryBooks = vi.fn();
    const cancellableEnvConfig = {
      getAppService: async () => ({ saveLibraryBooks }),
    } as unknown as EnvConfigType;
    const controller = new AbortController();
    const library: Book[] = [];

    const sync = syncStoryBoredMarketplaceLibrary({
      envConfig: cancellableEnvConfig,
      token: 'account-a-token',
      library,
      signal: controller.signal,
    });
    controller.abort();
    resolveOwnedLibrary?.({
      libraryItems: [
        {
          acquiredAt: '2026-08-03T00:00:00.000Z',
          author: 'StoryBored',
          bookId: 'book-account-a',
          coverImageUrl: null,
          entitlementStatus: 'active',
          exportAllowed: false,
          format: 'EPUB',
          grantedByListingId: 'listing-account-a',
          hasScenePack: false,
          language: 'en',
          libraryItemId: 'library-account-a',
          listingId: 'listing-account-a',
          offlineCacheAllowed: true,
          slug: 'account-a-book',
          title: 'Account A Book',
        },
      ],
    });

    await expect(sync).resolves.toBe(library);
    expect(saveLibraryBooks).not.toHaveBeenCalled();
  });

  it('rechecks cancellation after resolving the app service and before persistence', async () => {
    storyBoredMocks.listOwnedLibrary.mockResolvedValue({
      libraryItems: [
        {
          acquiredAt: '2026-08-03T00:00:00.000Z',
          author: 'StoryBored',
          bookId: 'book-account-a',
          coverImageUrl: null,
          entitlementStatus: 'active',
          exportAllowed: false,
          format: 'EPUB',
          grantedByListingId: 'listing-account-a',
          hasScenePack: false,
          language: 'en',
          libraryItemId: 'library-account-a',
          listingId: 'listing-account-a',
          offlineCacheAllowed: true,
          slug: 'account-a-book',
          title: 'Account A Book',
        },
      ],
    });
    type AppService = Awaited<ReturnType<EnvConfigType['getAppService']>>;
    const appService = deferred<AppService>();
    const saveLibraryBooks = vi.fn();
    const cancellableEnvConfig: EnvConfigType = {
      getAppService: vi.fn(() => appService.promise),
    };
    const controller = new AbortController();
    const library: Book[] = [];

    const sync = syncStoryBoredMarketplaceLibrary({
      envConfig: cancellableEnvConfig,
      token: 'account-a-token',
      library,
      signal: controller.signal,
    });
    await vi.waitFor(() => {
      expect(cancellableEnvConfig.getAppService).toHaveBeenCalledOnce();
    });
    controller.abort();
    appService.resolve({ saveLibraryBooks } as unknown as AppService);

    await expect(sync).resolves.toBe(library);
    expect(saveLibraryBooks).not.toHaveBeenCalled();
  });

  it('repairs the durable library when logout aborts a save already in progress', async () => {
    storyBoredMocks.listOwnedLibrary.mockResolvedValue({
      libraryItems: [
        {
          acquiredAt: '2026-08-03T00:00:00.000Z',
          author: 'StoryBored',
          bookId: 'book-account-a',
          coverImageUrl: null,
          entitlementStatus: 'active',
          exportAllowed: false,
          format: 'EPUB',
          grantedByListingId: 'listing-account-a',
          hasScenePack: false,
          language: 'en',
          libraryItemId: 'library-account-a',
          listingId: 'listing-account-a',
          offlineCacheAllowed: true,
          slug: 'account-a-book',
          title: 'Account A Book',
        },
      ],
    });
    const firstSave = deferred<void>();
    const saveLibraryBooks = vi
      .fn()
      .mockImplementationOnce(() => firstSave.promise)
      .mockResolvedValue(undefined);
    const cancellableEnvConfig = {
      getAppService: async () => ({ saveLibraryBooks }),
    } as unknown as EnvConfigType;
    const controller = new AbortController();
    const library: Book[] = [];

    const sync = syncStoryBoredMarketplaceLibrary({
      envConfig: cancellableEnvConfig,
      token: 'account-a-token',
      library,
      getCurrentLibrary: () => library,
      signal: controller.signal,
    });
    await vi.waitFor(() => {
      expect(saveLibraryBooks).toHaveBeenCalledOnce();
    });

    controller.abort();
    firstSave.resolve();

    await expect(sync).resolves.toBe(library);
    expect(saveLibraryBooks).toHaveBeenCalledTimes(2);
    expect(saveLibraryBooks).toHaveBeenLastCalledWith(library);
  });

  it('serializes overlapping account saves so the newest account is durable last', async () => {
    const ownedItem = (account: string) => ({
      acquiredAt: '2026-08-03T00:00:00.000Z',
      author: 'StoryBored',
      bookId: `book-${account}`,
      coverImageUrl: null,
      entitlementStatus: 'active',
      exportAllowed: false,
      format: 'EPUB',
      grantedByListingId: `listing-${account}`,
      hasScenePack: false,
      language: 'en',
      libraryItemId: `library-${account}`,
      listingId: `listing-${account}`,
      offlineCacheAllowed: true,
      slug: `${account}-book`,
      title: `Account ${account.toUpperCase()} Book`,
    });
    storyBoredMocks.listOwnedLibrary
      .mockResolvedValueOnce({ libraryItems: [ownedItem('a')] })
      .mockResolvedValueOnce({ libraryItems: [ownedItem('b')] });
    const firstSave = deferred<void>();
    const saveLibraryBooks = vi
      .fn()
      .mockImplementationOnce(() => firstSave.promise)
      .mockResolvedValue(undefined);
    const serializedEnvConfig = {
      getAppService: async () => ({ saveLibraryBooks }),
    } as unknown as EnvConfigType;
    const library: Book[] = [];

    const accountASync = syncStoryBoredMarketplaceLibrary({
      envConfig: serializedEnvConfig,
      token: 'account-a-token',
      library,
      getCurrentLibrary: () => library,
    });
    await vi.waitFor(() => {
      expect(saveLibraryBooks).toHaveBeenCalledOnce();
    });

    const accountBSync = syncStoryBoredMarketplaceLibrary({
      envConfig: serializedEnvConfig,
      token: 'account-b-token',
      library,
      getCurrentLibrary: () => library,
    });
    firstSave.resolve();

    await expect(accountASync).resolves.toBe(library);
    const accountBLibrary = await accountBSync;
    expect(isMd5(accountBLibrary[0]?.hash ?? '')).toBe(true);
    expect(accountBLibrary[0]?.hash).not.toBe('book-b');
    expect(accountBLibrary[0]?.marketplace?.sourceKey).toBe('book-b');
    expect(saveLibraryBooks).toHaveBeenLastCalledWith(accountBLibrary);
  });

  it('keeps shared marketplace source keys isolated by entitlement-local hashes', async () => {
    const ownedItem = (account: 'a' | 'b') => ({
      acquiredAt: '2026-08-03T00:00:00.000Z',
      author: 'StoryBored',
      bookId: 'shared-marketplace-source-key',
      coverImageUrl: null,
      entitlementStatus: 'active',
      exportAllowed: false,
      format: 'EPUB',
      grantedByListingId: 'listing-shared',
      hasScenePack: false,
      language: 'en',
      libraryItemId: `library-account-${account}`,
      listingId: 'listing-shared',
      offlineCacheAllowed: true,
      slug: 'shared-book',
      title: 'Shared Marketplace Book',
    });
    storyBoredMocks.listOwnedLibrary
      .mockResolvedValueOnce({ libraryItems: [ownedItem('a')] })
      .mockResolvedValueOnce({ libraryItems: [ownedItem('b')] })
      .mockResolvedValueOnce({ libraryItems: [ownedItem('a')] });
    const saveLibraryBooks = vi.fn().mockResolvedValue(undefined);
    const isolatedEnvConfig = {
      getAppService: async () => ({ saveLibraryBooks }),
    } as unknown as EnvConfigType;

    const accountALibrary = await syncStoryBoredMarketplaceLibrary({
      envConfig: isolatedEnvConfig,
      token: 'account-a-token',
      library: [],
    });
    const accountABook = accountALibrary[0]!;
    expect(isMd5(accountABook.hash)).toBe(true);
    expect(accountABook.marketplace?.sourceKey).toBe('shared-marketplace-source-key');

    const accountBLibrary = await syncStoryBoredMarketplaceLibrary({
      envConfig: isolatedEnvConfig,
      token: 'account-b-token',
      library: accountALibrary,
    });
    const accountBBook = accountBLibrary.find(
      (book) => book.marketplace?.libraryItemId === 'library-account-b',
    )!;
    const accountARevoked = accountBLibrary.find(
      (book) => book.marketplace?.libraryItemId === 'library-account-a',
    )!;

    expect(accountBLibrary).toHaveLength(2);
    expect(isMd5(accountBBook.hash)).toBe(true);
    expect(accountBBook.hash).not.toBe(accountABook.hash);
    expect(accountBBook.marketplace?.sourceKey).toBe('shared-marketplace-source-key');
    expect(accountARevoked.marketplace?.entitlementStatus).toBe('revoked');

    const accountAAgainLibrary = await syncStoryBoredMarketplaceLibrary({
      envConfig: isolatedEnvConfig,
      token: 'account-a-token',
      library: accountBLibrary,
    });
    const accountAAgain = accountAAgainLibrary.find(
      (book) => book.marketplace?.libraryItemId === 'library-account-a',
    )!;

    expect(accountAAgainLibrary).toHaveLength(2);
    expect(accountAAgain.hash).toBe(accountABook.hash);
    expect(accountAAgain.marketplace?.sourceKey).toBe('shared-marketplace-source-key');
    expect(accountAAgain.marketplace?.entitlementStatus).toBe('active');
  });

  it('adds the API source key to a legacy entitlement without changing its local hash', async () => {
    storyBoredMocks.listOwnedLibrary.mockResolvedValue({
      libraryItems: [
        {
          acquiredAt: '2026-08-03T00:00:00.000Z',
          author: 'StoryBored',
          bookId: 'shared-marketplace-source-key',
          coverImageUrl: null,
          entitlementStatus: 'active',
          exportAllowed: false,
          format: 'EPUB',
          grantedByListingId: 'listing-shared',
          hasScenePack: false,
          language: 'en',
          libraryItemId: 'library-account-a',
          listingId: 'listing-shared',
          offlineCacheAllowed: true,
          slug: 'shared-book',
          title: 'Shared Marketplace Book',
        },
      ],
    });
    const saveLibraryBooks = vi.fn().mockResolvedValue(undefined);
    const migrationEnvConfig = {
      getAppService: async () => ({ saveLibraryBooks }),
    } as unknown as EnvConfigType;
    const legacyBook = {
      hash: 'legacy-entitlement-local-hash',
      format: 'EPUB',
      title: 'Shared Marketplace Book',
      author: 'StoryBored',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      marketplace: {
        libraryItemId: 'library-account-a',
        listingId: 'listing-shared',
        slug: 'shared-book',
        entitlementStatus: 'active',
      },
    } as Book;

    const migratedLibrary = await syncStoryBoredMarketplaceLibrary({
      envConfig: migrationEnvConfig,
      token: 'account-a-token',
      library: [legacyBook],
    });

    expect(migratedLibrary).toHaveLength(1);
    expect(migratedLibrary[0]?.hash).toBe('legacy-entitlement-local-hash');
    expect(migratedLibrary[0]?.marketplace?.sourceKey).toBe('shared-marketplace-source-key');
  });

  it('reattaches marketplace metadata after a cloud round trip by entitlement-local hash', async () => {
    const sourceKey = 'a'.repeat(64);
    const ownedItem = {
      acquiredAt: '2026-08-03T00:00:00.000Z',
      author: 'StoryBored',
      bookId: sourceKey,
      coverImageUrl: null,
      entitlementStatus: 'active',
      exportAllowed: false,
      format: 'EPUB',
      grantedByListingId: 'listing-shared',
      hasScenePack: false,
      language: 'en',
      libraryItemId: 'library-account-a',
      listingId: 'listing-shared',
      offlineCacheAllowed: true,
      slug: 'shared-book',
      title: 'Shared Marketplace Book',
    };
    storyBoredMocks.listOwnedLibrary.mockResolvedValue({ libraryItems: [ownedItem] });
    const saveLibraryBooks = vi.fn().mockResolvedValue(undefined);
    const roundTripEnvConfig = {
      getAppService: async () => ({ saveLibraryBooks }),
    } as unknown as EnvConfigType;

    const firstLibrary = await syncStoryBoredMarketplaceLibrary({
      envConfig: roundTripEnvConfig,
      token: 'account-a-token',
      library: [],
    });
    const originalHash = firstLibrary[0]!.hash;
    const cloudRoundTrippedBook = {
      ...firstLibrary[0]!,
      marketplace: undefined,
    };

    const restoredLibrary = await syncStoryBoredMarketplaceLibrary({
      envConfig: roundTripEnvConfig,
      token: 'account-a-token',
      library: [cloudRoundTrippedBook],
    });

    expect(restoredLibrary).toHaveLength(1);
    expect(restoredLibrary[0]?.hash).toBe(originalHash);
    expect(restoredLibrary[0]?.marketplace?.libraryItemId).toBe('library-account-a');
    expect(restoredLibrary[0]?.marketplace?.sourceKey).toBe(sourceKey);
  });

  it('recovers a marked pre-cutover row by its legacy source-key hash', async () => {
    const legacySourceKey = 'legacy-marketplace-user-listing-key';
    storyBoredMocks.listOwnedLibrary.mockResolvedValue({
      libraryItems: [
        {
          acquiredAt: '2026-08-03T00:00:00.000Z',
          author: 'StoryBored',
          bookId: legacySourceKey,
          coverImageUrl: null,
          entitlementStatus: 'active',
          exportAllowed: false,
          format: 'EPUB',
          grantedByListingId: 'listing-shared',
          hasScenePack: false,
          language: 'en',
          libraryItemId: 'library-account-a',
          listingId: 'listing-shared',
          offlineCacheAllowed: true,
          slug: 'shared-book',
          title: 'Shared Marketplace Book',
        },
      ],
    });
    const saveLibraryBooks = vi.fn().mockResolvedValue(undefined);
    const migrationEnvConfig = {
      getAppService: async () => ({ saveLibraryBooks }),
    } as unknown as EnvConfigType;
    const cloudLegacyBook = {
      hash: legacySourceKey,
      format: 'EPUB',
      title: 'Shared Marketplace Book',
      author: 'StoryBored',
      groupName: 'StoryBored Marketplace',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as Book;

    const migratedLibrary = await syncStoryBoredMarketplaceLibrary({
      envConfig: migrationEnvConfig,
      token: 'account-a-token',
      library: [cloudLegacyBook],
    });

    expect(migratedLibrary).toHaveLength(1);
    expect(migratedLibrary[0]?.hash).toBe(legacySourceKey);
    expect(migratedLibrary[0]?.marketplace?.libraryItemId).toBe('library-account-a');
    expect(migratedLibrary[0]?.marketplace?.sourceKey).toBe(legacySourceKey);
  });

  it('does not merge a current shared source-key row after marketplace metadata is lost', async () => {
    const sharedSourceKey = 'b'.repeat(64);
    storyBoredMocks.listOwnedLibrary.mockResolvedValue({
      libraryItems: [
        {
          acquiredAt: '2026-08-03T00:00:00.000Z',
          author: 'StoryBored',
          bookId: sharedSourceKey,
          coverImageUrl: null,
          entitlementStatus: 'active',
          exportAllowed: false,
          format: 'EPUB',
          grantedByListingId: 'listing-shared',
          hasScenePack: false,
          language: 'en',
          libraryItemId: 'library-account-b',
          listingId: 'listing-shared',
          offlineCacheAllowed: true,
          slug: 'shared-book',
          title: 'Shared Marketplace Book',
        },
      ],
    });
    const saveLibraryBooks = vi.fn().mockResolvedValue(undefined);
    const isolatedEnvConfig = {
      getAppService: async () => ({ saveLibraryBooks }),
    } as unknown as EnvConfigType;
    const metadataStrippedSharedRow = {
      hash: sharedSourceKey,
      format: 'EPUB',
      title: 'Shared Marketplace Book',
      author: 'StoryBored',
      groupName: 'StoryBored Marketplace',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as Book;

    const accountBLibrary = await syncStoryBoredMarketplaceLibrary({
      envConfig: isolatedEnvConfig,
      token: 'account-b-token',
      library: [metadataStrippedSharedRow],
    });

    expect(accountBLibrary).toHaveLength(2);
    const accountBBook = accountBLibrary.find(
      (book) => book.marketplace?.libraryItemId === 'library-account-b',
    )!;
    expect(isMd5(accountBBook.hash)).toBe(true);
    expect(accountBBook.hash).not.toBe(sharedSourceKey);
    const quarantinedSharedRow = accountBLibrary.find((book) => book.hash === sharedSourceKey)!;
    expect(quarantinedSharedRow.deletedAt).toEqual(expect.any(Number));
    expect(quarantinedSharedRow.downloadedAt).toBeNull();
    expect(quarantinedSharedRow.exportAllowed).toBe(false);
  });

  it('quarantines an unmatched marketplace-group row after cloud metadata loss', async () => {
    storyBoredMocks.listOwnedLibrary.mockResolvedValue({ libraryItems: [] });
    const saveLibraryBooks = vi.fn().mockResolvedValue(undefined);
    const quarantineEnvConfig = {
      getAppService: async () => ({ saveLibraryBooks }),
    } as unknown as EnvConfigType;
    const orphanedCloudBook = {
      hash: 'orphaned-entitlement-local-hash',
      format: 'EPUB',
      title: 'Former Marketplace Book',
      author: 'StoryBored',
      groupName: 'StoryBored Marketplace',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      downloadedAt: Date.now(),
      exportAllowed: false,
    } as Book;

    const quarantinedLibrary = await syncStoryBoredMarketplaceLibrary({
      envConfig: quarantineEnvConfig,
      token: 'account-b-token',
      library: [orphanedCloudBook],
    });

    expect(quarantinedLibrary).toHaveLength(1);
    expect(quarantinedLibrary[0]?.deletedAt).toEqual(expect.any(Number));
    expect(quarantinedLibrary[0]?.downloadedAt).toBeNull();
    expect(saveLibraryBooks).toHaveBeenCalledWith(quarantinedLibrary);
  });

  it('does not write marketplace content after its auth session is aborted', async () => {
    storyBoredMocks.getOwnedLibraryContent.mockResolvedValue({
      contentUrl: 'https://assets.storybored.test/book.epub',
      expiresAt: '2026-08-03T01:00:00.000Z',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('book-bytes', { status: 200 })),
    );
    const directoryExists = deferred<boolean>();
    const appService = {
      createDir: vi.fn(),
      exists: vi.fn(() => directoryExists.promise),
      saveBookConfig: vi.fn(),
      writeFile: vi.fn(),
    };
    const cacheEnvConfig = {
      getAppService: async () => appService,
    } as unknown as EnvConfigType;
    const controller = new AbortController();
    let isCurrentSession = true;
    const book = {
      hash: 'book-account-a',
      format: 'EPUB',
      title: 'Account A Book',
      marketplace: {
        libraryItemId: 'library-account-a',
      },
    } as Book;

    const cache = cacheStoryBoredMarketplaceBook({
      envConfig: cacheEnvConfig,
      token: 'account-a-token',
      book,
      signal: controller.signal,
      isCurrentSession: () => isCurrentSession,
    });
    await vi.waitFor(() => {
      expect(appService.exists).toHaveBeenCalledOnce();
    });

    isCurrentSession = false;
    controller.abort();
    directoryExists.resolve(false);

    await expect(cache).rejects.toThrow('StoryBored marketplace cache was cancelled.');
    expect(appService.createDir).not.toHaveBeenCalled();
    expect(appService.writeFile).not.toHaveBeenCalled();
    expect(appService.saveBookConfig).not.toHaveBeenCalled();
  });
});
