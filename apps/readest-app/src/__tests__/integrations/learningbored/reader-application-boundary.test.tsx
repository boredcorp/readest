import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const probes = vi.hoisted(() => ({
  errorModuleLoads: 0,
  pathname: '/design/learningbored',
  providerModuleLoads: 0,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => probes.pathname,
}));

vi.mock('@/components/ReaderApplicationProviders', () => {
  probes.providerModuleLoads += 1;
  return {
    default: ({ children }: { children: React.ReactNode }) => (
      <div data-testid='reader-application-providers'>{children}</div>
    ),
  };
});

vi.mock('@/components/ReaderApplicationError', () => {
  probes.errorModuleLoads += 1;
  return {
    default: ({ error }: { error: Error }) => (
      <main data-testid='reader-application-error'>{error.message}</main>
    ),
  };
});

import ErrorPage from '@/app/error';
import ReaderApplicationBoundary from '@/components/ReaderApplicationBoundary';

afterEach(() => {
  cleanup();
  probes.errorModuleLoads = 0;
  probes.pathname = '/design/learningbored';
  probes.providerModuleLoads = 0;
});

describe('Reader application provider boundary', () => {
  it('keeps the exact preview inert, then mounts providers when a persistent layout leaves it', async () => {
    const rendered = render(
      <ReaderApplicationBoundary>
        <main>Route content</main>
      </ReaderApplicationBoundary>,
    );

    expect(screen.getByRole('main').textContent).toBe('Route content');
    expect(screen.queryByTestId('reader-application-providers')).toBeNull();
    expect(probes.providerModuleLoads).toBe(0);

    probes.pathname = '/library';
    rendered.rerender(
      <ReaderApplicationBoundary>
        <main>Route content</main>
      </ReaderApplicationBoundary>,
    );

    expect(await screen.findByTestId('reader-application-providers')).toBeTruthy();
    expect(probes.providerModuleLoads).toBe(1);
  });

  it('keeps the preview error state local and loads the production error module elsewhere', async () => {
    const reset = vi.fn();
    const error = new Error('Fixture failed');
    const rendered = render(<ErrorPage error={error} reset={reset} />);

    expect(
      screen.getByRole('heading', { name: 'The fixture preview could not render' }),
    ).toBeTruthy();
    expect(screen.queryByTestId('reader-application-error')).toBeNull();
    expect(probes.errorModuleLoads).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'Try the fixture again' }));
    expect(reset).toHaveBeenCalledTimes(1);

    probes.pathname = '/library';
    rendered.rerender(<ErrorPage error={error} reset={reset} />);

    expect(await screen.findByTestId('reader-application-error')).toBeTruthy();
    expect(probes.errorModuleLoads).toBe(1);
  });
});
