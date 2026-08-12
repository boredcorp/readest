import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import LearningBoredPreview from '@/integrations/learningbored/preview/LearningBoredPreview';
import {
  LEARNINGBORED_PREVIEW_GROUPS,
  LEARNINGBORED_PREVIEW_THEMES,
  type LearningBoredPreviewState,
  type LearningBoredPreviewStateId,
} from '@/integrations/learningbored/preview/contract';
import {
  isLearningBoredPreviewEnabled,
  LEARNINGBORED_PREVIEW_ENV_KEY,
  LEARNINGBORED_PREVIEW_PATH,
} from '@/integrations/learningbored/preview/gate';
import { getReaderLearningBoredBoardThemeId } from '@/integrations/learningbored/presentation/theme';

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (message: string, values?: Record<string, string | number>) => {
    if (!values) return message;
    return Object.entries(values).reduce(
      (result, [key, value]) => result.replace(`{{${key}}}`, String(value)),
      message,
    );
  },
}));

const sourceRoot = resolve(import.meta.dirname, '../../..');

const previewStateCases = LEARNINGBORED_PREVIEW_GROUPS.flatMap<LearningBoredPreviewState>(
  (group) => group.states as readonly LearningBoredPreviewState[],
);

const expectedStateCopy = {
  'auth-initial': /Your private-beta invitation is ready/u,
  'auth-loading': /Checking your invitation/u,
  'auth-sign-in': /^Sign in$/u,
  'auth-reset': /Send recovery instructions/u,
  'auth-recovery': /Update password/u,
  'auth-update': /Send confirmation/u,
  'auth-callback': /Verifying your secure link/u,
  'auth-invalid-link': /This recovery link cannot be used/u,
  'auth-provider-error': /Sign-in service is temporarily unavailable/u,
  'auth-success': /Session restored/u,
  'library-loading': /Updating your library/u,
  'library-empty': /Bring in your first book/u,
  'library-imported': /Maps of the Imaginary Waterworks/u,
  'library-no-results': /No books match this search/u,
  'library-selection': /1 book selected/u,
  'library-transfer-error': /Study status unavailable\. Your library still works\./u,
  'account-loading': /Loading profile/u,
  'account-ready': /Avery Rowan/u,
  'account-chalk-error': /Chalk is temporarily unavailable/u,
  'account-session-expired': /Your session has expired/u,
  'account-storage-empty': /No synchronized files/u,
  'capture-ready': /Ready to make this passage clear/u,
  'capture-pdf-unavailable': /Board it is unavailable for PDF/u,
  'generation-starting': /Starting your Board/u,
  'generation-queued': /Waiting to begin/u,
  'generation-extracting': /Reading the passage/u,
  'generation-composing': /Drawing the Board and writing questions/u,
  'generation-illustrating': /^Illustrating$/u,
  'generation-rendering': /Finishing the Board/u,
  'generation-poll-error': /latest status could not be loaded/u,
  'generation-cancelled-refunded': /Your Chalk was refunded/u,
  'generation-failed-refunded': /This Board could not be completed/u,
  'generation-retry-recovery': /Retry queued/u,
  'board-complete': /How the fictional settling chamber separates particles/u,
  'board-svg-unavailable': /Board visual unavailable/u,
  'figure-load-failure': /Figure unavailable/u,
  'figure-replacement-confirm': /Replace this figure/u,
  'figure-replacement-progress': /Drawing the replacement figure/u,
  'figure-replacement-success': /Replacement figure ready/u,
  'figure-replacement-failed-refunded': /previous figure is unchanged/u,
  'comprehension-unanswered': /Did this Board make the passage click/u,
  'comprehension-breakthrough': /Thanks — your answer was recorded/u,
  'comprehension-still-unclear': /Try a different Board kind/u,
  'progress-overview': /Concept progress/u,
  'review-topology': /0 questions are due now/u,
  'primitive-loading': /Loading a deterministic preview region/u,
  'primitive-error': /The Board status could not be refreshed/u,
  'primitive-empty': /Nothing is waiting here/u,
  'primitive-action': /Primary action/u,
} satisfies Record<LearningBoredPreviewStateId, RegExp>;

function readSource(relativePath: string): string {
  return readFileSync(resolve(sourceRoot, relativePath), 'utf8');
}

afterEach(() => cleanup());

