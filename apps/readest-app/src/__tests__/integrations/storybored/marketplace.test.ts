import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EnvConfigType } from '@/services/environment';
import type { Book } from '@/types/book';
import { md5 } from '@/utils/md5';
import { transformBookFromDB, transformBookToDB } from '@/utils/transform';

const MARKETPLACE_LOCAL_HASH = /^sbm2[0-9a-f]{64}$/i;

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
  getOwnedLibraryScenePack: vi.fn(),
  listOwnedLibrary: vi.fn(),
}));

vi.mock('@/integrations/storybored/client', () => ({
  isStoryBoredReaderEnabled: () => true,
  createStoryBoredReaderClient: (options: unknown) => {
    storyBoredMocks.createClient(options);
    return {
      getOwnedLibraryContent: storyBoredMocks.getOwnedLibraryContent,
      getOwnedLibraryScenePack: storyBoredMocks.getOwnedLibraryScenePack,
      listOwnedLibrary: storyBoredMocks.listOwnedLibrary,
    };
  },
}));

import {
  cacheStoryBoredMarketplaceBook,
  canOpenStoryBoredMarketplaceBook,
  quarantineStoryBoredMarketplaceLibraryForUser,
  syncStoryBoredMarketplaceLibrary as syncMarketplaceLibraryForUser,
} from '@/integrations/storybored/marketplace';

const syncStoryBoredMarketplaceLibrary = (
  input: Omit<Parameters<typeof syncMarketplaceLibraryForUser>[0], 'userId'> & {
    userId?: string;
  },
) => syncMarketplaceLibraryForUser({ ...input, userId: input.userId ?? 'user-owner' });

const envConfig: EnvConfigType = {
  getAppService: async () => {
    throw new Error('The app service should not be needed for an unchanged library.');
  },
};

