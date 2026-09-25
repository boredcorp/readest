import { describe, test, expect, vi, beforeEach } from 'vitest';
import type { FoliateView } from '@/types/view';
import type { Insets } from '@/types/misc';
import type { ViewSettings } from '@/types/book';
import type { Book, BookConfig } from '@/types/book';
import type { EnvConfigType } from '@/services/environment';
import { useLibraryStore } from '@/store/libraryStore';
import type { BookDoc } from '@/libs/document';

vi.mock('@/store/bookDataStore', async () => {
  const { create } = await import('zustand');
  return {
    useBookDataStore: create(() => ({
      booksData: {} as Record<string, unknown>,
    })),
  };
});

vi.mock('@/store/settingsStore', () => {
  const { create } = require('zustand');
  return {
    useSettingsStore: create(() => ({
      settings: {},
    })),
  };
});

vi.mock('@/store/libraryStore', () => {
  const { create } = require('zustand');
  return {
    useLibraryStore: create(() => ({
      library: [],
      hashIndex: new Map(),
      setLibrary: vi.fn(),
      getBookByHash: vi.fn(),
      updateBookProgress: vi.fn(),
      rebuildHashIndex: vi.fn(),
    })),
  };
});

vi.mock('@/utils/misc', () => ({
  uniqueId: vi.fn(() => 'mock-uid-123'),
}));

// These are transitive imports needed by readerStore
vi.mock('@/services/nav', () => ({ updateToc: vi.fn() }));
vi.mock('@/utils/book', () => ({
  formatTitle: vi.fn((t: string) => t),
  getMetadataHash: vi.fn(() => 'hash'),
  getPrimaryLanguage: vi.fn(() => 'en'),
}));
vi.mock('@/utils/path', () => ({
  getBaseFilename: vi.fn((n: string) => n),
}));
vi.mock('@/services/constants', () => ({
  SUPPORTED_LANGNAMES: {},
}));
vi.mock('@/libs/document', () => ({
  DocumentLoader: vi.fn(),
}));

import { useReaderStore, retireCloudBookViews } from '@/store/readerStore';
import { useBookDataStore } from '@/store/bookDataStore';
import { publishCloudSession, captureCloudLease } from '@/services/cloudOwnerSession';

/**
 * Helper to seed a minimal ViewState in the store for a given key.
 */
function seedViewState(key: string, overrides: Record<string, unknown> = {}) {
  useReaderStore.setState((state) => ({
    viewStates: {
      ...state.viewStates,
      [key]: {
        key,
        view: null,
        viewerKey: `${key}-viewer`,
        isPrimary: true,
        loading: false,
        inited: false,
        error: null,
        progress: null,
        ribbonVisible: false,
        ttsEnabled: false,
        syncing: false,
        gridInsets: null,
        viewSettings: null,
        ...overrides,
      },
    },
  }));
}

