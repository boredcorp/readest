import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  LearningBoredClient,
  LearningBoredCredits,
} from '@/integrations/learningbored/client';
import { LearningBoredClientProvider } from '@/integrations/learningbored/LearningBoredClientContext';
import LearningBoredAccountPresentation, {
  type LearningBoredAccountPresentationProps,
} from '@/integrations/learningbored/presentation/LearningBoredAccountPresentation';
import SelectedRoutePresentation from '@/integrations/learningbored/presentation/SelectedRoutePresentation';
import {
  createLearningBoredSdkClient,
  type LearningBoredSdkPort,
} from '@/integrations/learningbored/sdk-client';
import { useThemeStore } from '@/store/themeStore';

vi.mock('@/app/user/components/Header', () => ({
  default: ({ onGoBack }: { onGoBack: () => void }) => (
    <button type='button' onClick={onGoBack}>
      Go Back
    </button>
  ),
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (value: string) => value,
}));

const CREDITS: LearningBoredCredits = {
  availableChalk: 12,
  reservedChalk: 1,
  lifetimeGranted: 20,
  lifetimeSpent: 7,
  recent: [
    {
      eventType: 'chalk_committed',
      chalkDelta: -1,
      createdAt: '2026-08-06T08:30:00.000Z',
    },
    {
      eventType: 'chalk_released',
      chalkDelta: 0,
      createdAt: '2026-08-05T10:00:00.000Z',
    },
  ],
};

const presentationProps: LearningBoredAccountPresentationProps = {
  status: 'ready',
  userFullName: 'Avery North',
  userEmail: 'avery@example.test',
  onBack: vi.fn(),
  onToggleStorage: vi.fn(),
  onResetPassword: vi.fn(),
  onUpdateEmail: vi.fn(),
  onSignOut: vi.fn(),
};

function clientWithCredits(getCredits: LearningBoredClient['getCredits']): LearningBoredClient {
  return { getCredits } as unknown as LearningBoredClient;
}

function renderAccount(
  getCredits: LearningBoredClient['getCredits'],
  props: Partial<LearningBoredAccountPresentationProps> = {},
) {
  return render(
    <LearningBoredClientProvider value={clientWithCredits(getCredits)}>
      <LearningBoredAccountPresentation {...presentationProps} {...props} />
    </LearningBoredClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  useThemeStore.setState({ isDarkMode: false });
});

describe('LearningBored account Chalk presentation', () => {
  it('applies the shared selected-presentation theme to the account root', () => {
    useThemeStore.setState({ isDarkMode: true });
    const rendered = renderAccount(vi.fn(async () => CREDITS));

    expect(
      rendered.container
        .querySelector('[data-lb-presentation="account"]')
        ?.getAttribute('data-lb-theme'),
    ).toBe('dark');
  });

  it('uses a named main and a polite busy region before showing the checked ledger', async () => {
    let resolveCredits!: (value: LearningBoredCredits) => void;
    const getCredits = vi.fn<LearningBoredClient['getCredits']>(
      () =>
        new Promise((resolve) => {
          resolveCredits = resolve;
        }),
    );

    renderAccount(getCredits);

    expect(screen.getByRole('main', { name: 'Account' })).toBeTruthy();
    const chalkRegion = screen.getByRole('region', { name: 'Chalk' });
    expect(chalkRegion.getAttribute('aria-busy')).toBe('true');
    expect(screen.getByRole('status').textContent).toContain('Loading Chalk balance...');

    resolveCredits(CREDITS);

    await waitFor(() => expect(chalkRegion.getAttribute('aria-busy')).toBe('false'));
    expect(screen.getByText('12')).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.getByText('Chalk spent')).toBeTruthy();
    expect(screen.getByText('Chalk released')).toBeTruthy();
    expect(screen.getByText('\u22121 Chalk')).toBeTruthy();
    expect(screen.getByText('No net change')).toBeTruthy();
  });

  it('keeps account actions available when Chalk fails and retries in place', async () => {
    const getCredits = vi
      .fn<LearningBoredClient['getCredits']>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ ...CREDITS, recent: [] });
    const onResetPassword = vi.fn();

    renderAccount(getCredits, { onResetPassword });

    const failureMessage = await screen.findByText('Chalk is temporarily unavailable.');
    expect(failureMessage.closest('[role="status"]')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reset password' }));
    expect(onResetPassword).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(
      await screen.findByText('No Chalk activity yet. Grants and Board activity will appear here.'),
    ).toBeTruthy();
    expect(getCredits).toHaveBeenCalledTimes(2);
  });

  it('does not describe an empty Chalk balance as ready to use', async () => {
    renderAccount(
      vi.fn(async () => ({
        ...CREDITS,
        availableChalk: 0,
        reservedChalk: 0,
        recent: [],
      })),
    );

    expect(await screen.findByText('No Chalk available')).toBeTruthy();
    expect(screen.queryByText('Chalk ready to use')).toBeNull();
  });

  it('exposes only real private-beta actions and delegates storage without mounting commerce', async () => {
    const onToggleStorage = vi.fn();
    renderAccount(
      vi.fn(async () => CREDITS),
      {
        storageOpen: true,
        storageContent: <p>Canonical storage manager</p>,
        onToggleStorage,
      },
    );

    await screen.findByText('Chalk spent');
    expect(screen.getByText('Canonical storage manager')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close storage manager' }));
    expect(onToggleStorage).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('link', { name: 'Request account deletion' }).getAttribute('href'),
    ).toMatch(/^mailto:support@learningbored\.com/u);
    expect(
      screen.queryByRole('button', { name: /subscribe|purchase|delete account/iu }),
    ).toBeNull();
  });

  it('makes no Chalk request when the default Readest branch is selected', async () => {
    const getCredits = vi.fn(async () => CREDITS);

    render(
      <LearningBoredClientProvider value={clientWithCredits(getCredits)}>
        <SelectedRoutePresentation
          presentation='readest'
          readest={<p>Readest account</p>}
          learningbored={<LearningBoredAccountPresentation {...presentationProps} />}
        />
      </LearningBoredClientProvider>,
    );

    expect(screen.getByText('Readest account')).toBeTruthy();
    await Promise.resolve();
    expect(getCredits).not.toHaveBeenCalled();
  });

  it('adapts the typed SDK credits read without sharing mutable response rows', async () => {
    const sdk = {
      getCredits: vi.fn(async () => CREDITS),
    } as unknown as LearningBoredSdkPort;
    const client = createLearningBoredSdkClient({ sdkClient: sdk });

    const result = await client.getCredits();

    expect(result).toEqual(CREDITS);
    expect(result.recent).not.toBe(CREDITS.recent);
    expect(result.recent[0]).not.toBe(CREDITS.recent[0]);
  });
});
