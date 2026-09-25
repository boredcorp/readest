import { SystemSettings } from '@/types/settings';
import {
  AppPlatform,
  AppService,
  BaseDir,
  DeleteAction,
  DistChannel,
  FileItem,
  FileSystem,
  OsPlatform,
  ResolvedPath,
  SelectDirectoryMode,
} from '@/types/system';
import { DatabaseOpts, DatabaseService } from '@/types/database';
import { SchemaType } from '@/services/database/migrate';
import { Book, BookConfig, BookContent, ImportBookOptions, ViewSettings } from '@/types/book';
import type { BookNav } from '@/services/nav';
import { getLibraryFilename, getLibraryBackupFilename } from '@/utils/book';

import { getOSPlatform } from '@/utils/misc';
import { ProgressHandler } from '@/utils/transfer';
import { CustomTextureInfo } from '@/styles/textures';
import { CustomFont, CustomFontInfo } from '@/styles/fonts';

import * as BookSvc from './bookService';
import * as CloudSvc from './cloudService';
import * as FontSvc from './fontService';
import * as ImageSvc from './imageService';
import * as LibrarySvc from './libraryService';
import * as Settings from './settingsService';
import { isOrdinaryCloudBook, isLegacyUnownedCloudBook } from './cloudLibraryModel';
import { getLocalBookFilename } from '@/utils/book';
import { assertCloudOrigin } from './cloudOwnerSession';
import { selectCloudCopy } from './cloudLibraryRepository';

export abstract class BaseAppService implements AppService {
  osPlatform: OsPlatform = getOSPlatform();
  appPlatform: AppPlatform = 'tauri';
  localBooksDir = '';
  isMobile = false;
  isMacOSApp = false;
  isLinuxApp = false;
  isAppDataSandbox = false;
  isAndroidApp = false;
  isIOSApp = false;
  isMobileApp = false;
  isPortableApp = false;
  isDesktopApp = false;
  isAppImage = false;
  isEink = false;
  hasTrafficLight = false;
  hasWindow = false;
  hasWindowBar = false;
  hasContextMenu = false;
  hasRoundedWindow = false;
  hasSafeAreaInset = false;
  hasHaptics = false;
  hasUpdater = false;
  hasOrientationLock = false;
  hasScreenBrightness = false;
  hasIAP = false;
  canCustomizeRootDir = false;
  canReadExternalDir = false;
  supportsCanvasContext2DFilter = true;
  distChannel = 'readest' as DistChannel;
  storefrontRegionCode: string | null = null;
  isOnlineCatalogsAccessible = true;

  protected CURRENT_MIGRATION_VERSION = 20251124;

  protected abstract fs: FileSystem;
  protected abstract resolvePath(fp: string, base: BaseDir): ResolvedPath;

  abstract init(): Promise<void>;
  abstract setCustomRootDir(customRootDir: string): Promise<void>;
  abstract selectDirectory(mode: SelectDirectoryMode): Promise<string>;
  abstract selectFiles(name: string, extensions: string[]): Promise<string[]>;
  abstract saveFile(
    filename: string,
    content: string | ArrayBuffer,
    options?: { filePath?: string; mimeType?: string },
  ): Promise<boolean>;
  abstract ask(message: string): Promise<boolean>;
  abstract openDatabase(
    schema: SchemaType,
    path: string,
    base: BaseDir,
    opts?: DatabaseOpts,
  ): Promise<DatabaseService>;

  protected async runMigrations(lastMigrationVersion: number): Promise<void> {
    if (lastMigrationVersion < 20251124) {
      try {
        await this.migrate20251124();
      } catch (error) {
        console.error('Error migrating to version 20251124:', error);
      }
    }
  }

