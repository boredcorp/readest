'use client';

import {
  createContext,
  useState,
  useContext,
  useCallback,
  useMemo,
  ReactNode,
  useEffect,
  useRef,
} from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/utils/supabase';
import {
  beginAuthSessionResolution,
  publishAuthSessionToken,
} from '@/utils/auth-session-readiness';
import posthog from 'posthog-js';

interface AuthContextType {
  isReady: boolean;
  token: string | null;
  user: User | null;
  login: (token: string, user: User) => void;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [isReady, setIsReady] = useState(() => {
    beginAuthSessionResolution();
    return false;
  });
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const isLoggingOutRef = useRef(false);

  const clearLocalSession = useCallback(() => {
    publishAuthSessionToken(null);
    localStorage.removeItem('token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    const syncSession = (
      session: { access_token: string; refresh_token: string; user: User } | null,
    ) => {
      if (session) {
        console.log('Syncing session');
        const { access_token, refresh_token, user } = session;
        localStorage.setItem('token', access_token);
        localStorage.setItem('refresh_token', refresh_token);
        localStorage.setItem('user', JSON.stringify(user));
        publishAuthSessionToken(access_token);
        posthog.identify(user.id);
        setToken(access_token);
        setUser(user);
      } else {
        clearLocalSession();
      }
    };
    const refreshSession = async () => {
      try {
        await supabase.auth.refreshSession();
      } catch {
        syncSession(null);
        setIsReady(true);
      }
    };

    const { data: subscription } = supabase.auth.onAuthStateChange((_, session) => {
      if (isLoggingOutRef.current && session) return;
      syncSession(session);
      setIsReady(true);
    });

    refreshSession();
    return () => {
      subscription?.subscription.unsubscribe();
    };
  }, [clearLocalSession]);

  // setToken / setUser from useState are stable across renders, so the empty
  // deps array is correct. Wrapping in useCallback (and only including stable
  // refs in the deps) is what makes the useMemo below actually memoize the
  // context value — without this, login/logout/refresh would be recreated on
  // every render and the memo would always invalidate.
  const login = useCallback((newToken: string, newUser: User) => {
    console.log('Logging in');
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(newUser));
    publishAuthSessionToken(newToken);
    isLoggingOutRef.current = false;
    setIsReady(true);
  }, []);

  const logout = useCallback(async () => {
    console.log('Logging out');
    isLoggingOutRef.current = true;
    clearLocalSession();
    setIsReady(true);
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } finally {
      clearLocalSession();
      isLoggingOutRef.current = false;
      setIsReady(true);
    }
  }, [clearLocalSession]);

  const refresh = useCallback(async () => {
    try {
      await supabase.auth.refreshSession();
    } catch {}
  }, []);

  const value = useMemo(
    () => ({ isReady, token, user, login, logout, refresh }),
    [isReady, token, user, login, logout, refresh],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
