import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebAppService } from '@/services/webAppService';
import { fsTests } from './suites/fs-tests';
import { libraryTests } from './suites/library-tests';
import { bookTests } from './suites/book-tests';
import {
  publishCloudSession,
  captureCloudLease,
  assertCloudLease,
} from '@/services/cloudOwnerSession';
import { updateCloudLibrary, readCloudLibrary } from '@/services/cloudLibraryRepository';
import type { Book } from '@/types/book';

/** Keep an independent connection's transaction active until explicitly released. */
async function holdWriteTransaction() {
  const opened = indexedDB.open('AppFileSystem', 1);
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    opened.onsuccess = () => resolve(opened.result);
    opened.onerror = () => reject(opened.error);
  });
  let hold = true;
  const tx = db.transaction('files', 'readwrite');
  const store = tx.objectStore('files');
  const pump = () => {
    const request = store.get('fixture-blocker');
    request.onsuccess = () => {
      if (hold) pump();
    };
  };
  pump();
  const done = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
  return {
    release: () => {
      hold = false;
    },
    done,
  };
}

function nextWriteQueued() {
  const queued = Promise.withResolvers<void>();
  const original = IDBDatabase.prototype.transaction;
  vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(function (
    this: IDBDatabase,
    ...args: Parameters<IDBDatabase['transaction']>
  ) {
    const tx = original.apply(this, args);
    if (args[1] === 'readwrite') queued.resolve();
    return tx;
  });
  return queued.promise;
}

async function getBookFile(name: string): Promise<File> {
  const url = new URL(`../fixtures/data/${name}`, import.meta.url).href;
  const response = await fetch(url);
  const blob = await response.blob();
  return new File([blob], name, { type: blob.type });
}

/** Clear all records from the IndexedDB object store without deleting the database. */
async function clearStore() {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('AppFileSystem', 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('files')) {
        db.createObjectStore('files', { keyPath: 'path' });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('files', 'readwrite');
      tx.objectStore('files').clear();
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    };
    request.onerror = () => reject(request.error);
  });
}

describe('WebAppService', () => {
  let service: WebAppService;

  beforeEach(async () => {
    publishCloudSession(null);
    await clearStore();
    service = new WebAppService();
    await service.init();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    publishCloudSession(null);
  });

  it('serializes cloud sidecar updates from separate IndexedDB connections', async () => {
    publishCloudSession({ subject: 'fixture-A', token: 'synthetic-A' });
    const lease = await captureCloudLease();
    const second = new WebAppService();
    const add = (hash: string) => (library: Awaited<ReturnType<typeof readCloudLibrary>>) => {
      const book: Book = {
        hash,
        title: 'Synthetic',
        author: 'Fixture',
        format: 'EPUB',
        createdAt: 1,
        updatedAt: 2,
      };
      library.entries[hash] = { book, state: 'ready', revision: 1 };
      return library;
    };
    await Promise.all([
      updateCloudLibrary(service, lease, add('1'.repeat(32))),
      updateCloudLibrary(second, lease, add('2'.repeat(32))),
    ]);
    expect(Object.keys((await readCloudLibrary(service, lease)).entries).sort()).toEqual([
      '1'.repeat(32),
      '2'.repeat(32),
    ]);
  });

  it('rejects owner metadata and cursor changes queued behind another connection after account switch', async () => {
    publishCloudSession({ subject: 'fixture-A', token: 'synthetic-A' });
    const lease = await captureCloudLease();
    await updateCloudLibrary(service, lease, (library) => library);
    const blocker = await holdWriteTransaction();
    const queued = nextWriteQueued();
    const updating = updateCloudLibrary(service, lease, (library) => ({
      ...library,
      booksCursor: 20,
    }));
    const rejected = expect(updating).rejects.toThrow();
    try {
      await queued;
      publishCloudSession({ subject: 'fixture-B', token: 'synthetic-B' });
    } finally {
      blocker.release();
    }
    await Promise.all([blocker.done, rejected]);
    const text = await service.readFile(`cloud/v1/${lease.ownerKey}/library.json`, 'Books', 'text');
    expect(JSON.parse(text as string).booksCursor).toBe(0);
  });

  it.each(['owner', 'view'])(
    'rejects a queued config write when its %s becomes stale',
    async (kind) => {
      publishCloudSession({ subject: 'fixture-A', token: 'synthetic-A' });
      const lease = await captureCloudLease();
      let activeView = true;
      const guard = () => {
        assertCloudLease(lease);
        if (!activeView) throw new DOMException('View changed', 'AbortError');
      };
      const path = `cloud/v1/${lease.ownerKey}/${'1'.repeat(32)}/config.json`;
      await service.writeFile(path, 'Books', 'original');
      const blocker = await holdWriteTransaction();
      const queued = nextWriteQueued();
      const writing = service.writeFile(path, 'Books', 'stale config', guard);
      const rejected = expect(writing).rejects.toThrow();
      try {
        await queued;
        if (kind === 'owner') publishCloudSession(null);
        else activeView = false;
      } finally {
        blocker.release();
      }
      await Promise.all([blocker.done, rejected]);
      expect(await service.readFile(path, 'Books', 'text')).toBe('original');
    },
  );

  it('rejects stale owner cache deletion queued behind another connection', async () => {
    publishCloudSession({ subject: 'fixture-A', token: 'synthetic-A' });
    const lease = await captureCloudLease();
    const path = `cloud/v1/${lease.ownerKey}/${'1'.repeat(32)}/book.epub`;
    await service.writeFile(path, 'Books', 'original');
    const blocker = await holdWriteTransaction();
    const queued = nextWriteQueued();
    const deleting = service.deleteFile(path, 'Books', () => assertCloudLease(lease));
    const rejected = expect(deleting).rejects.toThrow();
    try {
      await queued;
      publishCloudSession(null);
    } finally {
      blocker.release();
    }
    await Promise.all([blocker.done, rejected]);
    expect(await service.readFile(path, 'Books', 'text')).toBe('original');
  });

  it('should resolve file paths with base prefix', async () => {
    const resolved = await service.resolveFilePath('test.json', 'Books');
    expect(resolved).toBe('Readest/Books/test.json');
  });

  it('should resolve empty Data path to prefix', async () => {
    const resolved = await service.resolveFilePath('', 'Data');
    expect(resolved).toBe('Readest');
  });

  it('should set localBooksDir after init', () => {
    expect(service.localBooksDir).toBe('Readest/Books');
  });

  fsTests(() => service);
  libraryTests(() => service);
  bookTests(() => service, getBookFile);
});