describe('readerStore', () => {
  test('cloud deletion retires an initializing owner view before BookData exists', async () => {
    publishCloudSession({ subject: 'fixture-A', token: 'synthetic' });
    const lease = await captureCloudLease();
    const book: Book = {
      hash: 'fixture',
      title: 'Synthetic',
      author: 'Fixture',
      format: 'TXT',
      createdAt: 1,
      updatedAt: 2,
      libraryOrigin: { kind: 'cloud', ownerKey: lease.ownerKey, epoch: lease.epoch },
    };
    vi.mocked(useLibraryStore.getState().getBookByHash).mockReturnValue(book);
    const service = { loadBookContent: vi.fn() };
    const deferred = Promise.withResolvers<typeof service>();
    const env = { getAppService: () => deferred.promise } as unknown as EnvConfigType;
    useReaderStore.getState().setBookKeys(['fixture-pending']);
    const loading = useReaderStore.getState().initViewState(env, 'fixture', 'fixture-pending');
    expect(useReaderStore.getState().getViewState('fixture-pending')?.loading).toBe(true);
    expect(useBookDataStore.getState().booksData['fixture']).toBeUndefined();
    retireCloudBookViews('fixture', lease.ownerKey, lease.epoch);
    deferred.resolve(service);
    await loading;
    expect(service.loadBookContent).not.toHaveBeenCalled();
    expect(useReaderStore.getState().getViewState('fixture-pending')).toBeNull();
    expect(useReaderStore.getState().bookKeys).toEqual([]);
    expect(useBookDataStore.getState().booksData['fixture']).toBeUndefined();
    publishCloudSession(null);
  });
  test('concurrent views join one current book context without losing either key', async () => {
    const book: Book = {
      hash: 'fixture',
      title: 'Synthetic',
      author: 'Fixture',
      format: 'TXT',
      createdAt: 1,
      updatedAt: 2,
      libraryOrigin: { kind: 'local' },
    };
    vi.mocked(useLibraryStore.getState().getBookByHash).mockReturnValue(book);
    const file = new File(['Synthetic'], 'fixture.txt');
    const doc = { metadata: { title: 'Synthetic', language: 'en' } } as unknown as BookDoc;
    useBookDataStore.setState({
      booksData: {
        fixture: {
          id: 'fixture',
          book,
          file,
          bookDoc: doc,
          config: null,
          isFixedLayout: false,
          viewKeys: [],
        },
      },
    });
    const env = {
      getAppService: async () => ({
        loadBookConfig: async () => ({ viewSettings: {}, booknotes: [] }) as unknown as BookConfig,
      }),
    } as unknown as EnvConfigType;
    const context = (key: string) =>
      useReaderStore
        .getState()
        .initViewState(env, 'fixture', key)
        .then(() => useBookDataStore.getState().booksData['fixture']?.viewId);
    const identities = await Promise.all([context('fixture-one'), context('fixture-two')]);
    const stored = useBookDataStore.getState().booksData['fixture']!;
    expect(stored.viewKeys?.sort()).toEqual(['fixture-one', 'fixture-two']);
    expect(identities[0]).toBe(identities[1]);
    expect(stored.config?.localViewId).toBe(stored.viewId);
  });
  test('closing a view retires its shared book-data key', () => {
    useBookDataStore.setState({
      booksData: { hash: { viewKeys: ['hash-old', 'hash-other'] } },
    } as unknown as Parameters<typeof useBookDataStore.setState>[0]);
    useReaderStore.getState().clearViewState('hash-old');
    expect(useBookDataStore.getState().booksData['hash']?.viewKeys).toEqual(['hash-other']);
  });
  beforeEach(() => {
    useReaderStore.setState({
      viewStates: {},
      bookKeys: [],
      hoveredBookKey: null,
    });
    useBookDataStore.setState({ booksData: {} });
  });

  describe('initial state', () => {
    test('has empty viewStates and bookKeys', () => {
      const state = useReaderStore.getState();
      expect(state.viewStates).toEqual({});
      expect(state.bookKeys).toEqual([]);
      expect(state.hoveredBookKey).toBeNull();
    });
  });

  describe('setBookKeys', () => {
    test('sets bookKeys array', () => {
      useReaderStore.getState().setBookKeys(['book-1', 'book-2']);
      expect(useReaderStore.getState().bookKeys).toEqual(['book-1', 'book-2']);
    });

    test('replaces existing bookKeys', () => {
      useReaderStore.getState().setBookKeys(['a']);
      useReaderStore.getState().setBookKeys(['b', 'c']);
      expect(useReaderStore.getState().bookKeys).toEqual(['b', 'c']);
    });
  });

  describe('setHoveredBookKey', () => {
    test('sets hovered book key', () => {
      useReaderStore.getState().setHoveredBookKey('book-1');
      expect(useReaderStore.getState().hoveredBookKey).toBe('book-1');
    });

    test('can be set to null', () => {
      useReaderStore.getState().setHoveredBookKey('book-1');
      useReaderStore.getState().setHoveredBookKey(null);
      expect(useReaderStore.getState().hoveredBookKey).toBeNull();
    });
  });

  describe('getView / setView', () => {
    test('getView returns null for missing key', () => {
      expect(useReaderStore.getState().getView('nonexistent')).toBeNull();
    });

    test('getView returns null for null key', () => {
      expect(useReaderStore.getState().getView(null)).toBeNull();
    });

    test('setView stores a view and getView retrieves it', () => {
      const key = 'abc-0';
      seedViewState(key);

      const mockView = { tagName: 'FOLIATE-VIEW' } as unknown as FoliateView;
      useReaderStore.getState().setView(key, mockView);

      const retrieved = useReaderStore.getState().getView(key);
      expect(retrieved).toBe(mockView);
    });
  });

  describe('getViews', () => {
    test('returns all views from viewStates', () => {
      const view1 = { id: 'v1' } as unknown as FoliateView;
      const view2 = { id: 'v2' } as unknown as FoliateView;
      seedViewState('key1', { view: view1 });
      seedViewState('key2', { view: view2 });

      const views = useReaderStore.getState().getViews();
      expect(views).toHaveLength(2);
      expect(views).toContain(view1);
      expect(views).toContain(view2);
    });
  });

  describe('clearViewState', () => {
    test('removes a view state by key', () => {
      seedViewState('key-to-remove');
      seedViewState('key-to-keep');

      useReaderStore.getState().clearViewState('key-to-remove');
      const state = useReaderStore.getState();
      expect(state.viewStates['key-to-remove']).toBeUndefined();
      expect(state.viewStates['key-to-keep']).toBeDefined();
    });

    test('does nothing when key does not exist', () => {
      seedViewState('existing');
      useReaderStore.getState().clearViewState('nonexistent');
      expect(useReaderStore.getState().viewStates['existing']).toBeDefined();
    });
  });

  describe('getViewState', () => {
    test('returns null for missing key', () => {
      expect(useReaderStore.getState().getViewState('missing')).toBeNull();
    });

    test('returns the view state for existing key', () => {
      seedViewState('my-key');
      const vs = useReaderStore.getState().getViewState('my-key');
      expect(vs).not.toBeNull();
      expect(vs!.key).toBe('my-key');
    });
  });

  describe('setViewSettings / getViewSettings', () => {
    test('getViewSettings returns null for missing key', () => {
      expect(useReaderStore.getState().getViewSettings('missing')).toBeNull();
    });

    test('setViewSettings stores and getViewSettings retrieves settings', () => {
      const key = 'bookid-0';
      seedViewState(key, { isPrimary: false });

      // setViewSettings requires bookData to exist for the book id
      useBookDataStore.setState({
        booksData: {
          bookid: {
            id: 'bookid',
            book: null,
            file: null,
            config: { updatedAt: Date.now() },
            bookDoc: null,
            isFixedLayout: false,
          },
        },
      });

      const settings = { fontSize: 16 } as unknown as ViewSettings;
      useReaderStore.getState().setViewSettings(key, settings);

      const retrieved = useReaderStore.getState().getViewSettings(key);
      expect(retrieved).toEqual(settings);
    });

    test('setViewSettings does nothing for empty key', () => {
      useReaderStore.getState().setViewSettings('', { fontSize: 16 } as unknown as ViewSettings);
      // Should not throw or create new state
      expect(Object.keys(useReaderStore.getState().viewStates)).toHaveLength(0);
    });
  });

  describe('setBookmarkRibbonVisibility', () => {
    test('sets ribbonVisible on view state', () => {
      seedViewState('book-1');
      useReaderStore.getState().setBookmarkRibbonVisibility('book-1', true);
      expect(useReaderStore.getState().viewStates['book-1']!.ribbonVisible).toBe(true);

      useReaderStore.getState().setBookmarkRibbonVisibility('book-1', false);
      expect(useReaderStore.getState().viewStates['book-1']!.ribbonVisible).toBe(false);
    });
  });

  describe('setTTSEnabled', () => {
    test('sets ttsEnabled on view state', () => {
      seedViewState('book-1');
      useReaderStore.getState().setTTSEnabled('book-1', true);
      expect(useReaderStore.getState().viewStates['book-1']!.ttsEnabled).toBe(true);

      useReaderStore.getState().setTTSEnabled('book-1', false);
      expect(useReaderStore.getState().viewStates['book-1']!.ttsEnabled).toBe(false);
    });
  });

  describe('setIsLoading', () => {
    test('sets loading on view state', () => {
      seedViewState('book-1');
      useReaderStore.getState().setIsLoading('book-1', true);
      expect(useReaderStore.getState().viewStates['book-1']!.loading).toBe(true);

      useReaderStore.getState().setIsLoading('book-1', false);
      expect(useReaderStore.getState().viewStates['book-1']!.loading).toBe(false);
    });
  });

  describe('setIsSyncing', () => {
    test('sets syncing on view state', () => {
      seedViewState('book-1');
      useReaderStore.getState().setIsSyncing('book-1', true);
      expect(useReaderStore.getState().viewStates['book-1']!.syncing).toBe(true);

      useReaderStore.getState().setIsSyncing('book-1', false);
      expect(useReaderStore.getState().viewStates['book-1']!.syncing).toBe(false);
    });
  });

  describe('getGridInsets / setGridInsets', () => {
    test('getGridInsets returns default insets for missing key', () => {
      const insets = useReaderStore.getState().getGridInsets('missing');
      expect(insets).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
    });

    test('setGridInsets stores and getGridInsets retrieves insets', () => {
      seedViewState('book-1');
      const insets: Insets = { top: 10, right: 5, bottom: 20, left: 5 };
      useReaderStore.getState().setGridInsets('book-1', insets);
      expect(useReaderStore.getState().getGridInsets('book-1')).toEqual(insets);
    });

    test('setGridInsets can set null', () => {
      seedViewState('book-1');
      useReaderStore.getState().setGridInsets('book-1', { top: 1, right: 2, bottom: 3, left: 4 });
      useReaderStore.getState().setGridInsets('book-1', null);
      // getGridInsets falls back to default when gridInsets is null
      expect(useReaderStore.getState().getGridInsets('book-1')).toEqual({
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
      });
    });
  });

  describe('setViewInited', () => {
    test('sets inited on view state', () => {
      seedViewState('book-1');
      useReaderStore.getState().setViewInited('book-1', true);
      expect(useReaderStore.getState().viewStates['book-1']!.inited).toBe(true);

      useReaderStore.getState().setViewInited('book-1', false);
      expect(useReaderStore.getState().viewStates['book-1']!.inited).toBe(false);
    });
  });
});