  private async migrate20251124(): Promise<void> {
    console.log('Running migration for version 20251124 to rename the backup library file...');
    const oldBackupFilename = getLibraryBackupFilename();
    const newBackupFilename = `${getLibraryFilename()}.bak`;
    if (await this.fs.exists(oldBackupFilename, 'Books')) {
      try {
        const content = await this.fs.readFile(oldBackupFilename, 'Books', 'text');
        await this.fs.writeFile(newBackupFilename, 'Books', content);
        await this.fs.removeFile(oldBackupFilename, 'Books');
        console.log('Migration to rename backup library file completed successfully.');
      } catch (error) {
        console.error('Error during migration to rename backup library file:', error);
      }
    }
  }

  async prepareBooksDir() {
    this.localBooksDir = await this.fs.getPrefix('Books');
  }

  async openFile(path: string, base: BaseDir): Promise<File> {
    return await this.fs.openFile(path, base);
  }

  async copyFile(srcPath: string, dstPath: string, base: BaseDir): Promise<void> {
    return await this.fs.copyFile(srcPath, dstPath, base);
  }

  async readFile(path: string, base: BaseDir, mode: 'text' | 'binary') {
    return await this.fs.readFile(path, base, mode);
  }

  async writeFile(
    path: string,
    base: BaseDir,
    content: string | ArrayBuffer | File,
    guard?: () => void,
  ) {
    guard?.();
    return await this.fs.writeFile(path, base, content, guard);
  }

  async updateTextFile(path: string, base: BaseDir, update: (text: string | null) => string) {
    if (!this.fs.updateTextFile) throw new Error('Transactional persistence is unavailable');
    return this.fs.updateTextFile(path, base, update);
  }

  async createDir(path: string, base: BaseDir, recursive: boolean = true): Promise<void> {
    return await this.fs.createDir(path, base, recursive);
  }

  async deleteFile(path: string, base: BaseDir, guard?: () => void): Promise<void> {
    guard?.();
    return await this.fs.removeFile(path, base, guard);
  }

  async deleteDir(path: string, base: BaseDir, recursive: boolean = true): Promise<void> {
    return await this.fs.removeDir(path, base, recursive);
  }

  async resolveFilePath(path: string, base: BaseDir): Promise<string> {
    const prefix = await this.fs.getPrefix(base);
    return path ? `${prefix}/${path}` : prefix;
  }

  async readDirectory(path: string, base: BaseDir): Promise<FileItem[]> {
    return await this.fs.readDir(path, base);
  }

  async exists(path: string, base: BaseDir): Promise<boolean> {
    return await this.fs.exists(path, base);
  }

  async getImageURL(path: string): Promise<string> {
    return await this.fs.getImageURL(path);
  }

  private get settingsCtx(): Settings.Context {
    return {
      fs: this.fs,
      isMobile: this.isMobile,
      isEink: this.isEink,
      isAppDataSandbox: this.isAppDataSandbox,
    };
  }

  private get coverCtx(): BookSvc.CoverContext {
    return { fs: this.fs, appPlatform: this.appPlatform, localBooksDir: this.localBooksDir };
  }

  getDefaultViewSettings(): ViewSettings {
    return Settings.getDefaultViewSettings(this.settingsCtx);
  }

  async loadSettings(): Promise<SystemSettings> {
    const settings = await Settings.loadSettings(this.settingsCtx);
    this.localBooksDir = settings.localBooksDir;
    return settings;
  }

  async saveSettings(settings: SystemSettings): Promise<void> {
    await Settings.saveSettings(this.fs, settings);
  }

  getCoverImageUrl = (book: Book): string => BookSvc.getCoverImageUrl(this.coverCtx, book);

  getCoverImageBlobUrl = async (book: Book): Promise<string> =>
    BookSvc.getCoverImageBlobUrl(this.coverCtx, book);

  async getCachedImageUrl(pathOrUrl: string): Promise<string> {
    return BookSvc.getCachedImageUrl(this.coverCtx, pathOrUrl);
  }