describe('LearningBored Reader preview gate', () => {
  it('fails closed unless the dedicated server-side flag is exactly true', () => {
    expect(LEARNINGBORED_PREVIEW_ENV_KEY).toBe('ENABLE_LEARNINGBORED_READER_PREVIEW');
    expect(isLearningBoredPreviewEnabled({})).toBe(false);
    expect(isLearningBoredPreviewEnabled({ [LEARNINGBORED_PREVIEW_ENV_KEY]: 'false' })).toBe(false);
    expect(isLearningBoredPreviewEnabled({ [LEARNINGBORED_PREVIEW_ENV_KEY]: 'TRUE' })).toBe(false);
    expect(
      isLearningBoredPreviewEnabled({
        NODE_ENV: 'production',
        [LEARNINGBORED_PREVIEW_ENV_KEY]: 'true',
      }),
    ).toBe(false);
    expect(
      isLearningBoredPreviewEnabled({
        NODE_ENV: 'development',
        [LEARNINGBORED_PREVIEW_ENV_KEY]: 'true',
      }),
    ).toBe(true);
    expect(isLearningBoredPreviewEnabled({ [LEARNINGBORED_PREVIEW_ENV_KEY]: 'true' })).toBe(true);
  });

  it('guards the route before mounting preview UI and keeps it out of search', () => {
    const route = readSource('app/design/learningbored/page.preview.tsx');
    const applicationBoundary = readSource('components/ReaderApplicationBoundary.tsx');
    const rootLayout = readSource('app/layout.tsx');
    const middleware = readSource('middleware.ts');
    const nextConfig = readFileSync(resolve(sourceRoot, '../next.config.mjs'), 'utf8');

    expect(route).toContain("import { notFound } from 'next/navigation'");
    expect(route).toMatch(/if \(!isLearningBoredPreviewEnabled\(\)\) \{\s*notFound\(\);\s*\}/u);
    expect(route).toContain('index: false');
    expect(route).toContain('follow: false');
    expect(LEARNINGBORED_PREVIEW_PATH).toBe('/design/learningbored');
    expect(nextConfig).toContain("process.env['ENABLE_LEARNINGBORED_READER_PREVIEW'] === 'true'");
    expect(nextConfig).toContain("...(learningBoredReaderPreviewEnabled ? ['preview.tsx'] : [])");
    expect(middleware).toContain("'/design/learningbored'");
    expect(middleware).toContain('!isLearningBoredPreviewEnabled()');
    expect(middleware).toContain('status: 404');
    expect(middleware).toContain("'X-Robots-Tag': 'noindex, nofollow, noarchive'");
    expect(middleware).not.toContain('x-learningbored-preview-request');
    expect(rootLayout).toContain(
      "import ReaderApplicationBoundary from '@/components/ReaderApplicationBoundary'",
    );
    expect(rootLayout).toContain(
      '<ReaderApplicationBoundary>{children}</ReaderApplicationBoundary>',
    );
    expect(applicationBoundary).toContain('const pathname = usePathname()');
    expect(applicationBoundary).toContain('pathname === LEARNINGBORED_PREVIEW_PATH');
    expect(applicationBoundary).toContain("lazy(() => import('./ReaderApplicationProviders'))");
    expect(applicationBoundary).toContain('return children');
    expect(applicationBoundary).not.toContain("from './ReaderApplicationProviders'");
    expect(rootLayout).not.toContain("from '@/components/Providers'");
    expect(rootLayout).not.toContain("from '@/context/EnvContext'");
  });
});

