type AuthSessionWaiter = (token: string | null) => void;

let currentSessionToken: string | null | undefined;
const sessionWaiters = new Set<AuthSessionWaiter>();

export function beginAuthSessionResolution(): void {
  currentSessionToken = undefined;
}

export function publishAuthSessionToken(token: string | null): void {
  currentSessionToken = token;
  for (const resolve of sessionWaiters) {
    resolve(token);
  }
  sessionWaiters.clear();
}

export function getCurrentAuthSessionToken(): Promise<string | null> {
  if (currentSessionToken !== undefined) {
    return Promise.resolve(currentSessionToken);
  }

  return new Promise((resolve) => {
    sessionWaiters.add(resolve);
  });
}