  async generateCoverImageUrl(book: Book): Promise<string> {
    return BookSvc.generateCoverImageUrl(this.coverCtx, book);
  }

  async updateCoverImage(book: Book, imageUrl?: string, imageFile?: string): Promise<void> {
    return BookSvc.updateCoverImage(this.coverCtx, book, imageUrl, imageFile);
  }

  async importFont(file?: string | File): Promise<CustomFontInfo | null> {
    return FontSvc.importFont(this.fs, file);
  }

  async deleteFont(font: CustomFont): Promise<void> {
    return FontSvc.deleteFont(this.fs, font);
  }

  async importImage(file?: string | File): Promise<CustomTextureInfo | null> {
    return ImageSvc.importImage(this.fs, file);
  }

  async deleteImage(texture: CustomTextureInfo): Promise<void> {
    return ImageSvc.deleteImage(this.fs, texture);
  }

  async importBook(
    file: string | File,
    books: Book[],
    options: ImportBookOptions = {},
  ): Promise<Book | null> {
    const backing = await LibrarySvc.loadLocalLibraryBooks(this.fs);
    const localBooks = Array.from(
      new Map(
        [...backing, ...books.filter((book) => book.libraryOrigin?.kind !== 'cloud')]
          .filter((book) => isOrdinaryCloudBook(book) && !isLegacyUnownedCloudBook(book))
          .map((book) => [book.hash, { ...book }]),
      ).values(),
    );
    const before = new Map(localBooks.map((book) => [book.hash, { ...book }]));
    const imported = await BookSvc.importBook(this.fs, file, localBooks, {
      saveBookConfig: this.saveBookConfig.bind(this),
      generateCoverImageUrl: this.generateCoverImageUrl.bind(this),
      ...options,
      lookupIndex: BookSvc.buildBookLookupIndex(localBooks),
    });
    if (imported) {
      // A metadata-equivalent import can rename a hash. Patch persistence needs
      // an explicit tombstone for that old identity, not merely its omission.
      const currentHashes = new Set(localBooks.map((book) => book.hash));
      for (const [hash, old] of before) {
        if (!currentHashes.has(hash))
          localBooks.push({ ...old, deletedAt: Date.now(), updatedAt: Date.now() });
      }
      imported.libraryOrigin = { kind: 'local' };
      selectCloudCopy(imported.hash, false);
      const changedLocal = localBooks.filter(
        (book) =>
          book.hash === imported.hash ||
          JSON.stringify(book) !== JSON.stringify(before.get(book.hash)),
      );
      // Persist rename/duplicate tombstones even if a cloud row currently hides
      // that local identity. The projected list cannot represent both origins.
      await LibrarySvc.saveLibraryBooks(this.fs, changedLocal);
      if (
        books.some((book) => book.hash === imported.hash && book.libraryOrigin?.kind === 'cloud')
      ) {
        const { closeCloudBookViews } = await import('./ordinaryCloudLibrary');
        closeCloudBookViews(imported.hash);
      }
      const merged = new Map(books.map((book) => [book.hash, book]));
      for (const book of changedLocal) {
        if (book.hash === imported.hash || merged.get(book.hash)?.libraryOrigin?.kind !== 'cloud') {
          merged.set(book.hash, book);
        }
      }
      books.splice(0, books.length, ...merged.values());
    }
    return imported;
  }

  async deleteBook(book: Book, deleteAction: DeleteAction): Promise<void> {
    if (book.libraryOrigin?.kind === 'cloud') {
      const cloud = await import('./ordinaryCloudLibrary');
      return deleteAction === 'local'
        ? cloud.removeCloudDownload(this, book)
        : cloud.deleteOrdinaryCloudBook(this, book);
    }
    return CloudSvc.deleteBook(this.fs, book, deleteAction);
  }