describe('StoryBored marketplace library authentication', () => {
  beforeEach(() => {
    storyBoredMocks.createClient.mockReset();
    storyBoredMocks.getOwnedLibraryContent.mockReset();
    storyBoredMocks.getOwnedLibraryScenePack.mockReset();
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

  it('owner-verifiable hashes fail closed across accounts before any API response', async () => {
    storyBoredMocks.listOwnedLibrary.mockResolvedValue({
      libraryItems: [
        {
          acquiredAt: '2026-08-03T00:00:00.000Z',
          author: 'StoryBored',
          bookId: 'owner-scoped-source',
          coverImageUrl: null,
          entitlementStatus: 'active',
          exportAllowed: false,
          format: 'EPUB',
          grantedByListingId: 'listing-owner',
          hasScenePack: false,
          language: 'en',
          libraryItemId: 'library-owner-a',
          listingId: 'listing-owner',
          offlineCacheAllowed: true,
          slug: 'owner-book',
          title: 'Owner Book',
        },
      ],
    });
    const saveLibraryBooks = vi.fn().mockResolvedValue(undefined);
    const ownerEnvConfig = {
      getAppService: async () => ({ saveLibraryBooks }),
    } as unknown as EnvConfigType;
    const ownerALibrary = await syncMarketplaceLibraryForUser({
      envConfig: ownerEnvConfig,
      userId: 'owner-a',
      token: 'owner-a-token',
      library: [],
    });
    const ownerABook = ownerALibrary[0]!;

    expect(canOpenStoryBoredMarketplaceBook(ownerABook, 'owner-a')).toBe(true);
    expect(canOpenStoryBoredMarketplaceBook(ownerABook, 'owner-b')).toBe(false);
    const ownerBLibrary = quarantineStoryBoredMarketplaceLibraryForUser(ownerALibrary, 'owner-b');
    expect(ownerBLibrary[0]?.deletedAt).toEqual(expect.any(Number));
    expect(ownerBLibrary[0]?.marketplaceOwnerMismatchQuarantined).toBe(true);
    expect(canOpenStoryBoredMarketplaceBook(ownerBLibrary[0]!, 'owner-b')).toBe(false);

    const ownerAAgain = quarantineStoryBoredMarketplaceLibraryForUser(ownerBLibrary, 'owner-a');
    expect(ownerAAgain[0]?.deletedAt).toBeNull();
    expect(ownerAAgain[0]?.marketplaceOwnerMismatchQuarantined).toBeUndefined();
    expect(canOpenStoryBoredMarketplaceBook(ownerAAgain[0]!, 'owner-a')).toBe(true);
  });

  it('keeps an ambiguous personal row intact and requires leaving the reserved group to open', () => {
    const personalBook = {
      hash: 'a'.repeat(32),
      format: 'EPUB',
      title: 'Personal Book',
      author: 'Reader',
      groupName: 'StoryBored Marketplace',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as Book;
    const library = [personalBook];

    expect(quarantineStoryBoredMarketplaceLibraryForUser(library, 'owner-b')).toBe(library);
    expect(canOpenStoryBoredMarketplaceBook(personalBook, 'owner-b')).toBe(false);
    expect(
      canOpenStoryBoredMarketplaceBook({ ...personalBook, groupName: 'Personal' }, 'owner-b'),
    ).toBe(true);
  });

  it('persists only stable scene-pack summary metadata from the owned library response', async () => {
    const signedImageUrl =
      'https://private-assets.storybored.test/scene.webp?X-Amz-Signature=secret';
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
          hasScenePack: true,
          language: 'en',
          libraryItemId: 'library-account-a',
          listingId: 'listing-account-a',
          offlineCacheAllowed: true,
          scenePack: {
            id: 'scene-pack-a',
            label: 'Lantern moments',
            sceneCount: 3,
            version: 'v2',
            imageUrl: signedImageUrl,
            imageAssetStorageKey: 'marketplace/private/scene.webp',
          },
          slug: 'account-a-book',
          title: 'Account A Book',
        },
      ],
    });
    const saveLibraryBooks = vi.fn().mockResolvedValue(undefined);
    const scenePackEnvConfig = {
      getAppService: async () => ({ saveLibraryBooks }),
    } as unknown as EnvConfigType;

    const syncedLibrary = await syncStoryBoredMarketplaceLibrary({
      envConfig: scenePackEnvConfig,
      token: 'account-a-token',
      library: [],
    });

    expect(syncedLibrary[0]?.marketplace?.scenePack).toEqual({
      id: 'scene-pack-a',
      label: 'Lantern moments',
      sceneCount: 3,
      version: 'v2',
    });
    expect(storyBoredMocks.getOwnedLibraryScenePack).not.toHaveBeenCalled();
    expect(saveLibraryBooks).toHaveBeenCalledWith(syncedLibrary);
    const persistedLibrary = saveLibraryBooks.mock.calls[0]?.[0] as Book[];
    const serializedLibrary = JSON.stringify(persistedLibrary);
    expect(serializedLibrary).not.toContain(signedImageUrl);
    expect(serializedLibrary).not.toContain('imageAssetStorageKey');
    expect(serializedLibrary).not.toContain('marketplace/private/scene.webp');
  });

  it('clears cached metadata and bytes when an entitlement is returned as refunded', async () => {
    storyBoredMocks.listOwnedLibrary.mockResolvedValue({
      libraryItems: [
        {
          acquiredAt: '2026-08-03T00:00:00.000Z',
          author: 'StoryBored',
          bookId: 'book-account-a',
          coverImageUrl: null,
          entitlementStatus: 'refunded',
          exportAllowed: false,
          format: 'EPUB',
          grantedByListingId: 'listing-account-a',
          hasScenePack: false,
          language: 'en',
          libraryItemId: 'library-account-a',
          listingId: 'listing-account-a',
          offlineCacheAllowed: false,
          slug: 'account-a-book',
          title: 'Account A Book',
        },
      ],
    });
    const saveLibraryBooks = vi.fn().mockResolvedValue(undefined);
    const exists = vi.fn().mockResolvedValue(true);
    const deleteDir = vi.fn().mockResolvedValue(undefined);
    const revokeEnvConfig = {
      getAppService: async () => ({ deleteDir, exists, saveLibraryBooks }),
    } as unknown as EnvConfigType;
    const library = [
      {
        hash: 'book-account-a',
        format: 'EPUB',
        title: 'Account A Book',
        author: 'StoryBored',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        downloadedAt: Date.now(),
        marketplace: {
          libraryItemId: 'library-account-a',
          listingId: 'listing-account-a',
          slug: 'account-a-book',
          entitlementStatus: 'active',
          offlineCachedAt: Date.now(),
          hasScenePack: true,
          scenePack: {
            id: 'scene-pack-a',
            label: 'Lantern moments',
            sceneCount: 3,
            version: 'v2',
          },
        },
      },
    ] as Book[];

    const revokedLibrary = await syncStoryBoredMarketplaceLibrary({
      envConfig: revokeEnvConfig,
      token: 'account-b-token',
      library,
    });

    expect(revokedLibrary[0]?.marketplace?.entitlementStatus).toBe('revoked');
    expect(revokedLibrary[0]?.marketplace?.scenePack).toBeUndefined();
    expect(revokedLibrary[0]?.downloadedAt).toBeNull();
    expect(revokedLibrary[0]?.marketplace?.offlineCachedAt).toBeNull();
    expect(exists).toHaveBeenCalledWith('book-account-a', 'Books');
    expect(deleteDir).toHaveBeenCalledWith('book-account-a', 'Books', true);
    expect(JSON.stringify(saveLibraryBooks.mock.calls[0]?.[0])).not.toContain('scene-pack-a');
  });

  it('does not inspect or delete local bytes for a non-marketplace book', async () => {
    storyBoredMocks.listOwnedLibrary.mockResolvedValue({ libraryItems: [] });
    const getAppService = vi.fn();
    const ordinaryBook = {
      hash: 'ordinary-local-book',
      format: 'EPUB',
      title: 'An Ordinary Book',
      author: 'StoryBored',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      downloadedAt: Date.now(),
    } as Book;

    const result = await syncStoryBoredMarketplaceLibrary({
      envConfig: { getAppService } as unknown as EnvConfigType,
      token: 'account-a-token',
      library: [ordinaryBook],
    });

    expect(result).toEqual([ordinaryBook]);
    expect(getAppService).not.toHaveBeenCalled();
  });

  it('does not delete a revoked book directory after its auth session becomes stale', async () => {
    storyBoredMocks.listOwnedLibrary.mockResolvedValue({ libraryItems: [] });
    const existsResult = deferred<boolean>();
    const exists = vi.fn(() => existsResult.promise);
    const deleteDir = vi.fn().mockResolvedValue(undefined);
    const saveLibraryBooks = vi.fn().mockResolvedValue(undefined);
    const staleEnvConfig = {
      getAppService: async () => ({ deleteDir, exists, saveLibraryBooks }),
    } as unknown as EnvConfigType;
    const controller = new AbortController();
    const library = [
      {
        hash: 'revoked-book-directory',
        format: 'EPUB',
        title: 'Former Marketplace Book',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        downloadedAt: Date.now(),
        marketplace: {
          libraryItemId: 'revoked-library-item',
          listingId: 'revoked-listing',
          slug: 'former-marketplace-book',
          entitlementStatus: 'active',
          offlineCachedAt: Date.now(),
        },
      },
    ] as Book[];

    const sync = syncStoryBoredMarketplaceLibrary({
      envConfig: staleEnvConfig,
      token: 'account-a-token',
      library,
      getCurrentLibrary: () => library,
      signal: controller.signal,
    });
    await vi.waitFor(() => {
      expect(exists).toHaveBeenCalledWith('revoked-book-directory', 'Books');
    });

    controller.abort();
    existsResult.resolve(true);

    await expect(sync).resolves.toBe(library);
    expect(deleteDir).not.toHaveBeenCalled();
    expect(saveLibraryBooks).toHaveBeenCalledTimes(2);
    expect(saveLibraryBooks).toHaveBeenLastCalledWith(library);
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
    expect(accountBLibrary[0]?.hash).toMatch(MARKETPLACE_LOCAL_HASH);
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
    const exists = vi.fn().mockResolvedValue(true);
    const deleteDir = vi.fn().mockResolvedValue(undefined);
    const isolatedEnvConfig = {
      getAppService: async () => ({ deleteDir, exists, saveLibraryBooks }),
    } as unknown as EnvConfigType;

    const accountALibrary = await syncStoryBoredMarketplaceLibrary({
      envConfig: isolatedEnvConfig,
      token: 'account-a-token',
      library: [],
    });
    const accountABook = accountALibrary[0]!;
    expect(accountABook.hash).toMatch(MARKETPLACE_LOCAL_HASH);
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
    expect(accountBBook.hash).toMatch(MARKETPLACE_LOCAL_HASH);
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
    expect(deleteDir).toHaveBeenCalledWith(accountABook.hash, 'Books', true);
    expect(deleteDir).toHaveBeenCalledWith(accountBBook.hash, 'Books', true);
  });

  it('adds the API source key and owner marker while rekeying a legacy entitlement', async () => {
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
      getAppService: async () => ({ exists: async () => false, saveLibraryBooks }),
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

    expect(migratedLibrary).toHaveLength(2);
    const activeBook = migratedLibrary.find((book) => !book.deletedAt)!;
    const legacyTombstone = migratedLibrary.find(
      (book) => book.hash === 'legacy-entitlement-local-hash',
    )!;
    expect(activeBook.hash).toMatch(MARKETPLACE_LOCAL_HASH);
    expect(activeBook.marketplace?.sourceKey).toBe('shared-marketplace-source-key');
    expect(legacyTombstone.deletedAt).toEqual(expect.any(Number));
    expect(legacyTombstone.marketplace).toBeUndefined();
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

  it('reattaches a Step 1-12 bare entitlement hash without creating a duplicate', async () => {
    const libraryItemId = 'library-account-a';
    storyBoredMocks.listOwnedLibrary.mockResolvedValue({
      libraryItems: [
        {
          acquiredAt: '2026-08-03T00:00:00.000Z',
          author: 'StoryBored',
          bookId: 'legacy-source-key',
          coverImageUrl: null,
          entitlementStatus: 'active',
          exportAllowed: false,
          format: 'EPUB',
          grantedByListingId: 'listing-shared',
          hasScenePack: false,
          language: 'en',
          libraryItemId,
          listingId: 'listing-shared',
          offlineCacheAllowed: true,
          slug: 'shared-book',
          title: 'Shared Marketplace Book',
        },
      ],
    });
    const saveLibraryBooks = vi.fn().mockResolvedValue(undefined);
    const deleteDir = vi.fn().mockResolvedValue(undefined);
    const migrationEnvConfig = {
      getAppService: async () => ({ deleteDir, exists: async () => true, saveLibraryBooks }),
    } as unknown as EnvConfigType;
    const bareEntitlementHash = md5(`storybored-marketplace:${libraryItemId}`);
    const cloudLegacyBook = {
      hash: bareEntitlementHash,
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

    expect(migratedLibrary).toHaveLength(2);
    const activeBook = migratedLibrary.find((book) => !book.deletedAt)!;
    const oldKeyTombstone = migratedLibrary.find((book) => book.hash === bareEntitlementHash)!;
    expect(activeBook.hash).toMatch(MARKETPLACE_LOCAL_HASH);
    expect(activeBook.hash).not.toBe(bareEntitlementHash);
    expect(activeBook.marketplace?.libraryItemId).toBe(libraryItemId);
    expect(oldKeyTombstone.deletedAt).toEqual(expect.any(Number));
    expect(oldKeyTombstone.downloadedAt).toBeNull();
    expect(oldKeyTombstone.marketplace).toBeUndefined();
    expect(deleteDir).toHaveBeenCalledWith(bareEntitlementHash, 'Books', true);

    const cloudRoundTrip = migratedLibrary.map((book) =>
      transformBookFromDB(transformBookToDB(book, 'user-owner')),
    );
    const restoredLibrary = await syncStoryBoredMarketplaceLibrary({
      envConfig: migrationEnvConfig,
      token: 'account-a-token',
      library: cloudRoundTrip,
    });
    const restoredActiveBooks = restoredLibrary.filter((book) => !book.deletedAt);
    expect(restoredActiveBooks).toHaveLength(1);
    expect(restoredActiveBooks[0]?.hash).toMatch(MARKETPLACE_LOCAL_HASH);
    expect(restoredActiveBooks[0]?.marketplace?.libraryItemId).toBe(libraryItemId);
    expect(
      restoredLibrary.filter((book) => book.hash === bareEntitlementHash && book.deletedAt),
    ).toHaveLength(1);
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
      getAppService: async () => ({ exists: async () => false, saveLibraryBooks }),
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

    expect(migratedLibrary).toHaveLength(2);
    const activeBook = migratedLibrary.find((book) => !book.deletedAt)!;
    const legacyTombstone = migratedLibrary.find((book) => book.hash === legacySourceKey)!;
    expect(activeBook.hash).toMatch(MARKETPLACE_LOCAL_HASH);
    expect(activeBook.hash).not.toBe(legacySourceKey);
    expect(activeBook.marketplace?.libraryItemId).toBe('library-account-a');
    expect(activeBook.marketplace?.sourceKey).toBe(legacySourceKey);
    expect(legacyTombstone.deletedAt).toEqual(expect.any(Number));
    expect(legacyTombstone.marketplace).toBeUndefined();
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
    const exists = vi.fn().mockResolvedValue(true);
    const deleteDir = vi.fn().mockResolvedValue(undefined);
    const isolatedEnvConfig = {
      getAppService: async () => ({ deleteDir, exists, saveLibraryBooks }),
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
    expect(accountBBook.hash).toMatch(MARKETPLACE_LOCAL_HASH);
    expect(accountBBook.hash).not.toBe(sharedSourceKey);
    const preservedSharedRow = accountBLibrary.find((book) => book.hash === sharedSourceKey)!;
    expect(preservedSharedRow).toBe(metadataStrippedSharedRow);
    expect(deleteDir).not.toHaveBeenCalledWith(sharedSourceKey, 'Books', true);
  });

  it('does not change a personal book based only on the user-editable marketplace group', async () => {
    storyBoredMocks.listOwnedLibrary.mockResolvedValue({ libraryItems: [] });
    const personalBook = {
      hash: 'a'.repeat(32),
      format: 'EPUB',
      title: 'Personal Book',
      author: 'Reader',
      groupName: 'StoryBored Marketplace',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as Book;
    const library = [personalBook];

    const syncedLibrary = await syncStoryBoredMarketplaceLibrary({
      envConfig,
      token: 'account-b-token',
      library,
    });

    expect(syncedLibrary).toBe(library);
  });

  it('purges a metadata-stripped row with a durable marketplace hash marker', async () => {
    storyBoredMocks.listOwnedLibrary.mockResolvedValue({ libraryItems: [] });
    const saveLibraryBooks = vi.fn().mockResolvedValue(undefined);
    const exists = vi.fn().mockResolvedValue(true);
    const deleteDir = vi.fn().mockResolvedValue(undefined);
    const quarantineEnvConfig = {
      getAppService: async () => ({ deleteDir, exists, saveLibraryBooks }),
    } as unknown as EnvConfigType;
    const orphanedCloudBook = {
      hash: `sbm2${'c'.repeat(64)}`,
      format: 'EPUB',
      title: 'Former Marketplace Book',
      author: 'StoryBored',
      groupName: 'StoryBored Marketplace',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      deletedAt: Date.now(),
      downloadedAt: null,
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
    expect(deleteDir).toHaveBeenCalledWith(orphanedCloudBook.hash, 'Books', true);
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
