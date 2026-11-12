import { describe, expect, it } from 'vitest';

import {
  buildReaderPermanentStorageKey,
  encodeReaderPermanentStorageName,
} from '@/integrations/learningbored/permanent-storage-key';

const userId = '11111111-1111-4111-8111-111111111111';
const bookHash = '0123456789abcdef0123456789abcdef';

describe('LearningBored permanent Reader storage keys', () => {
  it('uses one opaque base64url segment beneath the canonical owner prefix', () => {
    const relativePath = 'Readest/Books/Fictional apparatus ?#% å.epub';
    const key = buildReaderPermanentStorageKey(userId.toUpperCase(), relativePath);
    const [owner, storageName, unexpected] = key.split('/');

    expect(owner).toBe(userId);
    expect(storageName).toMatch(/^[A-Za-z0-9_-]+$/u);
    expect(unexpected).toBeUndefined();
    expect(storageName).toBe(encodeReaderPermanentStorageName(relativePath));

    const padded = storageName!
      .replaceAll('-', '+')
      .replaceAll('_', '/')
      .padEnd(Math.ceil(storageName!.length / 4) * 4, '=');
    const decodedBytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
    expect(new TextDecoder().decode(decodedBytes)).toBe(relativePath);
  });

  it.each(['Fictional apparatus å.epub', 'cover.png'])(
    'encodes the normal Reader book directory and file %s as one opaque segment',
    (filename) => {
      const relativePath = `Readest/Books/${bookHash}/${filename}`;
      const encoded = Buffer.from(relativePath, 'utf8').toString('base64url');
      expect(buildReaderPermanentStorageKey(userId, relativePath)).toBe(`${userId}/${encoded}`);
    },
  );

  it('keeps the existing flat logical key byte-for-byte compatible', () => {
    expect(buildReaderPermanentStorageKey(userId, 'Readest/Books/Fictional.epub')).toBe(
      `${userId}/UmVhZGVzdC9Cb29rcy9GaWN0aW9uYWwuZXB1Yg`,
    );
  });

  it.each([
    '../other.epub',
    'Readest/Books/../other.epub',
    'Readest/Books/%2e%2e',
    'Readest/Books/%252e%252e',
    'Readest/Books/subdir/book.epub',
    'Readest/Books/subdir\\book.epub',
    'Readest/Books/%2fescape.epub',
    'Readest/Books/%252fescape.epub',
    'Readest/Books/%5cescape.epub',
    'Readest/Books/%255cescape.epub',
    'Readest/Books/\u0000book.epub',
    `Readest/Books/${bookHash}/`,
    `Readest/Books/${bookHash}/..`,
    `Readest/Books/${bookHash}/extra/book.epub`,
    `Readest/Books/${bookHash}//book.epub`,
    `Readest/Books/${bookHash}/%252e%252e`,
    `Readest/Books/${bookHash}/%252fescape.epub`,
    `Readest/Books/${bookHash}/%255cescape.epub`,
    `Readest/Books/${bookHash}/%00book.epub`,
    `Readest/Books/${bookHash}/${'a'.repeat(800)}.epub`,
  ])('rejects unsafe paths before creating a key: %s', (relativePath) => {
    expect(() => buildReaderPermanentStorageKey(userId, relativePath)).toThrow(
      'Invalid permanent Reader upload path.',
    );
  });

  it('rejects a noncanonical owner before constructing an object prefix', () => {
    expect(() => buildReaderPermanentStorageKey('../other', 'Readest/Books/book.epub')).toThrow(
      'Invalid Reader storage owner.',
    );
  });

  it('keeps the opaque mapping isolated from inherited Readest compatibility', () => {
    const inheritedKey = `${userId}/Readest/Books/legacy.epub`;
    expect(buildReaderPermanentStorageKey(userId, 'Readest/Books/legacy.epub')).not.toBe(
      inheritedKey,
    );
  });
});
