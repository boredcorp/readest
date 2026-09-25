import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  publishCloudSession,
  captureCloudLease,
  assertCloudLease,
  cloudAuthSnapshot,
} from '../src/services/cloudOwnerSession.ts';
import {
  projectLibrary,
  patchLocalLibrary,
  sanitizeCloudBook,
  emptyCloudLibrary,
  mergeCloudPull,
  cloudLibraryPath,
  isOrdinaryCloudBook,
} from '../src/services/cloudLibraryModel.ts';
import {
  updateCloudLibrary,
  readCloudLibrary,
  patchCloudBooks,
} from '../src/services/cloudLibraryRepository.ts';

const H = '1'.repeat(32);
const book = (title, extra = {}) => ({
  hash: H,
  title,
  author: 'Fixture',
  format: 'EPUB',
  createdAt: 1,
  updatedAt: 2,
  ...extra,
});

test('account switch aborts old work and cannot borrow the replacement token', async () => {
  publishCloudSession({ subject: 'fixture-A', token: 'synthetic-A' });
  const a = await captureCloudLease();
  publishCloudSession({ subject: 'fixture-B', token: 'synthetic-B' });
  assert.equal(a.signal.aborted, true);
  assert.throws(() => assertCloudLease(a));
  assert.throws(() => cloudAuthSnapshot(a));
  const b = await captureCloudLease();
  assert.notEqual(a.ownerKey, b.ownerKey);
  assert.equal(cloudAuthSnapshot(b).token, 'synthetic-B');
});

test('same owner token refresh retains the lease, logout invalidates it', async () => {
  publishCloudSession({ subject: 'fixture-A', token: 'old' });
  const a = await captureCloudLease();
  publishCloudSession({ subject: 'fixture-A', token: 'new' });
  assert.equal(cloudAuthSnapshot(a).token, 'new');
  publishCloudSession(null);
  assert.throws(() => assertCloudLease(a));
});

test('same hash local/A/B projections keep their backing records separate', () => {
  const a = emptyCloudLibrary('a'.repeat(64));
  const b = emptyCloudLibrary('b'.repeat(64));
  a.entries[H] = { book: book('A'), state: 'ready', revision: 1 };
  b.entries[H] = { book: book('B'), state: 'ready', revision: 1 };
  const local = [book('Local')];
  assert.equal(projectLibrary(local, a)[0].title, 'Local');
  assert.equal(projectLibrary(local, a, new Set([H]))[0].title, 'A');
  assert.equal(projectLibrary(local, b, new Set([H]))[0].title, 'B');
  assert.deepEqual(patchLocalLibrary(local, projectLibrary(local, a, new Set([H]))), local);
  assert.equal(local[0].title, 'Local');
});

test('hidden local records survive projected saves; tombstones are explicit', () => {
  const other = book('Other', { hash: '2'.repeat(32) });
  assert.equal(patchLocalLibrary([book('Local'), other], [book('Changed')]).length, 2);
  assert.equal(
    patchLocalLibrary([book('Local')], [book('Deleted', { deletedAt: 3 })])[0].deletedAt,
    3,
  );
});

test('pending deletion wins over stale pull and cursor moves with returned state only', () => {
  const a = emptyCloudLibrary('a'.repeat(64));
  a.entries[H] = { book: book('A'), state: 'delete_pending', revision: 1 };
  const next = mergeCloudPull(a, [book('Remote', { uploadedAt: 1 })], 10);
  assert.equal(next.entries[H].state, 'delete_pending');
  assert.equal(next.booksCursor, 10);
  assert.equal(a.booksCursor, 0);
  assert.equal(projectLibrary([], next).length, 1);
  assert.equal(projectLibrary([], next)[0].cloudOperation, 'delete_pending');
});

test('cloud persistence strips URLs, owner context and unknown sensitive properties', () => {
  const safe = sanitizeCloudBook(
    book('A', {
      url: 'signed',
      filePath: 'local',
      coverImageUrl: 'blob:x',
      token: 'synthetic',
      metadata: {
        title: 'A',
        author: 'Synthetic',
        language: 'en',
        coverImageBlobUrl: 'blob:y',
        token: 'synthetic',
      },
      libraryOrigin: { kind: 'cloud', ownerKey: 'a'.repeat(64) },
    }),
  );
  for (const key of ['url', 'filePath', 'coverImageUrl', 'token', 'libraryOrigin'])
    assert.equal(key in safe, false);
  assert.equal('coverImageBlobUrl' in safe.metadata, false);
  assert.equal('token' in safe.metadata, false);
});

