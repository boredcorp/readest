const LOWERCASE_GIT_SHA_PATTERN = /^[0-9a-f]{40}$/u;

export const resolveReaderBuildId = (readerRevision = process.env['OCI_READER_SHA']) => {
  if (!readerRevision) return undefined;

  if (!LOWERCASE_GIT_SHA_PATTERN.test(readerRevision)) {
    throw new Error('OCI_READER_SHA must be a lowercase 40-character Git SHA when provided');
  }

  return readerRevision;
};
