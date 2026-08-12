import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';

import {
  LEARNINGBORED_PREVIEW_GROUPS,
  LEARNINGBORED_PREVIEW_THEMES,
  type LearningBoredPreviewState,
  type LearningBoredPreviewTheme,
} from '../../src/integrations/learningbored/preview/contract';

const previewPath = '/design/learningbored';
const previewRegionName = 'LearningBored Reader state preview';
const responsiveHarnessCss = `
  [data-lb-test-responsive-plane='true'] > header,
  [data-lb-test-responsive-plane='true'] > div > aside,
  [data-lb-test-responsive-plane='true'] #preview-state-plane > header,
  [data-lb-test-responsive-plane='true'] #preview-state-plane > footer {
    display: none !important;
  }

  [data-lb-test-responsive-plane='true'] > div {
    display: block !important;
    min-height: 0 !important;
  }

  [data-lb-test-responsive-plane='true'] #preview-state-plane {
    width: 100vw !important;
    margin: 0 !important;
    padding: 0 !important;
  }

  [data-lb-test-responsive-plane='true'] #preview-state-plane > div {
    width: 100vw !important;
    max-width: none !important;
    min-height: 100vh !important;
    margin: 0 !important;
    padding: 0 !important;
  }
`;

const previewStates = LEARNINGBORED_PREVIEW_GROUPS.flatMap<LearningBoredPreviewState>(
  (group) => group.states as readonly LearningBoredPreviewState[],
);

const themeLabels = {
  light: 'Light',
  dark: 'Dark',
  eink: 'E-ink',
} as const satisfies Record<LearningBoredPreviewTheme, string>;

const themes = LEARNINGBORED_PREVIEW_THEMES;
const responsiveWidths = [375, 639, 640, 1440] as const;
const axeWcagTags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] as const;

const screenshotCases = [
  { stateId: 'auth-sign-in', label: 'Sign in', theme: 'dark', width: 375 },
  { stateId: 'library-imported', label: 'Imported library', theme: 'eink', width: 640 },
  { stateId: 'account-ready', label: 'Active beta account', theme: 'light', width: 1440 },
  { stateId: 'primitive-error', label: 'Error primitive', theme: 'dark', width: 639 },
] as const;

interface RuntimeSignals {
  consoleErrors: string[];
  pageErrors: string[];
  requestFailures: string[];
}

const runtimeSignals = new WeakMap<Page, RuntimeSignals>();

function observeRuntime(page: Page): RuntimeSignals {
  const signals: RuntimeSignals = {
    consoleErrors: [],
    pageErrors: [],
    requestFailures: [],
  };

  page.on('console', (message) => {
    if (message.type() === 'error') signals.consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => signals.pageErrors.push(error.message));
  page.on('requestfailed', (request) => {
    signals.requestFailures.push(
      `${request.method()} ${request.url()} (${request.failure()?.errorText ?? 'unknown failure'})`,
    );
  });
  runtimeSignals.set(page, signals);
  return signals;
}

function expectCleanRuntime(page: Page, testInfo: TestInfo): void {
  const signals = runtimeSignals.get(page);
  if (!signals || testInfo.status === 'skipped') return;

  expect.soft(signals.pageErrors, 'uncaught page errors').toEqual([]);
  expect.soft(signals.consoleErrors, 'browser console errors').toEqual([]);
  expect.soft(signals.requestFailures, 'failed browser requests').toEqual([]);
}

async function openPreview(page: Page): Promise<void> {
  await page.goto(previewPath);
  await expect(page.getByRole('region', { name: previewRegionName })).toHaveAttribute(
    'data-lb-preview-fixture',
    'deterministic',
  );
}

async function setResponsiveProductPlane(page: Page, enabled: boolean): Promise<void> {
  const preview = page.getByRole('region', { name: previewRegionName });
  await preview.evaluate(
    (element, options) => {
      let style = document.querySelector<HTMLStyleElement>('style[data-lb-test-responsive-plane]');
      if (!style) {
        style = document.createElement('style');
        style.dataset['lbTestResponsivePlane'] = 'true';
        style.textContent = options.css;
        document.head.append(style);
      }

      if (options.enabled) element.setAttribute('data-lb-test-responsive-plane', 'true');
      else element.removeAttribute('data-lb-test-responsive-plane');
    },
    { css: responsiveHarnessCss, enabled },
  );
}

async function expectProductPlaneWidth(page: Page, width: number): Promise<void> {
  const dimensions = await page.locator('#preview-state-plane').evaluate((statePlane) => {
    const renderStage = statePlane.children.item(1) as HTMLElement | null;
    const presentation = renderStage?.querySelector<HTMLElement>('[data-lb-presentation]');
    return {
      presentation: presentation?.getBoundingClientRect().width ?? null,
      renderStage: renderStage?.getBoundingClientRect().width ?? null,
      statePlane: statePlane.getBoundingClientRect().width,
    };
  });

  expect(dimensions.statePlane).toBe(width);
  expect(dimensions.renderStage).toBe(width);
  if (dimensions.presentation !== null) expect(dimensions.presentation).toBe(width);
}

async function selectState(page: Page, label: string, stateId: string): Promise<void> {
  await page.getByRole('button', { name: `Show ${label}`, exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'LearningBored Reader state preview' }),
  ).toHaveAttribute('data-lb-preview-state', stateId);
}

