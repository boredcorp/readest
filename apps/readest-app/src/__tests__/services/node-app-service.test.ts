import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { File as NativeFile, Blob as NativeBlob } from 'node:buffer';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { NodeAppService } from '@/services/nodeAppService';
import { fsTests } from './suites/fs-tests';
import { libraryTests } from './suites/library-tests';
import { bookTests } from './suites/book-tests';
import type { Book } from '@/types/book';
import { TextReader, Uint8ArrayWriter, ZipWriter } from '@zip.js/zip.js';
import { configureZip } from '@/utils/zip';
import { publishCloudSession, captureCloudLease } from '@/services/cloudOwnerSession';
import { selectCloudCopy } from '@/services/cloudLibraryRepository';
import { useBookDataStore } from '@/store/bookDataStore';

async function ownershipFixture(text: string, identifier = 'ownership-fixture'): Promise<File> {
  configureZip();
  const zip = new ZipWriter(new Uint8ArrayWriter());
  await zip.add('mimetype', new TextReader('application/epub+zip'), { level: 0 });
  await zip.add(
    'META-INF/container.xml',
    new TextReader(
      '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
    ),
  );
  await zip.add(
    'content.opf',
    new TextReader(
      `<package version="3.0" xmlns="http://www.idpf.org/2007/opf" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">${identifier}</dc:identifier><dc:title>Ownership fixture</dc:title><dc:creator>Synthetic</dc:creator><dc:language>en</dc:language></metadata><manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter"/></spine></package>`,
    ),
  );
  await zip.add(
    'chapter.xhtml',
    new TextReader(
      `<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Fixture</title></head><body><p>${text}</p></body></html>`,
    ),
  );
  return new File([await zip.close()], 'Ownership fixture.epub');
}

const FIXTURES_DIR = path.join(process.cwd(), 'src/__tests__/fixtures/data');

async function getBookFile(name: string): Promise<File> {
  const buf = await fsp.readFile(path.join(FIXTURES_DIR, name));
  return new File([buf], name);
}

const SANDBOX_DIR = path.join(process.cwd(), '.test-sandbox-node');

