import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authMocks = vi.hoisted(() => ({
  signInWithOtp: vi.fn(),
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (value: string) => value,
}));

vi.mock('@/utils/supabase', () => ({
  supabase: {
    auth: {
      signInWithOtp: authMocks.signInWithOtp,
    },
  },
}));

import MagicLinkSignIn from '@/app/auth/MagicLinkSignIn';

describe('MagicLinkSignIn', () => {
  beforeEach(() => {
    authMocks.signInWithOtp.mockReset();
  });

  afterEach(cleanup);

  it('only offers email magic-link sign in', () => {
    render(<MagicLinkSignIn redirectTo='https://reader.storybored.ai/auth/callback' />);

    expect(screen.getByRole('textbox', { name: 'Email address' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Send a magic link email' })).toBeTruthy();
    expect(screen.queryByLabelText(/password/i)).toBeNull();
    expect(screen.queryByText(/sign in with/i)).toBeNull();
  });

  it('fails closed for uninvited users when requesting the link', async () => {
    authMocks.signInWithOtp.mockResolvedValue({ error: null });
    render(<MagicLinkSignIn redirectTo='https://reader.storybored.ai/auth/callback' />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Email address' }), {
      target: { value: '  beta@example.com  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send a magic link email' }));

    await waitFor(() => {
      expect(authMocks.signInWithOtp).toHaveBeenCalledWith({
        email: 'beta@example.com',
        options: {
          emailRedirectTo: 'https://reader.storybored.ai/auth/callback',
          shouldCreateUser: false,
        },
      });
    });
    expect((await screen.findByRole('status')).textContent).toContain(
      'Check your email for the magic link',
    );
  });

  it('shows a beta-safe error without exposing provider details', async () => {
    authMocks.signInWithOtp.mockResolvedValue({ error: new Error('internal provider detail') });
    render(<MagicLinkSignIn redirectTo='https://reader.storybored.ai/auth/callback' />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Email address' }), {
      target: { value: 'unknown@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send a magic link email' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Make sure this email has beta access');
    expect(alert.textContent).not.toContain('internal provider detail');
  });
});
