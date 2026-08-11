import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const posthogMocks = vi.hoisted(() => ({
  init: vi.fn(),
  registerForSession: vi.fn(),
}));

vi.mock('posthog-js', () => ({
  default: {
    init: posthogMocks.init,
    register_for_session: posthogMocks.registerForSession,
  },
}));

vi.mock('posthog-js/react', () => ({
  PostHogProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@/utils/version', () => ({
  getAppVersion: () => 'test-version',
}));

describe('PostHog context configuration', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_HOST', '');
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', '');
    vi.stubEnv('NEXT_PUBLIC_DEFAULT_POSTHOG_URL_BASE64', '');
    vi.stubEnv('NEXT_PUBLIC_DEFAULT_POSTHOG_KEY_BASE64', '');
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
  });

  test('renders without initializing or registering when configuration is absent', async () => {
    const { CSPostHogProvider } = await import('@/context/PHContext');

    render(
      <CSPostHogProvider>
        <span>reader</span>
      </CSPostHogProvider>,
    );

    expect(screen.getByText('reader')).toBeTruthy();
    expect(posthogMocks.init).not.toHaveBeenCalled();
    expect(posthogMocks.registerForSession).not.toHaveBeenCalled();
  });

  test('renders without initializing or registering when fallbacks are malformed', async () => {
    vi.stubEnv('NEXT_PUBLIC_DEFAULT_POSTHOG_URL_BASE64', 'not valid base64!');
    vi.stubEnv('NEXT_PUBLIC_DEFAULT_POSTHOG_KEY_BASE64', '%%%');

    const { CSPostHogProvider } = await import('@/context/PHContext');

    render(
      <CSPostHogProvider>
        <span>reader</span>
      </CSPostHogProvider>,
    );

    expect(screen.getByText('reader')).toBeTruthy();
    expect(posthogMocks.init).not.toHaveBeenCalled();
    expect(posthogMocks.registerForSession).not.toHaveBeenCalled();
  });

  test('initializes and registers when explicit configuration is valid', async () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_HOST', 'https://telemetry.example.com');
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'phc_test_project');

    const { CSPostHogProvider } = await import('@/context/PHContext');

    render(
      <CSPostHogProvider>
        <span>reader</span>
      </CSPostHogProvider>,
    );

    expect(posthogMocks.init).toHaveBeenCalledWith(
      'phc_test_project',
      expect.objectContaining({ api_host: 'https://telemetry.example.com' }),
    );
    expect(posthogMocks.registerForSession).toHaveBeenCalledWith({
      $app_version: 'test-version',
    });
  });
});
