const READER_CLOUD_BOOK_PREFIX = 'Readest/Books/';
const CANONICAL_SUPABASE_SUBJECT =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/u;
const MAX_READER_FILE_KEY_BYTES = 1024;

function bytesToBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function assertSafeLeafEncoding(leaf: string): void {
  let decoded = leaf;
  for (let iteration = 0; iteration < 4; iteration += 1) {
    let next: string;
    try {
      next = decodeURIComponent(decoded);
    } catch {
      // A literal, malformed percent sequence is harmless after base64url encoding.
      return;
    }
    if (next === decoded) return;
    if (
      next === '.' ||
      next === '..' ||
      next.includes('/') ||
      next.includes('\\') ||
      CONTROL_CHARACTER.test(next)
    ) {
      throw new Error('Invalid permanent Reader upload path.');
    }
    decoded = next;
  }
}

export function encodeReaderPermanentStorageName(relativePath: string): string {
  if (
    !relativePath.startsWith(READER_CLOUD_BOOK_PREFIX) ||
    relativePath.includes('\\') ||
    CONTROL_CHARACTER.test(relativePath)
  ) {
    throw new Error('Invalid permanent Reader upload path.');
  }

  const leaf = relativePath.slice(READER_CLOUD_BOOK_PREFIX.length);
  if (!leaf || leaf === '.' || leaf === '..' || leaf.includes('/')) {
    throw new Error('Invalid permanent Reader upload path.');
  }
  assertSafeLeafEncoding(leaf);

  return bytesToBase64Url(relativePath);
}

export function buildReaderPermanentStorageKey(userId: string, relativePath: string): string {
  if (!CANONICAL_SUPABASE_SUBJECT.test(userId)) {
    throw new Error('Invalid Reader storage owner.');
  }
  // This opaque one-segment mapping is private-beta-only. LearningBored's Reader authority was fresh
  // before invitations opened, so there are no legacy object keys to migrate; upstream Readest keeps
  // its inherited path layout in the inactive-policy branch.
  const fileKey = `${userId.toLowerCase()}/${encodeReaderPermanentStorageName(relativePath)}`;
  if (new TextEncoder().encode(fileKey).byteLength > MAX_READER_FILE_KEY_BYTES) {
    throw new Error('Invalid permanent Reader upload path.');
  }
  return fileKey;
}
