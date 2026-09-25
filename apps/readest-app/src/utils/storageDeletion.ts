// Deletion may be retried after its database row has already been removed.
// Validate an exact object key before authorizing by its owner namespace.
export const isValidStorageFileKey = (key: unknown): key is string =>
  typeof key === 'string' &&
  !/[\\\u0000-\u001f\u007f]/.test(key) &&
  key.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
