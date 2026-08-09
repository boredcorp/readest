import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const probes = vi.hoisted(() => ({
  authStateCallback: null as
    | null
    | ((event: string, session: { access_token: string; user: { id: string } } | null) => void),
  callbackCalls: [] as Array<{
    accessToken: string | null | undefined;
    hash: string;
    historyState: unknown;
    pathname: string;
    refreshToken: string | null | undefined;
    search: string;
    type: string | null | undefined;
  }>,
  callbackNavigate: null as null | ((path: string) => void),
  getSession: vi.fn(),
  login: vi.fn(),
  push: vi.fn(),
  back: vi.fn(),
  unsubscribe: vi.fn(),
  updateUser: vi.fn(),
  user: { id: 'learner-1', email: 'learner@example.test' } as { id: string; email: string } | null,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: probes.push, back: probes.back }),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ login: probes.login, user: probes.user }),
}));

vi.mock('@/hooks/useTheme', () => ({ useTheme: vi.fn() }));
vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (value: string) => value,
}));

vi.mock('@/store/themeStore', () => {
  const state = { isDarkMode: false };
  const useThemeStore = Object.assign(
    (selector?: (value: typeof state) => unknown) => (selector ? selector(state) : state),
    { getState: () => state, subscribe: () => () => {} },
  );
  return { useThemeStore };
});
vi.mock('@/store/settingsStore', () => {
  const state = { settings: {} };
  const useSettingsStore = Object.assign(
    (selector?: (value: typeof state) => unknown) => (selector ? selector(state) : state),
    { getState: () => state, subscribe: () => () => {} },
  );
  return { useSettingsStore };
});

vi.mock('@/integrations/learningbored/presentation/selection', () => ({
  getLearningBoredRoutePresentation: () => 'learningbored',
}));

vi.mock('@supabase/auth-ui-react', () => ({
  Auth: ({ view }: { view: string }) => (
    <form aria-label={`Canonical Supabase ${view} form`} data-testid={`supabase-${view}`} />
  ),
}));
vi.mock('@supabase/auth-ui-shared', () => ({ ThemeSupa: {} }));

vi.mock('@/utils/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => probes.getSession(...args),
      onAuthStateChange: (
        callback: (
          event: string,
          session: { access_token: string; user: { id: string } } | null,
        ) => void,
      ) => {
        probes.authStateCallback = callback;
        return { data: { subscription: { unsubscribe: probes.unsubscribe } } };
      },
      updateUser: (...args: unknown[]) => probes.updateUser(...args),
    },
  },
}));

vi.mock('@/helpers/auth', () => ({
  handleAuthCallback: (options: {
    accessToken?: string | null;
    navigate: (path: string) => void;
    refreshToken?: string | null;
    type?: string | null;
  }) => {
    probes.callbackCalls.push({
      accessToken: options.accessToken,
      hash: window.location.hash,
      historyState: window.history.state,
      pathname: window.location.pathname,
      refreshToken: options.refreshToken,
      search: window.location.search,
      type: options.type,
    });
    probes.callbackNavigate = options.navigate;
  },
}));

import AuthCallback, { getCallbackFailureReason } from '@/app/auth/callback/page';
import AuthErrorPage from '@/app/auth/error/page';
import ResetPasswordPage from '@/app/auth/recovery/page';
import UpdateEmailPage, { UpdateEmailRouteController } from '@/app/auth/update/page';

beforeEach(() => {
  probes.authStateCallback = null;
  probes.callbackCalls = [];
  probes.callbackNavigate = null;
  probes.getSession.mockReset();
  probes.getSession.mockResolvedValue({ data: { session: null }, error: null });
  probes.login.mockReset();
  probes.push.mockReset();
  probes.back.mockReset();
  probes.unsubscribe.mockReset();
  probes.updateUser.mockReset();
  probes.updateUser.mockResolvedValue({ error: null });
  probes.user = { id: 'learner-1', email: 'learner@example.test' };
  window.history.replaceState(null, '', '/auth');
});

afterEach(() => {
  cleanup();
});