describe('NodeAppService', () => {
  let tmpDir: string;
  let service: NodeAppService;

  beforeAll(async () => {
    vi.stubGlobal('Blob', NativeBlob);
    vi.stubGlobal('File', NativeFile);
    await fsp.mkdir(SANDBOX_DIR, { recursive: true });
  });

  afterAll(async () => {
    await fsp.rm(SANDBOX_DIR, { recursive: true, force: true });
    vi.unstubAllGlobals();
  });

  beforeEach(async () => {
    publishCloudSession(null);
    tmpDir = await fsp.mkdtemp(path.join(SANDBOX_DIR, 'node-'));
    service = new NodeAppService(tmpDir);
    await service.init();
  });

  afterEach(async () => {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  });

  it('should copy files from absolute path', async () => {
    const srcPath = path.join(tmpDir, 'source.txt');
    await fsp.writeFile(srcPath, 'copy me');
    await service.copyFile(srcPath, 'copied.txt', 'Data');
    const content = await service.readFile('copied.txt', 'Data', 'text');
    expect(content).toBe('copy me');
  });

  it('should save files via saveFile', async () => {
    const filepath = path.join(tmpDir, 'saved.txt');
    const result = await service.saveFile('saved.txt', 'saved content', { filePath: filepath });
    expect(result).toBe(true);
    const content = await fsp.readFile(filepath, 'utf-8');
    expect(content).toBe('saved content');
  });

  it('should set localBooksDir after init', () => {
    expect(service.localBooksDir).toBe(path.join(tmpDir, 'Readest', 'Books'));
  });

  it('should resolve file paths correctly', async () => {
    const resolved = await service.resolveFilePath('test.json', 'Books');
    expect(resolved).toBe(path.join(tmpDir, 'Readest', 'Books', 'test.json'));
  });

  it('should resolve empty path to prefix', async () => {
    const resolved = await service.resolveFilePath('', 'Data');
    expect(resolved).toBe(path.join(tmpDir, 'Readest'));
  });

  it('should switch to new root via setCustomRootDir', async () => {
    const newRoot = await fsp.mkdtemp(path.join(SANDBOX_DIR, 'custom-'));
    try {
      await service.setCustomRootDir(newRoot);
      expect(service.localBooksDir).toBe(path.join(newRoot, 'Readest', 'Books'));
      await service.writeFile('test.txt', 'Settings', 'settings data');
      const content = await service.readFile('test.txt', 'Settings', 'text');
      expect(content).toBe('settings data');
    } finally {
      await fsp.rm(newRoot, { recursive: true, force: true });
    }
  });

  it('should use system dirs when no customRootDir', async () => {
    const defaultService = new NodeAppService();
    const settingsPrefix = await defaultService.resolveFilePath('', 'Settings');
    expect(settingsPrefix).toBeTruthy();
    expect(path.isAbsolute(settingsPrefix)).toBe(true);
    expect(settingsPrefix.toLowerCase()).toContain('readest');
  });

  fsTests(() => service);
  it('persists an old-hash tombstone when an import migrates equal metadata to different bytes', async () => {
    await service.createDir('', 'Books', true);
    const books: Book[] = [];
    const first = await service.importBook(
      await ownershipFixture('Fictional first version.'),
      books,
    );
    expect(first).not.toBeNull();
    const oldHash = first!.hash;
    const settings = await service.loadSettings();
    const config = await service.loadBookConfig(first!, settings);
    await service.saveBookConfig(
      first!,
      { ...config, updatedAt: 2, progress: [3, 10], location: 'fixture-position' },
      settings,
    );
    await service.saveLibraryBooks(books);
    const second = await service.importBook(
      await ownershipFixture('Fictional second version, with different bytes.'),
      books,
    );
    expect(second).not.toBeNull();
    expect(second!.hash).not.toBe(oldHash);
    await service.saveLibraryBooks(books);
    const reloaded = await service.loadLibraryBooks();
    expect(reloaded.filter((book) => !book.deletedAt).map((book) => book.hash)).toEqual([
      second!.hash,
    ]);
    expect(reloaded.find((book) => book.hash === oldHash)?.deletedAt).toBeTruthy();
    expect((await service.loadBookConfig(second!, settings)).progress).toEqual([3, 10]);
  });
  it('preserves an unrelated selected cloud origin and reader context during local import', async () => {
    await service.createDir('', 'Books', true);
    const books: Book[] = [];
    const localFile = await ownershipFixture('Local collision.');
    const local = (await service.importBook(localFile, books))!;
    await service.saveLibraryBooks(books);
    publishCloudSession({ subject: 'fixture-A', token: 'synthetic' });
    const lease = await captureCloudLease();
    // Native service is only used to exercise actual import and disk persistence;
    // supply the sidecar directly because cloud networking requires web storage.
    await service.createDir(`cloud/v1/${lease.ownerKey}`, 'Books', true);
    await service.writeFile(
      `cloud/v1/${lease.ownerKey}/library.json`,
      'Books',
      JSON.stringify({
        schemaVersion: 1,
        ownerKey: lease.ownerKey,
        revision: 1,
        booksCursor: 0,
        entries: {
          [local.hash]: {
            book: { ...local, uploadedAt: 1, libraryOrigin: undefined, title: 'Cloud collision' },
            state: 'ready',
            revision: 1,
          },
        },
      }),
    );
    selectCloudCopy(local.hash, true);
    const projected = await service.loadLibraryBooks();
    const cloud = projected.find((book) => book.hash === local.hash)!;
    const context = {
      id: local.hash,
      book: cloud,
      viewId: 'active',
      viewKeys: [`${local.hash}-active`],
      file: null,
      config: null,
      bookDoc: null,
      isFixedLayout: false,
    };
    useBookDataStore.setState({ booksData: { [local.hash]: context } });
    await service.importBook(await ownershipFixture('Unrelated book.', 'other-fixture'), projected);
    expect(projected.find((book) => book.hash === local.hash)?.libraryOrigin).toEqual(
      cloud.libraryOrigin,
    );
    expect(projected.find((book) => book.hash === local.hash)?.title).toBe('Cloud collision');
    expect(useBookDataStore.getState().booksData[local.hash]).toBe(context);
    const backing = JSON.parse(
      (await service.readFile('library.json', 'Books', 'text')) as string,
    ) as Book[];
    expect(backing.find((book) => book.hash === local.hash)?.title).toBe(local.title);
    await service.importBook(localFile, projected);
    expect(projected.find((book) => book.hash === local.hash)?.libraryOrigin?.kind).toBe('local');
    expect(
      (await service.loadLibraryBooks()).find((book) => book.hash === local.hash)?.libraryOrigin
        ?.kind,
    ).toBe('local');
  });
  libraryTests(() => service);
  bookTests(() => service, getBookFile);
});