  async uploadFileToCloud(
    lfp: string,
    cfp: string,
    base: BaseDir,
    handleProgress: ProgressHandler,
    hash: string,
    temp: boolean = false,
  ) {
    return CloudSvc.uploadFileToCloud(
      this.fs,
      this.resolveFilePath.bind(this),
      lfp,
      cfp,
      base,
      handleProgress,
      hash,
      temp,
    );
  }

  async uploadBook(book: Book, onProgress?: ProgressHandler): Promise<void> {
    if (this.appPlatform === 'web') throw new Error('Use the explicit cloud library upload action');
    return CloudSvc.uploadBook(this.fs, this.resolveFilePath.bind(this), book, onProgress);
  }

  async downloadCloudFile(lfp: string, cfp: string, onProgress: ProgressHandler) {
    return CloudSvc.downloadCloudFile(this, this.localBooksDir, lfp, cfp, onProgress);
  }

  async downloadBookCovers(books: Book[]): Promise<void> {
    return CloudSvc.downloadBookCovers(this, this.fs, this.localBooksDir, books);
  }

  async downloadBook(
    book: Book,
    onlyCover = false,
    redownload = false,
    onProgress?: ProgressHandler,
  ): Promise<void> {
    if (book.libraryOrigin?.kind === 'cloud') {
      const { downloadOrdinaryCloudBook } = await import('./ordinaryCloudLibrary');
      return downloadOrdinaryCloudBook(this, book);
    }
    return CloudSvc.downloadBook(
      this,
      this.fs,
      this.localBooksDir,
      book,
      onlyCover,
      redownload,
      onProgress,
    );
  }

  async exportBook(book: Book): Promise<boolean> {
    return BookSvc.exportBook(
      this.fs,
      book,
      this.resolveFilePath.bind(this),
      this.copyFile.bind(this),
      this.saveFile.bind(this),
    );
  }

  async refreshBookMetadata(book: Book): Promise<boolean> {
    return BookSvc.refreshBookMetadata(this.fs, book);
  }

  async isBookAvailable(book: Book): Promise<boolean> {
    return BookSvc.isBookAvailable(this.fs, book);
  }

  async getBookFileSize(book: Book): Promise<number | null> {
    return BookSvc.getBookFileSize(this.fs, book);
  }

  async loadBookContent(book: Book): Promise<BookContent> {
    assertCloudOrigin(book.libraryOrigin);
    if (
      book.libraryOrigin?.kind === 'cloud' &&
      !(await this.fs.exists(getLocalBookFilename(book), 'Books'))
    ) {
      assertCloudOrigin(book.libraryOrigin);
      await this.downloadBook(book);
    }
    return BookSvc.loadBookContent(this.fs, book);
  }

  async loadBookConfig(book: Book, settings: SystemSettings): Promise<BookConfig> {
    return BookSvc.loadBookConfig(this.fs, book, settings);
  }

  async fetchBookDetails(book: Book) {
    return BookSvc.fetchBookDetails(this.fs, book, this.downloadBook.bind(this));
  }

  async saveBookConfig(
    book: Book,
    config: BookConfig,
    settings?: SystemSettings,
    guard?: () => void,
  ) {
    return BookSvc.saveBookConfig(this.fs, book, config, settings, guard);
  }

  async loadBookNav(book: Book) {
    return BookSvc.loadBookNav(this.fs, book);
  }

  async saveBookNav(book: Book, nav: BookNav) {
    return BookSvc.saveBookNav(this.fs, book, nav);
  }

  async loadLibraryBooks(): Promise<Book[]> {
    return LibrarySvc.loadLibraryBooks(this.fs, this.generateCoverImageUrl.bind(this));
  }

  async loadLocalLibraryBooks(): Promise<Book[]> {
    return LibrarySvc.loadLocalLibraryBooks(this.fs);
  }

  async saveLibraryBooks(books: Book[], guard?: () => void): Promise<void> {
    return LibrarySvc.saveLibraryBooks(this.fs, books, guard);
  }
}