describe('LearningBored auth route states', () => {
  it('classifies expired recovery responses separately from provider failures', () => {
    expect(getCallbackFailureReason('otp_expired', 'Email link is invalid or has expired')).toBe(
      'invalid-link',
    );
    expect(getCallbackFailureReason('unexpected_failure', 'Provider unavailable')).toBe(
      'provider-error',
    );
  });

  it('clears a captured recovery fragment before establishing and navigating once', async () => {
    const nextHistoryState = {
      __NA: true,
      tree: ['fictional', 'callback'],
    };
    window.history.replaceState(
      nextHistoryState,
      '',
      '/auth/callback?source=recovery#access_token=fictional-access&refresh_token=fictional-refresh&expires_in=3600&token_type=bearer&type=recovery',
    );
    const rendered = render(<AuthCallback />);

    expect(screen.getByRole('status', { name: /Verifying the secure callback/u })).toBeTruthy();
    expect(window.location.pathname).toBe('/auth/callback');
    expect(window.location.search).toBe('?source=recovery');
    expect(window.location.hash).toBe('');
    expect(window.history.state).toEqual(nextHistoryState);
    expect(probes.callbackCalls).toEqual([
      {
        accessToken: 'fictional-access',
        hash: '',
        historyState: nextHistoryState,
        pathname: '/auth/callback',
        refreshToken: 'fictional-refresh',
        search: '?source=recovery',
        type: 'recovery',
      },
    ]);
    expect(probes.callbackNavigate).toBeTypeOf('function');

    rendered.rerender(<AuthCallback />);
    expect(probes.callbackCalls).toHaveLength(1);

    act(() => probes.callbackNavigate?.('/auth/recovery'));

    expect(await screen.findByRole('status', { name: /Opening your Reader/u })).toBeTruthy();
    expect(probes.push).toHaveBeenCalledTimes(1);
    expect(probes.push).toHaveBeenCalledWith('/auth/recovery');
  });

  it('routes callback provider errors into an actionable Miura error state', async () => {
    window.history.replaceState(
      null,
      '',
      '/auth/callback#error=server_error&error_code=unexpected_failure',
    );
    render(<AuthCallback />);

    expect(
      await screen.findByRole('alert', { name: /Authentication service error/u }),
    ).toBeTruthy();

    act(() => probes.callbackNavigate?.('/auth/error'));
    expect(probes.push).toHaveBeenCalledWith(
      '/auth/error?reason=provider-error&code=unexpected_failure',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Return to sign in' }));
    expect(probes.push).toHaveBeenCalledWith('/auth');
  });

  it('offers explicit recovery actions for an invalid or expired link', async () => {
    window.history.replaceState(null, '', '/auth/error?reason=invalid-link');
    render(<AuthErrorPage />);

    expect(
      await screen.findByRole('alert', { name: /Invalid or expired recovery link/u }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Request another link' }));
    expect(probes.push).toHaveBeenCalledWith('/auth?task=reset');

    fireEvent.click(screen.getByRole('button', { name: 'Back to sign in' }));
    expect(probes.push).toHaveBeenCalledWith('/auth');
  });

  it('validates a recovery session before exposing the password form', async () => {
    probes.getSession.mockResolvedValue({ data: { session: null }, error: null });
    render(<ResetPasswordPage />);

    expect(screen.getByRole('status', { name: /Checking link validity/u })).toBeTruthy();
    expect(
      await screen.findByRole('alert', { name: /Invalid or expired recovery link/u }),
    ).toBeTruthy();
    expect(screen.queryByTestId('supabase-update_password')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Request another link' }));
    expect(probes.push).toHaveBeenCalledWith('/auth?task=reset');
  });

  it('keeps a provider-check failure distinct and retries the same recovery link', async () => {
    probes.getSession
      .mockResolvedValueOnce({ data: { session: null }, error: new Error('Provider unavailable') })
      .mockResolvedValueOnce({
        data: { session: { access_token: 'access', user: { id: 'learner-1' } } },
        error: null,
      });
    render(<ResetPasswordPage />);

    expect(
      await screen.findByRole('alert', { name: /Recovery link check unavailable/u }),
    ).toBeTruthy();
    expect(screen.queryByRole('alert', { name: /Invalid or expired recovery link/u })).toBeNull();
    expect(screen.getByText(/This link may still be valid/u)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Retry link check' }));

    expect(await screen.findByTestId('supabase-update_password')).toBeTruthy();
    expect(probes.getSession).toHaveBeenCalledTimes(2);
  });

  it('turns a thrown session check into a retryable error before classifying no session', async () => {
    probes.getSession
      .mockRejectedValueOnce(new Error('Network offline'))
      .mockResolvedValueOnce({ data: { session: null }, error: null });
    render(<ResetPasswordPage />);

    expect(
      await screen.findByRole('alert', { name: /Recovery link check unavailable/u }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry link check' }));

    expect(
      await screen.findByRole('alert', { name: /Invalid or expired recovery link/u }),
    ).toBeTruthy();
    expect(probes.getSession).toHaveBeenCalledTimes(2);
  });

  it('shows the canonical password update form for a valid recovery session', async () => {
    probes.getSession.mockResolvedValue({
      data: { session: { access_token: 'access', user: { id: 'learner-1' } } },
      error: null,
    });
    render(<ResetPasswordPage />);

    expect(await screen.findByTestId('supabase-update_password')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Set a new password.' })).toBeTruthy();

    act(() =>
      probes.authStateCallback?.('USER_UPDATED', {
        access_token: 'updated-access',
        user: { id: 'learner-1' },
      }),
    );

    expect(await screen.findByRole('status', { name: /Opening your library/u })).toBeTruthy();
    expect(probes.login).toHaveBeenCalledWith('updated-access', { id: 'learner-1' });
    expect(probes.push).toHaveBeenCalledWith('/library');
  });

  it('announces email update errors without losing the entered address', async () => {
    probes.updateUser.mockResolvedValue({ error: new Error('Address is already in use') });
    render(<UpdateEmailPage />);

    const email = screen.getByRole('textbox', { name: 'New Email' });
    fireEvent.change(email, { target: { value: 'new@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update email' }));

    expect((await screen.findByRole('alert')).textContent).toContain('Address is already in use');
    expect((email as HTMLInputElement).value).toBe('new@example.test');
  });

  it.each(['learningbored', 'readest'] as const)(
    'redirects an expired %s update-email session to the canonical sign-in route',
    async (presentation) => {
      probes.user = null;
      render(<UpdateEmailRouteController presentation={presentation} />);

      await vi.waitFor(() => expect(probes.push).toHaveBeenCalledWith('/auth'));
      expect(probes.push).not.toHaveBeenCalledWith('/login');
    },
  );
});
