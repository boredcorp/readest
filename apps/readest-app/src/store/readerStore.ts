import { create } from 'zustand';

import {
  BookContent,
  BookConfig,
  PageInfo,
  BookProgress,
  ViewSettings,
  TimeInfo,
  FIXED_LAYOUT_FORMATS,
} from '@/types/book';
import { Insets } from '@/types/misc';
import { EnvConfigType } from '@/services/environment';
import { FoliateView } from '@/types/view';
import { DocumentLoader, TOCItem } from '@/libs/document';
import { BOOK_NAV_VERSION, computeBookNav, hydrateBookNav, updateToc } from '@/services/nav';
import { formatTitle, getMetadataHash, getPrimaryLanguage } from '@/utils/book';
import { getBaseFilename } from '@/utils/path';
import { SUPPORTED_LANGNAMES } from '@/services/constants';
import { useSettingsStore } from './settingsStore';
import { BookData, useBookDataStore } from './bookDataStore';
import { useLibraryStore } from './libraryStore';
import { uniqueId } from '@/utils/misc';
import {
  assertCloudOrigin,
  isCurrentCloudOrigin,
  subscribeCloudSession,
} from '@/services/cloudOwnerSession';
import { sameLibraryOrigin, type LibraryOrigin } from '@/services/cloudLibraryModel';

const pendingLoads = new Map<string, symbol>();

/** Retire owner views even while initialization has not created BookData yet. */
export function retireCloudBookViews(hash: string, ownerKey: string, epoch: number): void {
  const reader = useReaderStore.getState();
  const data = useBookDataStore.getState().booksData[hash];
  const belongsToOwner = (origin?: LibraryOrigin) =>
    origin?.kind === 'cloud' && origin.ownerKey === ownerKey && origin.epoch === epoch;
  const retired = new Set<string>();
  for (const key of new Set([...reader.bookKeys, ...Object.keys(reader.viewStates)])) {
    if (key.split('-')[0] !== hash) continue;
    const origin = reader.viewStates[key]?.origin ?? data?.book?.libraryOrigin;
    if (!belongsToOwner(origin)) continue;
    try {
      reader.getView(key)?.close();
      reader.getView(key)?.remove();
    } catch {
      /* retire state regardless */
    }
    reader.clearViewState(key);
    retired.add(key);
  }
  reader.setBookKeys(reader.bookKeys.filter((key) => !retired.has(key)));
  if (belongsToOwner(data?.book?.libraryOrigin)) useBookDataStore.getState().clearBookData(hash);
}

interface ViewState {
  origin?: LibraryOrigin;
  /* Unique key for each book view */
  key: string;
  view: FoliateView | null;
  viewerKey: string;
  isPrimary: boolean;
  loading: boolean;
  inited: boolean;
  error: string | null;
  progress: BookProgress | null;
  ribbonVisible: boolean;
  ttsEnabled: boolean;
  syncing: boolean;
  gridInsets: Insets | null;
  /* View settings for the view: 
    generally view settings have a hierarchy of global settings < book settings < view settings
    view settings for primary view are saved to book config which is persisted to config file
    omitting settings that are not changed from global settings */
  viewSettings: ViewSettings | null;
}

interface ReaderStore {
  viewStates: { [key: string]: ViewState };
  bookKeys: string[];
  hoveredBookKey: string | null;
  setBookKeys: (keys: string[]) => void;
  setHoveredBookKey: (key: string | null) => void;
  setBookmarkRibbonVisibility: (key: string, visible: boolean) => void;
  setTTSEnabled: (key: string, enabled: boolean) => void;
  setIsLoading: (key: string, loading: boolean) => void;
  setIsSyncing: (key: string, syncing: boolean) => void;
  setProgress: (
    key: string,
    location: string,
    tocItem: TOCItem,
    section: PageInfo,
    pageinfo: PageInfo,
    timeinfo: TimeInfo,
    range: Range,
  ) => void;
  getProgress: (key: string) => BookProgress | null;
  setView: (key: string, view: FoliateView) => void;
  getView: (key: string | null) => FoliateView | null;
  getViews: () => FoliateView[];
  getViewsById: (id: string) => FoliateView[];
  setViewSettings: (key: string, viewSettings: ViewSettings) => void;
  getViewSettings: (key: string) => ViewSettings | null;