describe('LearningBored Reader preview inventory', () => {
  it('maps each Reader presentation theme to its exact renderer theme ID', () => {
    expect(
      Object.fromEntries(
        LEARNINGBORED_PREVIEW_THEMES.map((theme) => [
          theme,
          getReaderLearningBoredBoardThemeId(theme),
        ]),
      ),
    ).toEqual({
      light: 'miura-deployment-light-v1',
      dark: 'miura-deployment-dark-v1',
      eink: 'miura-deployment-eink-v1',
    });
  });

  it('covers every required Operate family and each Reader theme', () => {
    expect(LEARNINGBORED_PREVIEW_THEMES).toEqual(['light', 'dark', 'eink']);
    expect(LEARNINGBORED_PREVIEW_GROUPS.map((group) => group.id)).toEqual([
      'auth',
      'library',
      'account',
      'capture',
      'generation',
      'board',
      'figure',
      'comprehension',
      'progress',
      'review',
      'primitives',
    ]);

    const stateIds = LEARNINGBORED_PREVIEW_GROUPS.flatMap((group) =>
      group.states.map((state) => state.id),
    );

    expect(new Set(stateIds).size).toBe(stateIds.length);
    expect(stateIds).toEqual(
      expect.arrayContaining([
        'auth-initial',
        'auth-loading',
        'auth-sign-in',
        'auth-reset',
        'auth-recovery',
        'auth-update',
        'auth-callback',
        'auth-invalid-link',
        'auth-provider-error',
        'auth-success',
        'library-loading',
        'library-empty',
        'library-imported',
        'library-no-results',
        'library-selection',
        'library-transfer-error',
        'account-loading',
        'account-ready',
        'account-chalk-error',
        'account-session-expired',
        'account-storage-empty',
        'capture-ready',
        'capture-pdf-unavailable',
        'generation-starting',
        'generation-queued',
        'generation-extracting',
        'generation-composing',
        'generation-illustrating',
        'generation-rendering',
        'generation-poll-error',
        'generation-cancelled-refunded',
        'generation-failed-refunded',
        'generation-retry-recovery',
        'board-complete',
        'board-svg-unavailable',
        'figure-load-failure',
        'figure-replacement-confirm',
        'figure-replacement-progress',
        'figure-replacement-success',
        'figure-replacement-failed-refunded',
        'comprehension-unanswered',
        'comprehension-breakthrough',
        'comprehension-still-unclear',
        'progress-overview',
        'review-topology',
        'primitive-loading',
        'primitive-error',
        'primitive-empty',
        'primitive-action',
      ]),
    );
  });

  it('provides an accessible state and theme navigator backed by deterministic fixtures', () => {
    render(<LearningBoredPreview />);

    const preview = screen.getByRole('region', { name: 'LearningBored Reader state preview' });
    expect(preview.getAttribute('data-lb-theme')).toBe('light');
    expect(preview.getAttribute('data-lb-preview-state')).toBe('auth-initial');
    expect(document.querySelector('[data-lb-presentation="auth"]')).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Preview states' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Preview theme' })).toBeTruthy();

    const statePlane = screen.getByRole('region', { name: 'Invitation check' });
    expect(statePlane.getAttribute('tabindex')).toBe('-1');
    fireEvent.click(screen.getByRole('button', { name: 'Skip to state preview' }));
    expect(document.activeElement).toBe(statePlane);

    fireEvent.click(screen.getByRole('button', { name: 'Dark' }));
    expect(preview.getAttribute('data-lb-theme')).toBe('dark');

    fireEvent.click(screen.getByRole('button', { name: 'E-ink' }));
    expect(preview.getAttribute('data-lb-theme')).toBe('eink');
    expect(
      document.querySelector('[data-lb-presentation="auth"]')?.getAttribute('data-lb-theme'),
    ).toBe('eink');

    fireEvent.click(screen.getByRole('button', { name: 'Show Imported library' }));
    expect(preview.getAttribute('data-lb-preview-state')).toBe('library-imported');
    expect(document.querySelector('[data-lb-presentation="library"]')).toBeTruthy();
    expect(screen.getByText('5 due')).toBeTruthy();
    expect(screen.getByText(/Maps of the Imaginary Waterworks/u)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Show Loading account' }));
    expect(document.querySelector('[data-lb-presentation="account"]')).toBeTruthy();
    expect(screen.getByText('Loading profile...')).toBeTruthy();
  });

  it('exposes every fixture state and selects each family without route or persisted state', () => {
    render(<LearningBoredPreview />);
    const preview = screen.getByRole('region', { name: 'LearningBored Reader state preview' });
    const stateCount = LEARNINGBORED_PREVIEW_GROUPS.reduce(
      (total, group) => total + group.states.length,
      0,
    );

    expect(screen.getAllByRole('button', { name: /^Show /u })).toHaveLength(stateCount);
    for (const group of LEARNINGBORED_PREVIEW_GROUPS) {
      const state = group.states[0];
      fireEvent.click(screen.getByRole('button', { name: `Show ${state.label}` }));
      expect(preview.getAttribute('data-lb-preview-state')).toBe(state.id);
    }
  });

  it.each(previewStateCases)('renders $id through its presentation boundary', async (state) => {
    render(<LearningBoredPreview />);
    const preview = screen.getByRole('region', { name: 'LearningBored Reader state preview' });

    fireEvent.click(screen.getByRole('button', { name: `Show ${state.label}` }));

    expect(preview.getAttribute('data-lb-preview-state')).toBe(state.id);
    expect((await screen.findAllByText(expectedStateCopy[state.id])).length).toBeGreaterThan(0);

    const family = state.id.split('-')[0];
    if (family === 'auth' || family === 'library' || family === 'account') {
      expect(document.querySelector(`[data-lb-presentation="${family}"]`)).toBeTruthy();
    }
  });

  it('keeps only deterministic fictional item content inside the production Library surface', () => {
    render(<LearningBoredPreview />);
    fireEvent.click(screen.getByRole('button', { name: 'Show Imported library' }));

    const fixtureItems = screen.getByRole('list', { name: 'Imported fixture books' });
    expect(fixtureItems.getAttribute('data-lb-preview-content')).toBe('fictional-library-items');
    expect(document.querySelector('[data-lb-presentation="library"]')).toBeTruthy();

    const previewSource = readSource('integrations/learningbored/preview/LearningBoredPreview.tsx');
    expect(previewSource).toContain(
      'canonical Bookshelf owns Reader stores and import/open effects',
    );
    expect(previewSource).not.toMatch(/from ['"]@\/app\/library\/components\/Bookshelf/u);
  });

  it('reuses production presentation pieces without importing side-effect clients or stores', () => {
    const previewSources = [
      readSource('integrations/learningbored/preview/LearningBoredPreview.tsx'),
      readSource('integrations/learningbored/preview/LearningBoredStudyPreview.tsx'),
      readSource('integrations/learningbored/preview/fixtures.ts'),
      readSource('integrations/learningbored/preview/study-fixtures.ts'),
      readSource('integrations/learningbored/preview/contract.ts'),
      readSource('app/design/learningbored/page.preview.tsx'),
      readSource('app/error.tsx'),
    ].join('\n');

    expect(previewSources).toContain('LearningBoredAuthPresentation');
    expect(previewSources).toContain('LearningBoredAuthStatus');
    expect(previewSources).toContain('LearningBoredLibraryPresentation');
    expect(previewSources).toContain('LearningBoredLibrarySurface');
    expect(previewSources).toContain('LearningBoredLibraryLoadingState');
    expect(previewSources).toContain('LearningBoredLibraryEmptyState');
    expect(previewSources).toContain('LearningBoredLibraryStatus');
    expect(previewSources).toContain('LearningBoredAccountPresentation');
    expect(previewSources).toContain('LearningBoredClientProvider');
    expect(previewSources).toContain('LearningBoredPresentationThemeProvider');
    expect(previewSources).toContain('LearningBoredWorkSurfaceShell');
    expect(previewSources).toContain('LearningBoredGenerationState');
    expect(previewSources).toContain('LearningBoredBoardSurface');
    expect(previewSources).toContain('LearningBoredFigureSurface');
    expect(previewSources).toContain('LearningBoredComprehensionState');
    expect(previewSources).toContain('LearningBoredProgressPanel');
    expect(previewSources).toContain('LearningBoredReviewSurfaceShell');
    expect(previewSources).not.toContain("from '../LearningBoredReviewPanel'");
    expect(previewSources).toContain('example.invalid');
    expect(previewSources).toContain("lazy(() => import('@/components/ReaderApplicationError'))");

    for (const forbidden of [
      /\bfetch\s*\(/u,
      /\bXMLHttpRequest\b/u,
      /\bWebSocket\b/u,
      /useLearningBoredClient/u,
      /LearningBoredSdkClientProvider/u,
      /from ['"]@\/store\//u,
      /\blocalStorage\b/u,
      /\bsessionStorage\b/u,
      /\bsupabase\b/iu,
      /\bposthog\b/iu,
    ]) {
      expect(previewSources).not.toMatch(forbidden);
    }

    const previewPresentationSources = [
      readSource('integrations/learningbored/presentation/LearningBoredAuthPresentation.tsx'),
      readSource('integrations/learningbored/presentation/LearningBoredLibraryPresentation.tsx'),
      readSource('integrations/learningbored/presentation/LearningBoredLibraryStatus.tsx'),
      readSource('integrations/learningbored/presentation/LearningBoredAccountPresentation.tsx'),
      readSource('integrations/learningbored/presentation/context.tsx'),
    ].join('\n');

    for (const forbidden of [
      /from ['"]@\/hooks\/useTranslation/u,
      /from ['"]@\/store\//u,
      /from ['"]@\/app\/user\/components\/Header/u,
      /from ['"]\.\/theme/u,
    ]) {
      expect(previewPresentationSources).not.toMatch(forbidden);
    }
  });

  it('keeps production navigation and account-deletion actions inside the local fixture', () => {
    render(<LearningBoredPreview />);

    fireEvent.click(screen.getByRole('button', { name: 'Show Imported library' }));
    expect(document.querySelector('a[href="/library"], a[href="/user"]')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Library' }));
    expect(
      screen.getByText('Kept the fixture library navigation inside this preview.'),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Account' }));
    expect(
      screen.getByText('Kept the fixture account navigation inside this preview.'),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Show Active beta account' }));
    expect(document.querySelector('a[href^="mailto:"]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Request account deletion' }));
    expect(screen.getByText('Prepared a fixture-only deletion request.')).toBeTruthy();
  });
});
