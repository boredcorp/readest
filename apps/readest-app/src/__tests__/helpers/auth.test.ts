import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { User, AuthError } from '@supabase/supabase-js';

// Mock supabase before importing the module under test
const mockSetSession = vi.fn();

vi.mock('@/utils/supabase', () => ({
  supabase: {
    auth: {
      setSession: (...args: unknown[]) => mockSetSession(...args),
    },
  },
}));

import { handleAuthCallback } from '@/helpers/auth';

describe('handleAuthCallback', () => {
  let mockLogin: ReturnType<typeof vi.fn<(accessToken: string, user: User) => void>>;
  let mockNavigate: ReturnType<typeof vi.fn<(path: string) => void>>;

  const fakeUser: User = {
    id: 'user-123',
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: '2024-01-01T00:00:00Z',
  } as User;

  const successfulSession = (accessToken: string, user: User = fakeUser) => ({
    data: {
      session: {
        access_token: accessToken,
        refresh_token: 'current-refresh-token',
        user,
      },
      user,
    },
    error: null,
  });

  beforeEach(() => {
    mockLogin = vi.fn<(accessToken: string, user: User) => void>();
    mockNavigate = vi.fn<(path: string) => void>();
    mockSetSession.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should navigate to /auth/error when error is present', async () => {
    handleAuthCallback({
      accessToken: 'token',
      refreshToken: 'refresh',
      login: mockLogin,
      navigate: mockNavigate,
      error: 'some_error',
    });

    // Wait for the async finalizeSession to complete
    await vi.waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/auth/error');
    });

    expect(mockLogin).not.toHaveBeenCalled();
    expect(mockSetSession).not.toHaveBeenCalled();
  });

  it('should navigate to /library when accessToken is missing', async () => {
    handleAuthCallback({
      accessToken: null,
      refreshToken: 'refresh',
      login: mockLogin,
      navigate: mockNavigate,
    });

    await vi.waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/library');
    });

    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('should navigate to /library when refreshToken is missing', async () => {
    handleAuthCallback({
      accessToken: 'token',
      refreshToken: null,
      login: mockLogin,
      navigate: mockNavigate,
    });

    await vi.waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/library');
    });

    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('should navigate to /library when both tokens are missing', async () => {
    handleAuthCallback({
      login: mockLogin,
      navigate: mockNavigate,
    });

    await vi.waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/library');
    });
  });

  it('should navigate to /auth/error when setSession fails', async () => {
    const sessionError: AuthError = {
      message: 'Invalid token',
      name: 'AuthError',
      status: 401,
    } as AuthError;

    mockSetSession.mockResolvedValue({ error: sessionError });

    handleAuthCallback({
      accessToken: 'bad-token',
      refreshToken: 'bad-refresh',
      login: mockLogin,
      navigate: mockNavigate,
    });

    await vi.waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/auth/error');
    });

    expect(mockSetSession).toHaveBeenCalledWith({
      access_token: 'bad-token',
      refresh_token: 'bad-refresh',
    });
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('should login and navigate to next URL on successful auth', async () => {
    mockSetSession.mockResolvedValue(successfulSession('good-token'));

    handleAuthCallback({
      accessToken: 'good-token',
      refreshToken: 'good-refresh',
      login: mockLogin,
      navigate: mockNavigate,
      next: '/reader',
    });

    await vi.waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('good-token', fakeUser);
    });

    expect(mockNavigate).toHaveBeenCalledWith('/reader');
  });

  it('should default next to "/" when not specified', async () => {
    mockSetSession.mockResolvedValue(successfulSession('token'));

    handleAuthCallback({
      accessToken: 'token',
      refreshToken: 'refresh',
      login: mockLogin,
      navigate: mockNavigate,
    });

    await vi.waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  it('should navigate to /auth/recovery when type is "recovery"', async () => {
    mockSetSession.mockResolvedValue(successfulSession('token'));

    handleAuthCallback({
      accessToken: 'token',
      refreshToken: 'refresh',
      login: mockLogin,
      navigate: mockNavigate,
      type: 'recovery',
      next: '/some-page',
    });

    await vi.waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('token', fakeUser);
    });

    expect(mockNavigate).toHaveBeenCalledWith('/auth/recovery');
    // Should NOT navigate to next when type is recovery
    expect(mockNavigate).not.toHaveBeenCalledWith('/some-page');
  });

  it('should navigate to /auth/error when setSession returns no session', async () => {
    mockSetSession.mockResolvedValue({ data: { session: null, user: null }, error: null });

    handleAuthCallback({
      accessToken: 'token',
      refreshToken: 'refresh',
      login: mockLogin,
      navigate: mockNavigate,
    });

    await vi.waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/auth/error');
    });

    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('should not call login when the returned session has no user', async () => {
    mockSetSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'token',
          refresh_token: 'refresh',
          user: null,
        },
        user: null,
      },
      error: null,
    });

    handleAuthCallback({
      accessToken: 'token',
      refreshToken: 'refresh',
      login: mockLogin,
      navigate: mockNavigate,
    });

    await vi.waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/auth/error');
    });

    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('should pass the correct session parameters to setSession', async () => {
    mockSetSession.mockResolvedValue(successfulSession('my-access-token'));

    handleAuthCallback({
      accessToken: 'my-access-token',
      refreshToken: 'my-refresh-token',
      login: mockLogin,
      navigate: mockNavigate,
    });

    await vi.waitFor(() => {
      expect(mockSetSession).toHaveBeenCalledWith({
        access_token: 'my-access-token',
        refresh_token: 'my-refresh-token',
      });
    });
  });

  it('uses a token rotated by setSession instead of restoring the callback token', async () => {
    mockSetSession.mockResolvedValue(successfulSession('rotated-access-token'));

    handleAuthCallback({
      accessToken: 'expired-callback-token',
      refreshToken: 'callback-refresh-token',
      login: mockLogin,
      navigate: mockNavigate,
    });

    await vi.waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('rotated-access-token', fakeUser);
    });
    expect(mockLogin).not.toHaveBeenCalledWith('expired-callback-token', fakeUser);
  });
});