  initViewState: (
    envConfig: EnvConfigType,
    id: string,
    key: string,
    isPrimary?: boolean,
    reload?: boolean,
  ) => Promise<void>;
  clearViewState: (key: string) => void;
  getViewState: (key: string) => ViewState | null;
  getGridInsets: (key: string) => Insets | null;
  setGridInsets: (key: string, insets: Insets | null) => void;
  setViewInited: (key: string, inited: boolean) => void;
  recreateViewer: (envConfig: EnvConfigType, key: string) => void;
}

export const useReaderStore = create<ReaderStore>((set, get) => ({
  viewStates: {},
  bookKeys: [],
  hoveredBookKey: null,
  setBookKeys: (keys: string[]) => set({ bookKeys: keys }),
  setHoveredBookKey: (key: string | null) => set({ hoveredBookKey: key }),
  getView: (key: string | null) => (key && get().viewStates[key]?.view) || null,
  setView: (key: string, view) =>
    set((state) => ({
      viewStates: {
        ...state.viewStates,
        [key]: { ...state.viewStates[key]!, view },
      },
    })),
  getViews: () => Object.values(get().viewStates).map((state) => state.view!),
  getViewsById: (id: string) => {
    const { viewStates } = get();
    return Object.values(viewStates)
      .filter((state) => state.key && state.key.startsWith(id))
      .map((state) => state.view!);
  },

  clearViewState: (key: string) => {
    pendingLoads.delete(key);
    const hash = key.split('-')[0]!;
    useBookDataStore.setState((state) => {
      const data = state.booksData[hash];
      if (!data?.viewKeys) return state;
      return {
        booksData: {
          ...state.booksData,
          [hash]: { ...data, viewKeys: data.viewKeys.filter((viewKey) => viewKey !== key) },
        },
      };
    });
    set((state) => {
      const viewStates = { ...state.viewStates };
      delete viewStates[key];
      return { viewStates };
    });
  },
  getViewState: (key: string) => get().viewStates[key] || null,
  initViewState: async (
    envConfig: EnvConfigType,
    id: string,
    key: string,
    isPrimary = true,
    reload = false,
  ) => {
    const booksData = useBookDataStore.getState().booksData;
    const sourceBook = useLibraryStore.getState().getBookByHash(id);
    if (!sourceBook) throw new Error('Book not found');
    const book = { ...sourceBook };
    if (book.cloudOperation === 'delete_pending' || book.cloudOperation === 'upload_pending')
      throw new Error('Finish the pending cloud operation first');
    const bookData =
      booksData[id]?.book && sameLibraryOrigin(booksData[id]!.book!, book)
        ? booksData[id]
        : undefined;
    const loadId = Symbol(key);
    pendingLoads.set(key, loadId);
    const check = () => {
      assertCloudOrigin(book.libraryOrigin);
      const current = useLibraryStore.getState().getBookByHash(id);
      if (pendingLoads.get(key) !== loadId || !current || !sameLibraryOrigin(current, book))
        throw new DOMException('Book view changed', 'AbortError');
    };
    check();
    set((state) => ({
      viewStates: {
        ...state.viewStates,
        [key]: {
          key: '',
          origin: book.libraryOrigin,
          view: null,
          viewerKey: '',
          isPrimary: false,
          loading: true,
          inited: false,
          error: null,
          progress: null,
          ribbonVisible: false,
          ttsEnabled: false,
          syncing: false,
          gridInsets: null,
          viewSettings: null,
        },
      },
    }));
    try {
      const appService = await envConfig.getAppService();
      check();
      const { settings } = useSettingsStore.getState();
      let bookDoc = bookData?.bookDoc;
      let file = bookData?.file;
      if (!bookDoc || !file || reload) {
        const content = (await appService.loadBookContent(book)) as BookContent;
        check();
        file = content.file;
        console.log('Loading book', key);
        const doc = await new DocumentLoader(file).open();
        check();
        bookDoc = doc.book;
      }
      let config = await appService.loadBookConfig(book, settings);
      check();
      const viewId =
        bookData?.viewId && bookData.viewKeys?.length && !reload
          ? bookData.viewId
          : crypto.randomUUID();
      config.localViewId = viewId;
      // Import annotations from third-party readers on first open
      if (bookDoc.metadata.identifier) {
        const { getAnnotationProviders } = await import('@/services/annotation');
        check();
        for (const provider of getAnnotationProviders()) {
          if (provider.isAvailable(appService)) {
            const merged = await provider.importAnnotations(
              appService,
              bookDoc.metadata.identifier,
              config,
            );
            check();
            if (merged !== config) {
              Object.assign(config, merged);
              await appService.saveBookConfig(book, config, settings, check);
              check();
            }
          }
        }
      }
      // Filter out invalid booknotes
      config.booknotes = config.booknotes?.filter((booknote) => booknote.cfi) ?? [];
      // Load cached book navigation (TOC + section fragments) or compute and persist.
      if (book.format === 'EPUB' && bookDoc.rendition?.layout !== 'pre-paginated') {
        const cachedNav = await appService.loadBookNav(book);
        check();
        if (cachedNav?.version === BOOK_NAV_VERSION && process.env.NODE_ENV === 'production') {
          hydrateBookNav(bookDoc, cachedNav);
        } else {
          const freshNav = await computeBookNav(bookDoc);
          check();
          hydrateBookNav(bookDoc, freshNav);
          try {
            await appService.saveBookNav(book, freshNav);
            check();
          } catch (e) {
            console.warn('Failed to persist book nav cache:', e);
          }
        }
      }
      await updateToc(
        bookDoc,
        config.viewSettings?.sortedTOC ?? false,
        config.viewSettings?.convertChineseVariant ?? 'none',
      );
      check();
      if (!bookDoc.metadata.title) {
        bookDoc.metadata.title = getBaseFilename(file.name);
      }
      if (book.libraryOrigin?.kind !== 'cloud')
        book.sourceTitle = formatTitle(bookDoc.metadata.title);
      // Correct language codes mistakenly set with language names
      if (typeof bookDoc.metadata?.language === 'string') {
        if (bookDoc.metadata.language in SUPPORTED_LANGNAMES) {
          bookDoc.metadata.language = SUPPORTED_LANGNAMES[bookDoc.metadata.language]!;
        }
      }
      // Set the book's language for formerly imported books, newly imported books have this field set
      const primaryLanguage = getPrimaryLanguage(bookDoc.metadata.language);
      book.primaryLanguage = book.primaryLanguage ?? primaryLanguage;
      book.metadata = book.metadata ?? bookDoc.metadata;

      // Update series info from metadata if available and not already set on the book
      if (bookDoc.metadata.belongsTo?.series) {
        const belongsTo = bookDoc.metadata.belongsTo.series;
        const series = Array.isArray(belongsTo) ? belongsTo[0] : belongsTo;
        if (series) {
          book.metadata.series = book.metadata.series ?? formatTitle(series.name);
          book.metadata.seriesIndex =
            book.metadata.seriesIndex ?? parseFloat(series.position || '0');
        }
      }
      // TODO: uncomment this when we can ensure metaHash is correctly generated for all books
      // book.metaHash = book.metaHash ?? getMetadataHash(bookDoc.metadata);
      book.metaHash = getMetadataHash(bookDoc.metadata);

      const isFixedLayout =
        bookDoc.rendition?.layout === 'pre-paginated' || FIXED_LAYOUT_FORMATS.has(book.format);
      check();
      // Parallel URL keys can finish after another view established the shared
      // context. Join its current identity/config; never revive retired keys.
      const latest = useBookDataStore.getState().booksData[id];
      const current = latest?.book && sameLibraryOrigin(latest.book, book) ? latest : undefined;
      const activeKeys = current?.viewKeys ?? [];
      const sharedViewId =
        !reload && activeKeys.length && current?.viewId ? current.viewId : viewId;
      if (!reload && activeKeys.length && current?.config) config = current.config;
      config.localViewId = sharedViewId;
      const newBookData: BookData = {
        id,
        book,
        file,
        config,
        bookDoc,
        isFixedLayout,
        viewId: sharedViewId,
        viewKeys: Array.from(new Set([...activeKeys, key])),
      };
      useBookDataStore.setState((state) => ({
        booksData: {
          ...state.booksData,
          [id]: newBookData,
        },
      }));
      const configViewSettings = config.viewSettings!;
      const globalViewSettings = settings.globalViewSettings;
      set((state) => ({
        viewStates: {
          ...state.viewStates,
          [key]: {
            ...state.viewStates[key],
            key,
            view: null,
            viewerKey: `${key}-${uniqueId()}`,
            isPrimary,
            loading: false,
            inited: false,
            error: null,
            progress: null,
            ribbonVisible: false,
            ttsEnabled: false,
            syncing: false,
            gridInsets: null,
            viewSettings: { ...globalViewSettings, ...configViewSettings },
          },
        },
      }));
    } catch (error) {
      if (pendingLoads.get(key) !== loadId || !isCurrentCloudOrigin(book.libraryOrigin)) return;
      console.error(error);
      set((state) => ({
        viewStates: {
          ...state.viewStates,
          [key]: {
            ...state.viewStates[key],
            key: '',
            view: null,
            viewerKey: '',
            isPrimary: false,
            loading: false,
            inited: false,
            error: 'Failed to load book.',
            progress: null,
            ribbonVisible: false,
            ttsEnabled: false,
            syncing: false,
            gridInsets: null,
            viewSettings: null,
          },
        },
      }));
      throw error;
    }
  },
  getViewSettings: (key: string) => get().viewStates[key]?.viewSettings || null,
  setViewSettings: (key: string, viewSettings: ViewSettings) => {
    if (!key) return;
    const id = key.split('-')[0]!;
    const bookData = useBookDataStore.getState().booksData[id];
    const viewState = get().viewStates[key];
    if (!viewState || !bookData) return;
    if (viewState.isPrimary) {
      useBookDataStore.setState((state) => ({
        booksData: {
          ...state.booksData,
          [id]: {
            ...bookData,
            config: {
              ...bookData.config,
              updatedAt: Date.now(),
              viewSettings,
            },
          },
        },
      }));
    }
    set((state) => ({
      viewStates: {
        ...state.viewStates,
        [key]: {
          ...state.viewStates[key]!,
          viewSettings,
        },
      },
    }));
  },
  getProgress: (key: string) => get().viewStates[key]?.progress || null,
  setProgress: (
    key: string,
    location: string,
    tocItem: TOCItem,
    section: PageInfo,
    pageinfo: PageInfo,
    timeinfo: TimeInfo,
    range: Range,
  ) =>
    set((state) => {
      const id = key.split('-')[0]!;
      const bookData = useBookDataStore.getState().booksData[id];
      const viewState = state.viewStates[key];
      if (!viewState || !bookData) return state;
      if (
        bookData.book &&
        (!isCurrentCloudOrigin(bookData.book.libraryOrigin) ||
          !sameLibraryOrigin(bookData.book, {
            ...bookData.book,
            libraryOrigin: viewState.origin,
          }) ||
          (bookData.viewKeys && !bookData.viewKeys.includes(key)))
      )
        return state;

      const pageInfo = bookData.isFixedLayout ? section : pageinfo;
      const progress: [number, number] = [pageInfo.current + 1, pageInfo.total];
      const progressPercentage = Math.round((progress[0] / progress[1]) * 100);

      // Lightweight library update — O(1) lookup, no array copy, no refreshGroups
      const { getBookByHash, updateBookProgress } = useLibraryStore.getState();
      const existingBook = getBookByHash(id);
      if (existingBook) {
        let newReadingStatus = existingBook.readingStatus;
        if (existingBook.readingStatus === 'unread') {
          newReadingStatus = undefined;
        }
        if (progressPercentage >= 100 && existingBook.readingStatus !== 'finished') {
          newReadingStatus = 'finished';
        }
        updateBookProgress(id, progress, newReadingStatus);
      }

      const oldConfig = bookData.config;
      const newConfig = {
        ...bookData.config,
        progress,
        location,
      } as BookConfig;

      useBookDataStore.setState((state) => ({
        booksData: {
          ...state.booksData,
          [id]: {
            ...bookData,
            config: viewState.isPrimary ? newConfig : oldConfig,
          },
        },
      }));

      return {
        viewStates: {
          ...state.viewStates,
          [key]: {
            ...viewState,
            progress: {
              ...viewState.progress,
              location,
              sectionHref: tocItem?.href,
              sectionLabel: tocItem?.label,
              section,
              pageinfo,
              timeinfo,
              index: section.current,
              range,
              page: pageInfo.current + 1,
            } as BookProgress,
          },
        },
      };
    }),
  setBookmarkRibbonVisibility: (key: string, visible: boolean) =>
    set((state) => ({
      viewStates: {
        ...state.viewStates,
        [key]: {
          ...state.viewStates[key]!,
          ribbonVisible: visible,
        },
      },
    })),

  setTTSEnabled: (key: string, enabled: boolean) =>
    set((state) => ({
      viewStates: {
        ...state.viewStates,
        [key]: {
          ...state.viewStates[key]!,
          ttsEnabled: enabled,
        },
      },
    })),

  setIsLoading: (key: string, loading: boolean) =>
    set((state) => ({
      viewStates: {
        ...state.viewStates,
        [key]: {
          ...state.viewStates[key]!,
          loading,
        },
      },
    })),

  setIsSyncing: (key: string, syncing: boolean) =>
    set((state) => ({
      viewStates: {
        ...state.viewStates,
        [key]: {
          ...state.viewStates[key]!,
          syncing,
        },
      },
    })),

  getGridInsets: (key: string) =>
    get().viewStates[key]?.gridInsets || { top: 0, right: 0, bottom: 0, left: 0 },
  setGridInsets: (key: string, insets: Insets | null) =>
    set((state) => ({
      viewStates: {
        ...state.viewStates,
        [key]: {
          ...state.viewStates[key]!,
          gridInsets: insets,
        },
      },
    })),

  setViewInited: (key: string, inited: boolean) =>
    set((state) => ({
      viewStates: {
        ...state.viewStates,
        [key]: {
          ...state.viewStates[key]!,
          inited,
        },
      },
    })),

  recreateViewer: (envConfig: EnvConfigType, key: string) => {
    const id = key.split('-')[0]!;
    get()
      .initViewState(envConfig, id, key, true, true)
      .then(() => {
        set((state) => ({
          viewStates: {
            ...state.viewStates,
            [key]: {
              ...state.viewStates[key]!,
              viewerKey: `${key}-${uniqueId()}`,
            },
          },
        }));
      });
  },
}));

subscribeCloudSession(() => {
  const store = useReaderStore.getState();
  const removed = new Set<string>();
  for (const [key, state] of Object.entries(store.viewStates)) {
    if (state.origin?.kind !== 'cloud') continue;
    removed.add(key);
    store.clearViewState(key);
    try {
      state.view?.close();
      state.view?.remove();
    } catch {
      /* invalidated regardless */
    }
  }
  store.setBookKeys(store.bookKeys.filter((key) => !removed.has(key)));
});
