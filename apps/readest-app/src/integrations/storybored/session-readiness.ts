export type ReaderLoginDecision = 'enable-keep-login' | 'none' | 'redirect-to-auth' | 'wait';

export function getReaderLoginDecision(input: {
  isAuthReady: boolean;
  hasToken: boolean;
  hasUser: boolean;
  keepLogin: boolean;
}): ReaderLoginDecision {
  if (!input.isAuthReady) return 'wait';
  if (input.hasToken && input.hasUser) {
    return input.keepLogin ? 'none' : 'enable-keep-login';
  }
  return input.keepLogin ? 'redirect-to-auth' : 'none';
}
