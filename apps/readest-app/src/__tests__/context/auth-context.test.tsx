import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import type { User } from '@supabase/supabase-js';

interface TestSession {
  access_token: string;
  refresh_token: string;
  user: User;
}

type AuthStateListener = (event: string, session: TestSession | null) => void;

const authMocks = vi.hoisted(() => ({
  listeners: [] as AuthStateListener[],
  refreshSession: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('@/utils/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: vi.fn((listener: AuthStateListener) => {
        authMocks.listeners.push(listener);
        return {
          data: { subscription: { unsubscribe: vi.fn() } },
        };
      }),
      refreshSession: authMocks.refreshSession,
      signOut: authMocks.signOut,
    },
  },
}));

vi.mock('posthog-js', () => ({
  default: { identify: vi.fn() },
}));

import { AuthProvider, useAuth } from '@/context/AuthContext';

const testUser = {
  id: 'reader-1',
  app_metadata: {},
  user_metadata: {},
  aud: 'authenticated',
  created_at: '2026-08-03T00:00:00.000Z',
} as User;

function testSession(accessToken: string, refreshToken: string): TestSession {
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    user: testUser,
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function renderAuthProbe() {
  let current: ReturnType<typeof useAuth> | undefined;

  function Probe() {
    current = useAuth();
    return null;
  }

  const rendered = render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );

  return {
    ...rendered,
    getCurrent: () => {
      if (!current) throw new Error('Auth probe has not rendered.');
      return current;
    },
  };
}

describe('AuthContext memoization', () => {
  beforeEach(() => {
    authMocks.listeners.length = 0;
    authMocks.refreshSession.mockReset().mockResolvedValue({
      data: { session: null },
      error: null,
    });
    authMocks.signOut.mockReset().mockResolvedValue({ error: null });
    if (typeof window !== 'undefined') {
      window.localStorage.clear();
    }
  });

  afterEach(() => {
    cleanup();
  });

  test('returns the same context value reference when parent re-renders without state change', () => {
    const captured: ReturnType<typeof useAuth>[] = [];

    function Probe() {
      const value = useAuth();
      captured.push(value);
      return null;
    }

    function Wrapper({ tick }: { tick: number }) {
      // The tick prop forces a parent re-render but does not change AuthProvider state
      return (
        <AuthProvider>
          <span data-tick={tick} />
          <Probe />
        </AuthProvider>
      );
    }

    const { rerender } = render(<Wrapper tick={0} />);
    act(() => {
      rerender(<Wrapper tick={1} />);
    });
    act(() => {
      rerender(<Wrapper tick={2} />);
    });

    // Probe captures one value per render. We expect at least 3 captures.
    expect(captured.length).toBeGreaterThanOrEqual(3);

    // The first capture happens during initial mount (state may settle async),
    // but subsequent captures from parent-only re-renders should reuse the same
    // memoized context value reference. If login/logout/refresh are not stable
    // (no useCallback), useMemo's deps change every render and produce a fresh
    // object each time — this assertion catches that regression.
    const firstStable = captured[captured.length - 2]!;
    const secondStable = captured[captured.length - 1]!;
    expect(secondStable).toBe(firstStable);
  });

  test('login/logout/refresh callbacks are stable across re-renders', () => {
    const captured: ReturnType<typeof useAuth>[] = [];

    function Probe() {
      const value = useAuth();
      captured.push(value);
      return null;
    }

    function Wrapper({ tick }: { tick: number }) {
      return (
        <AuthProvider>
          <span data-tick={tick} />
          <Probe />
        </AuthProvider>
      );
    }

    const { rerender } = render(<Wrapper tick={0} />);
    act(() => {
      rerender(<Wrapper tick={1} />);
    });

    const last = captured[captured.length - 1]!;
    const prev = captured[captured.length - 2]!;
    expect(last.login).toBe(prev.login);
    expect(last.logout).toBe(prev.logout);
    expect(last.refresh).toBe(prev.refresh);
  });

  test('becomes ready only after Supabase resolves the initial session', () => {
    const { getCurrent } = renderAuthProbe();

    expect(Reflect.get(getCurrent(), 'isReady')).toBe(false);

    act(() => {
      authMocks.listeners[0]?.('INITIAL_SESSION', testSession('initial-token', 'initial-refresh'));
    });

    expect(Reflect.get(getCurrent(), 'isReady')).toBe(true);
    expect(getCurrent().token).toBe('initial-token');
  });

  test('does not expose mirrored credentials before Supabase resolves the session', () => {
    window.localStorage.setItem('token', 'stale-mirrored-token');
    window.localStorage.setItem('user', JSON.stringify(testUser));

    const { getCurrent } = renderAuthProbe();

    expect(getCurrent().isReady).toBe(false);
    expect(getCurrent().token).toBeNull();
    expect(getCurrent().user).toBeNull();
  });

  test('rotates the current token and clears session storage on sign out', () => {
    const { getCurrent } = renderAuthProbe();

    act(() => {
      authMocks.listeners[0]?.('INITIAL_SESSION', testSession('initial-token', 'initial-refresh'));
    });

    expect(getCurrent().token).toBe('initial-token');
    expect(window.localStorage.getItem('refresh_token')).toBe('initial-refresh');

    act(() => {
      authMocks.listeners[0]?.(
        'TOKEN_REFRESHED',
        testSession('refreshed-token', 'refreshed-refresh'),
      );
    });

    expect(getCurrent().token).toBe('refreshed-token');
    expect(window.localStorage.getItem('token')).toBe('refreshed-token');
    expect(window.localStorage.getItem('refresh_token')).toBe('refreshed-refresh');

    act(() => {
      authMocks.listeners[0]?.('SIGNED_OUT', null);
    });

    expect(getCurrent().token).toBeNull();
    expect(getCurrent().user).toBeNull();
    expect(window.localStorage.getItem('token')).toBeNull();
    expect(window.localStorage.getItem('refresh_token')).toBeNull();
    expect(window.localStorage.getItem('user')).toBeNull();
  });

  test('logout clears mirrored tokens when auth-js returns a remote error without an auth event', async () => {
    window.localStorage.setItem('token', 'cached-token');
    window.localStorage.setItem('refresh_token', 'cached-refresh');
    window.localStorage.setItem('user', JSON.stringify(testUser));
    authMocks.signOut.mockResolvedValue({ error: new Error('Remote session revocation failed.') });
    const { getCurrent } = renderAuthProbe();

    await act(async () => {
      await getCurrent().logout();
    });

    expect(window.localStorage.getItem('token')).toBeNull();
    expect(window.localStorage.getItem('refresh_token')).toBeNull();
    expect(window.localStorage.getItem('user')).toBeNull();
  });

  test('logout clears the active session before remote sign-out resolves', async () => {
    const pendingSignOut = deferred<{ error: null }>();
    authMocks.signOut.mockReturnValue(pendingSignOut.promise);
    const { getCurrent } = renderAuthProbe();

    act(() => {
      authMocks.listeners[0]?.('INITIAL_SESSION', testSession('active-token', 'active-refresh'));
    });

    let logoutPromise!: Promise<void>;
    act(() => {
      logoutPromise = getCurrent().logout();
    });

    expect(getCurrent().token).toBeNull();
    expect(getCurrent().user).toBeNull();
    expect(window.localStorage.getItem('token')).toBeNull();
    expect(window.localStorage.getItem('refresh_token')).toBeNull();
    expect(window.localStorage.getItem('user')).toBeNull();

    pendingSignOut.resolve({ error: null });
    await act(async () => {
      await logoutPromise;
    });
    expect(authMocks.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });
});
