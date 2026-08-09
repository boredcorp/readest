import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import LearningBoredAuthPresentation from '@/integrations/learningbored/presentation/LearningBoredAuthPresentation';
import LearningBoredRuntimePresentationProviders from '@/integrations/learningbored/presentation/LearningBoredRuntimePresentationProviders';
import { useSettingsStore } from '@/store/settingsStore';
import { useThemeStore } from '@/store/themeStore';
import type { SystemSettings } from '@/types/settings';

const sourceRoot = resolve(import.meta.dirname, '../../..');

function readSource(relativePath: string): string {
  return readFileSync(resolve(sourceRoot, relativePath), 'utf8');
}

beforeEach(() => {
  document.documentElement.removeAttribute('data-eink');
  useThemeStore.setState({ isDarkMode: false });
  useSettingsStore.setState({ settings: {} as SystemSettings });
});

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute('data-eink');
});

describe('LearningBored auth presentation', () => {
  it('presents sign-in as one named task with a reachable workspace summary', () => {
    render(
      <LearningBoredAuthPresentation theme='eink'>
        <form aria-label='Canonical authentication form'>
          <label htmlFor='test-email'>Email address</label>
          <input id='test-email' type='email' />
          <button type='submit'>Sign in</button>
        </form>
      </LearningBoredAuthPresentation>,
    );

    const main = screen.getByRole('main');
    expect(main.getAttribute('data-lb-presentation')).toBe('auth');
    expect(main.getAttribute('data-lb-theme')).toBe('eink');
    expect(screen.getByRole('heading', { level: 1, name: 'Sign in to continue.' })).toBeTruthy();
    expect(screen.getByRole('form', { name: 'Canonical authentication form' })).toBeTruthy();
    expect(
      screen.getByRole('complementary', { name: 'Your LearningBored workspace' }),
    ).toBeTruthy();
    expect(screen.getByText('Your imported books')).toBeTruthy();
    expect(screen.getByText('Grounded explanations')).toBeTruthy();
    expect(screen.getByText('What is ready today')).toBeTruthy();
    expect(screen.getByText(/Signing in does not create a new account/u)).toBeTruthy();
  });

  it('gives the web back action a visible accessible name', () => {
    const onBack = vi.fn();
    render(
      <LearningBoredAuthPresentation backLabel='Back to the previous page' onBack={onBack}>
        <span>Authentication</span>
      </LearningBoredAuthPresentation>,
    );

    const back = screen.getByRole('button', { name: 'Back to the previous page' });
    expect(back.textContent).toContain('Back to the previous page');
    fireEvent.click(back);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('reacts to Reader e-ink hydration on a cold direct route', async () => {
    const { container } = render(
      <LearningBoredRuntimePresentationProviders>
        <LearningBoredAuthPresentation>
          <span>Authentication</span>
        </LearningBoredAuthPresentation>
      </LearningBoredRuntimePresentationProviders>,
    );
    const surface = container.querySelector('[data-lb-presentation="auth"]');

    expect(surface?.getAttribute('data-lb-theme')).toBe('light');
    document.documentElement.setAttribute('data-eink', 'true');

    await waitFor(() => expect(surface?.getAttribute('data-lb-theme')).toBe('eink'));
  });

  it('keeps one canonical auth controller and dispatches only its presentation', () => {
    const source = readSource('app/auth/page.tsx');

    expect(source.match(/function AuthRouteController/gu)).toHaveLength(1);
    expect(source).toContain("readest={<AuthRouteController presentation='readest' />}");
    expect(source).toContain(
      "learningbored={<AuthRouteController presentation='learningbored' />}",
    );
    expect(source).toContain('const renderAuthForm =');
    expect(source).toContain("if (presentation === 'learningbored')");
    expect(source).toContain(
      "if (isTauriAppPlatform()) {\n    if (presentation === 'learningbored')",
    );
  });

  it('keeps the default web back action named and at least 44px square', () => {
    const source = readSource('app/auth/page.tsx');

    expect(source).toMatch(
      /<button\s+aria-label=\{_\('Go Back'\)\}\s+onClick=\{handleGoBack\}\s+className='btn btn-ghost fixed left-6 top-6 h-11 min-h-11 w-11 p-0'/u,
    );
  });

  it('scopes the 44px target and Supabase overrides to the auth presentation', () => {
    const styles = readSource(
      'integrations/learningbored/presentation/LearningBoredAuthPresentation.module.css',
    );

    expect(styles).toMatch(/\.backControl\s*\{[^}]*min-width:\s*var\(--lb-touch-target\)/su);
    expect(styles).toMatch(/\.backControl\s*\{[^}]*min-height:\s*var\(--lb-touch-target\)/su);
    expect(styles).toContain('.authForm :global(.supabase-auth-ui_ui-input)');
    expect(styles).toContain('.authForm :global(.supabase-auth-ui_ui-button)');
    expect(styles).not.toMatch(/linear-gradient|radial-gradient|box-shadow|backdrop-filter/u);
  });
});
