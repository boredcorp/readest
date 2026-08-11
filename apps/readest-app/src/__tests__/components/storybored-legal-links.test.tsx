import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import LegalLinks from '@/components/LegalLinks';
import { getStoryBoredLegalLinks } from '@/components/storyboredLegalLinks';

const { appServiceMock } = vi.hoisted(() => ({
  appServiceMock: { isIOSApp: false, isMacOSApp: false },
}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ appService: appServiceMock }),
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string) => key,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  appServiceMock.isIOSApp = false;
  appServiceMock.isMacOSApp = false;
});

describe('StoryBored account legal links', () => {
  it('derives legal routes from the configured marketplace origin', () => {
    expect(getStoryBoredLegalLinks('https://storybored.ai/marketplace')).toEqual({
      termsUrl: 'https://storybored.ai/terms',
      privacyUrl: 'https://storybored.ai/privacy',
    });
  });

  it('allows HTTP only for loopback development origins', () => {
    expect(getStoryBoredLegalLinks('http://storybored.localhost:3200/marketplace')).toEqual({
      termsUrl: 'http://storybored.localhost:3200/terms',
      privacyUrl: 'http://storybored.localhost:3200/privacy',
    });
    expect(getStoryBoredLegalLinks('http://127.0.0.1:3200/marketplace')).toEqual({
      termsUrl: 'http://127.0.0.1:3200/terms',
      privacyUrl: 'http://127.0.0.1:3200/privacy',
    });
    expect(getStoryBoredLegalLinks('http://storybored.ai/marketplace')).toBeUndefined();
  });

  it.each([
    undefined,
    '',
    'javascript:alert(1)',
    'https://user:password@storybored.ai/marketplace',
    'https://storybored.ai/marketplace?redirect=https://example.com',
    'https://storybored.ai/marketplace#privacy',
  ])('rejects an absent or unsafe marketplace URL: %s', (url) => {
    expect(getStoryBoredLegalLinks(url)).toBeUndefined();
  });

  it('renders owner-approval status instead of upstream links when configuration is absent', () => {
    vi.stubEnv('NEXT_PUBLIC_MARKETPLACE_URL', '');

    render(<LegalLinks />);

    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('pending owner approval');
  });

  it('renders StoryBored legal routes for web account users', () => {
    vi.stubEnv('NEXT_PUBLIC_MARKETPLACE_URL', 'https://storybored.ai/marketplace');

    render(<LegalLinks />);

    expect(screen.getByRole('status').textContent).toContain('pending owner approval');
    expect(
      screen.getByRole('link', { name: 'Terms publication status' }).getAttribute('href'),
    ).toBe('https://storybored.ai/terms');
    expect(screen.getByRole('link', { name: 'Privacy notice status' }).getAttribute('href')).toBe(
      'https://storybored.ai/privacy',
    );
  });

  it('keeps the Apple EULA only for Apple-native terms', () => {
    vi.stubEnv('NEXT_PUBLIC_MARKETPLACE_URL', 'https://storybored.ai/marketplace');
    appServiceMock.isIOSApp = true;

    render(<LegalLinks />);

    expect(screen.getByRole('link', { name: 'Apple Terms of Use' }).getAttribute('href')).toBe(
      'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/',
    );
    expect(screen.getByRole('link', { name: 'Privacy notice status' }).getAttribute('href')).toBe(
      'https://storybored.ai/privacy',
    );
  });

  it('keeps the account surface free of upstream Readest legal URLs', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/components/LegalLinks.tsx'), 'utf8');

    expect(source).not.toContain('readest.com/terms');
    expect(source).not.toContain('readest.com/privacy');
    expect(source).not.toContain('Terms of Service');
    expect(source).not.toContain('Privacy Policy');
    expect(source).toContain('NEXT_PUBLIC_MARKETPLACE_URL');
    expect(source).toContain('pending owner approval');
  });
});