test('marketplace and legacy unowned cloud records are not enrolled as ordinary local books', () => {
  assert.equal(isOrdinaryCloudBook(book('A', { marketplace: {} })), false);
  assert.equal(isOrdinaryCloudBook(book('A', { hash: 'sbm2' + 'a'.repeat(64) })), false);
  assert.equal(isOrdinaryCloudBook(book('A', { groupName: 'StoryBored Marketplace' })), false);
  assert.equal(
    isOrdinaryCloudBook(book('A', { marketplaceOwnerMismatchQuarantined: true })),
    false,
  );
  assert.equal(isOrdinaryCloudBook(book('A', { hash: '0'.repeat(32) })), false);
  assert.equal(projectLibrary([book('Legacy', { uploadedAt: 1 })], null).length, 0);
  assert.equal(projectLibrary([book('Local')], null).length, 1);
  assert.throws(() => cloudLibraryPath('../owner'));
});

test('account changes inside the persistence transaction abort the commit', async () => {
  publishCloudSession({ subject: 'fixture-A', token: 'A' });
  const lease = await captureCloudLease();
  let committed = false;
  const io = {
    updateTextFile: async (_path, _base, update) => {
      publishCloudSession({ subject: 'fixture-B', token: 'B' });
      update(null);
      committed = true;
    },
  };
  await assert.rejects(updateCloudLibrary(io, lease, (library) => library));
  assert.equal(committed, false);
});

test('failed persistence cannot advance the saved pull cursor', async () => {
  publishCloudSession({ subject: 'fixture-A', token: 'A' });
  const lease = await captureCloudLease();
  const text = JSON.stringify(emptyCloudLibrary(lease.ownerKey));
  const io = {
    exists: async () => true,
    readFile: async () => text,
    updateTextFile: async (_path, _base, update) => {
      update(text);
      throw new Error('storage failure');
    },
  };
  await assert.rejects(
    updateCloudLibrary(io, lease, (library) =>
      mergeCloudPull(library, [book('Cloud', { uploadedAt: 1 })], 20),
    ),
  );
  assert.equal((await readCloudLibrary(io, lease)).booksCursor, 0);
});

test('saving an unchanged projection does not block later remote metadata discovery', async () => {
  publishCloudSession({ subject: 'fixture-A', token: 'A' });
  const lease = await captureCloudLease();
  const library = emptyCloudLibrary(lease.ownerKey);
  library.entries[H] = { book: book('Cloud', { uploadedAt: 1 }), state: 'ready', revision: 1 };
  let text = JSON.stringify(library);
  const io = {
    updateTextFile: async (_path, _base, update) => {
      text = update(text);
    },
  };
  await patchCloudBooks(io, projectLibrary([], library, new Set(), lease.epoch));
  assert.equal(JSON.parse(text).revision, 0);
  assert.equal(JSON.parse(text).entries[H].revision, 1);
  assert.equal(JSON.parse(text).entries[H].state, 'ready');
  assert.equal(
    mergeCloudPull(JSON.parse(text), [book('Updated remotely', { uploadedAt: 1, updatedAt: 3 })], 3)
      .entries[H].book.title,
    'Updated remotely',
  );
});

test('a newer authoritative re-upload revives a completed tombstone but not a pending delete', () => {
  const a = emptyCloudLibrary('a'.repeat(64));
  a.entries[H] = {
    book: book('Deleted', { deletedAt: 4, updatedAt: 4 }),
    state: 'tombstoned',
    revision: 2,
  };
  assert.equal(
    mergeCloudPull(a, [book('Stale', { uploadedAt: 3, updatedAt: 3 })], 5).entries[H].state,
    'tombstoned',
  );
  const newer = book('Explicit re-upload', { uploadedAt: 5, updatedAt: 5 });
  assert.equal(mergeCloudPull(a, [newer], 5).entries[H].state, 'ready');
  a.entries[H].state = 'delete_pending';
  assert.equal(mergeCloudPull(a, [newer], 5).entries[H].state, 'delete_pending');
});