async function selectTheme(page: Page, theme: LearningBoredPreviewTheme): Promise<void> {
  const label = themeLabels[theme];
  await page.getByRole('button', { name: label, exact: true }).click();
  await expect(page.getByRole('button', { name: label, exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
}

test.beforeEach(async ({ page }) => {
  observeRuntime(page);
});

test.afterEach(async ({ page }, testInfo) => {
  expectCleanRuntime(page, testInfo);
});

test.describe('Reader LearningBored deterministic matrix', () => {
  test('covers every auth, library, account, and primitive state in every theme', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openPreview(page);

    for (const theme of themes) {
      await selectTheme(page, theme);
      for (const state of previewStates) {
        await selectState(page, state.label, state.id);
        await expect(page.getByRole('heading', { name: state.label, exact: true })).toBeVisible();
      }
    }
  });

  test('has no horizontal page overflow at the responsive boundary widths', async ({ page }) => {
    await openPreview(page);

    for (const width of responsiveWidths) {
      await page.setViewportSize({ width, height: 900 });
      for (const state of previewStates) {
        await setResponsiveProductPlane(page, false);
        await selectState(page, state.label, state.id);
        await setResponsiveProductPlane(page, true);
        await expectProductPlaneWidth(page, width);
        await expect
          .poll(() =>
            page.evaluate(() => ({
              body: document.body.scrollWidth,
              document: document.documentElement.scrollWidth,
              viewport: document.documentElement.clientWidth,
            })),
          )
          .toEqual({ body: width, document: width, viewport: width });
      }
    }
  });

  test('keeps the 640px library header action on one line', async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 900 });
    await openPreview(page);
    await selectState(page, 'Imported library', 'library-imported');
    await setResponsiveProductPlane(page, true);

    const headerImport = page.getByRole('main').getByRole('button', { name: 'Import' }).first();
    await expect(headerImport).toBeVisible();
    expect(
      await headerImport.evaluate((button) => {
        const textNode = Array.from(button.childNodes).find(
          (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
        );
        if (!textNode) return 0;
        const range = document.createRange();
        range.selectNodeContents(textNode);
        return new Set(Array.from(range.getClientRects(), (rect) => Math.round(rect.top))).size;
      }),
    ).toBe(1);
  });

  test('exposes landmarks, skip navigation, theme state, and local-only interactions', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openPreview(page);

    await expect(
      page.getByRole('heading', { level: 1, name: 'Reader state preview' }),
    ).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Preview states' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Preview theme' })).toBeVisible();

    const renderedStateButtons = await page
      .getByRole('button', { name: /^Show /u })
      .evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label')));
    expect(renderedStateButtons).toEqual(previewStates.map((state) => `Show ${state.label}`));

    const skip = page.getByRole('button', { name: 'Skip to state preview' });
    await skip.focus();
    await skip.press('Enter');
    await expect(page.locator('#preview-state-plane')).toBeFocused();

    await selectTheme(page, 'eink');
    await expect(
      page.getByRole('region', { name: 'LearningBored Reader state preview' }),
    ).toHaveAttribute('data-lb-theme', 'eink');

    await selectState(page, 'Imported library', 'library-imported');
    await page.getByRole('button', { name: 'Open', exact: true }).first().click();
    await expect(page.getByText(/^Opened fixture book:/u)).toBeVisible();
    await expect(page.locator('a[href="/library"], a[href="/user"]')).toHaveCount(0);

    await selectState(page, 'Sign in', 'auth-sign-in');
    const email = page.getByRole('textbox', { name: 'Email address' });
    await email.focus();
    await page.keyboard.type('learner@example.invalid');
    await page.keyboard.press('Tab');
    await page.keyboard.type('correct horse paper board');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await expect(
      page.getByText('Submitted fixture credentials without a provider request.'),
    ).toBeVisible();
  });

  for (const theme of themes) {
    for (const state of previewStates) {
      test(`axe: ${state.id} in ${theme}`, async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 1000 });
        await openPreview(page);
        await selectTheme(page, theme);
        await selectState(page, state.label, state.id);

        const results = await new AxeBuilder({ page })
          .include('#preview-state-plane')
          .withTags([...axeWcagTags])
          .analyze();
        expect(results.violations).toEqual([]);
      });
    }
  }

  test('keeps the preview on its deterministic local fixture boundary', async ({ page }) => {
    const forbiddenRequests: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      const isPreviewDocument = url.pathname === previewPath;
      const isNextAsset = url.pathname.startsWith('/_next/');
      const isStaticAsset = /\.(?:css|gif|ico|jpe?g|js|json|otf|png|svg|ttf|webp|woff2?)$/u.test(
        url.pathname,
      );
      if (
        url.origin !== 'http://127.0.0.1:3310' ||
        url.pathname.startsWith('/api/') ||
        (!isPreviewDocument && !isNextAsset && !isStaticAsset)
      ) {
        forbiddenRequests.push(`${request.method()} ${request.url()}`);
      }
    });

    await openPreview(page);
    for (const state of previewStates) {
      await selectState(page, state.label, state.id);
    }

    expect(forbiddenRequests).toEqual([]);
    expect(
      await page.evaluate(() => ({
        localStorage: Object.keys(window.localStorage),
        sessionStorage: Object.keys(window.sessionStorage),
      })),
    ).toEqual({ localStorage: [], sessionStorage: [] });
  });

  test.describe('mobile touch and e-ink', () => {
    test.use({
      hasTouch: true,
      isMobile: true,
      viewport: { width: 375, height: 900 },
    });

    test('supports tap interaction and has no serious accessibility violations', async ({
      page,
    }) => {
      await openPreview(page);
      await page.getByRole('button', { name: 'E-ink', exact: true }).tap();
      await page.getByRole('button', { name: 'Show Imported library', exact: true }).tap();
      await setResponsiveProductPlane(page, true);
      await expectProductPlaneWidth(page, 375);
      await expect(page.getByRole('region', { name: previewRegionName })).toHaveAttribute(
        'data-lb-theme',
        'eink',
      );
      await expect(page.getByRole('heading', { name: 'Your Library', exact: true })).toBeVisible();

      const results = await new AxeBuilder({ page })
        .include('#preview-state-plane')
        .withTags([...axeWcagTags])
        .analyze();
      expect(results.violations).toEqual([]);
    });
  });

  for (const screenshotCase of screenshotCases) {
    test(`@visual ${screenshotCase.stateId}-${screenshotCase.width}-${screenshotCase.theme.toLowerCase()}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: screenshotCase.width, height: 1000 });
      await openPreview(page);
      await selectTheme(page, screenshotCase.theme);
      await selectState(page, screenshotCase.label, screenshotCase.stateId);
      await setResponsiveProductPlane(page, true);
      await expectProductPlaneWidth(page, screenshotCase.width);
      await page.evaluate(async () => {
        await document.fonts.ready;
      });

      const statePlane = page.locator('#preview-state-plane');
      await expect(statePlane).toHaveScreenshot(
        `${screenshotCase.stateId}-${screenshotCase.width}-${screenshotCase.theme}.png`,
      );
    });
  }
});
