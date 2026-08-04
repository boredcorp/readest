import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EnvConfigType } from '@/services/environment';
import type { Book } from '@/types/book';

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
    expect(accountBLibrary[0]?.hash).toBe('book-b');
    expect(saveLibraryBooks).toHaveBeenLastCalledWith(accountBLibrary);
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
