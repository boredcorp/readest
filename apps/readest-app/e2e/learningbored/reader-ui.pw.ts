import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';

import { LEARNINGBORED_BOARD_KINDS } from '../../src/integrations/learningbored/client';
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

  [data-lb-test-responsive-plane='true'] [data-lb-preview-study-scene='true'] {
    height: 100dvh !important;
    min-height: 0 !important;
  }
`;

const previewStates = LEARNINGBORED_PREVIEW_GROUPS.flatMap<LearningBoredPreviewState>(
  (group) => group.states as readonly LearningBoredPreviewState[],
);
const controlInventoryStateChunks = LEARNINGBORED_PREVIEW_GROUPS.flatMap((group) =>
  Array.from({ length: Math.ceil(group.states.length / 3) }, (_, chunkIndex) => ({
    chunkIndex: chunkIndex + 1,
    groupId: group.id,
    states: group.states.slice(chunkIndex * 3, chunkIndex * 3 + 3),
  })),
);

const themeLabels = {
  light: 'Light',
  dark: 'Dark',
  eink: 'E-ink',
} as const satisfies Record<LearningBoredPreviewTheme, string>;

const themes = LEARNINGBORED_PREVIEW_THEMES;
const responsiveWidths = [375, 639, 640, 768, 1440] as const;
const clearActionWidths = [375, 639, 640, 768, 1440] as const;
const assistiveWidths = [375, 1440] as const;
const axeWcagTags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] as const;

const assistiveRepresentativeStates = [
  { groupId: 'auth', stateId: 'auth-sign-in', label: 'Sign in' },
  { groupId: 'library', stateId: 'library-imported', label: 'Imported library' },
  { groupId: 'account', stateId: 'account-ready', label: 'Active beta account' },
  { groupId: 'capture', stateId: 'capture-ready', label: 'Selection ready' },
  {
    groupId: 'generation',
    stateId: 'generation-failed-refunded',
    label: 'Failed and refunded',
  },
  { groupId: 'board', stateId: 'board-complete', label: 'Complete Board' },
  {
    groupId: 'figure',
    stateId: 'figure-replacement-confirm',
    label: 'Replace Figure',
  },
  {
    groupId: 'comprehension',
    stateId: 'comprehension-unanswered',
    label: 'Comprehension check',
  },
  { groupId: 'progress', stateId: 'progress-overview', label: 'Four mastery states' },
  { groupId: 'review', stateId: 'review-start', label: 'Review start' },
  { groupId: 'primitives', stateId: 'primitive-action', label: 'Action primitive' },
] as const satisfies readonly {
  groupId: (typeof LEARNINGBORED_PREVIEW_GROUPS)[number]['id'];
  stateId: LearningBoredPreviewState['id'];
  label: string;
}[];

const reachableControlSelector =
  ':is(a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="menuitem"], [role="checkbox"], [role="radio"], [role="switch"], [tabindex="0"]):not(:disabled):not([aria-disabled="true"])';

const expandedPassageActionLabels = {
  trigger: 'Aktionen für den vollständig erfassten und ausführlich beschriebenen Textabschnitt',
  menuItem:
    'Den vollständig erfassten und ausführlich beschriebenen Textabschnitt dauerhaft leeren',
  confirmation:
    'Diesen vollständig erfassten und ausführlich beschriebenen Textabschnitt wirklich leeren?',
  cancel: 'Vorgang abbrechen und zum sicheren Ausgangspunkt zurückkehren',
  confirm: 'Erfassten Textabschnitt leeren',
} as const;

const screenshotCases = [
  { stateId: 'auth-sign-in', label: 'Sign in', theme: 'dark', width: 375 },
  { stateId: 'library-imported', label: 'Imported library', theme: 'eink', width: 640 },
  { stateId: 'account-ready', label: 'Active beta account', theme: 'light', width: 1440 },
  { stateId: 'primitive-error', label: 'Error primitive', theme: 'dark', width: 639 },
  { stateId: 'capture-ready', label: 'Selection ready', theme: 'light', width: 640 },
  {
    stateId: 'generation-illustrating',
    label: 'Illustrating Figure',
    theme: 'dark',
    width: 639,
  },
  { stateId: 'board-complete', label: 'Complete Board', theme: 'eink', width: 640 },
  {
    stateId: 'figure-replacement-failed-refunded',
    label: 'Replacement failed and refunded',
    theme: 'dark',
    width: 1440,
  },
  { stateId: 'progress-overview', label: 'Four mastery states', theme: 'eink', width: 375 },
  {
    stateId: 'readiness-objectives',
    label: 'Attached exam readiness',
    theme: 'dark',
    width: 1440,
  },
  { stateId: 'review-question', label: 'Answer-free question', theme: 'light', width: 375 },
  { stateId: 'review-revealed', label: 'Revealed answer', theme: 'dark', width: 1440 },
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
    const studyScene = renderStage?.querySelector<HTMLElement>('[data-lb-preview-study-scene]');
    return {
      product: (studyScene ?? presentation)?.getBoundingClientRect().width ?? null,
      renderStage: renderStage?.getBoundingClientRect().width ?? null,
      statePlane: statePlane.getBoundingClientRect().width,
    };
  });

  expect(dimensions.statePlane).toBe(width);
  expect(dimensions.renderStage).toBe(width);
  if (dimensions.product !== null) expect(dimensions.product).toBe(width);
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

async function openStudyState(
  page: Page,
  state: { label: string; stateId: string },
  width: number,
): Promise<void> {
  await page.setViewportSize({ width, height: 900 });
  await openPreview(page);
  await selectState(page, state.label, state.stateId);
  await setResponsiveProductPlane(page, true);
  await expectProductPlaneWidth(page, width);
  await expect(page.locator('[data-lb-preview-study-scene="true"]')).toBeVisible();
}

async function selectResponsiveState(page: Page, label: string, stateId: string): Promise<void> {
  await setResponsiveProductPlane(page, false);
  await selectState(page, label, stateId);
  await setResponsiveProductPlane(page, true);
}

async function selectResponsiveInventoryState(
  page: Page,
  label: string,
  stateId: string,
): Promise<void> {
  await setResponsiveProductPlane(page, false);
  await page
    .getByRole('button', { name: `Show ${label}`, exact: true })
    .evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.getByRole('region', { name: previewRegionName })).toHaveAttribute(
    'data-lb-preview-state',
    stateId,
  );
  await setResponsiveProductPlane(page, true);
}

function productRenderStage(page: Page): Locator {
  return page.locator('#preview-state-plane > div').first();
}

async function expectNoHorizontalOverflow(
  page: Page,
  width: number,
  context: string,
): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(() => ({
          body: document.body.scrollWidth,
          document: document.documentElement.scrollWidth,
          viewport: document.documentElement.clientWidth,
        })),
      { message: `${context} has no horizontal page overflow` },
    )
    .toEqual({ body: width, document: width, viewport: width });
}

async function expectRenderedContent(page: Page, context: string): Promise<void> {
  const stage = productRenderStage(page);
  await expect(stage, `${context} render stage`).toBeVisible();
  const content = await stage.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const visibleText = Array.from(element.querySelectorAll<HTMLElement>('*'))
      .filter((candidate) => candidate.getClientRects().length > 0)
      .map((candidate) => candidate.textContent?.trim() ?? '')
      .find((text) => text.length > 0);
    return { height: rect.height, textLength: visibleText?.length ?? 0, width: rect.width };
  });
  expect.soft(content.height, `${context} render height`).toBeGreaterThan(0);
  expect.soft(content.width, `${context} render width`).toBeGreaterThan(0);
  expect.soft(content.textLength, `${context} retains visible text`).toBeGreaterThan(0);
}

async function expectNoClippedText(page: Page, context: string): Promise<void> {
  const clipped = await productRenderStage(page).evaluate((stage) =>
    Array.from(
      stage.querySelectorAll<HTMLElement>(
        'a, button, dd, dt, figcaption, h1, h2, h3, h4, label, legend, li, p, summary',
      ),
    )
      .filter((element) => {
        if (element.getClientRects().length === 0 || !element.innerText.trim()) return false;
        const style = getComputedStyle(element);
        if (
          (style.clipPath !== 'none' && style.clipPath !== '') ||
          (style.position === 'absolute' && element.clientHeight <= 1 && element.clientWidth <= 1)
        ) {
          return false;
        }
        const clipsInline = ['clip', 'hidden'].includes(style.overflowX);
        const clipsBlock = ['clip', 'hidden'].includes(style.overflowY);
        return (
          (clipsInline && element.scrollWidth > element.clientWidth + 1) ||
          (clipsBlock && element.scrollHeight > element.clientHeight + 1)
        );
      })
      .map((element) =>
        (element.getAttribute('aria-label') ?? element.innerText)
          .replace(/\s+/gu, ' ')
          .slice(0, 90),
      ),
  );
  expect.soft(clipped, `${context} has no clipped text`).toEqual([]);
}

async function getVisibleControls(root: Locator): Promise<Locator[]> {
  const candidates = root.locator(reachableControlSelector);
  const controls: Locator[] = [];
  for (let index = 0; index < (await candidates.count()); index += 1) {
    const candidate = candidates.nth(index);
    if (await candidate.isVisible()) controls.push(candidate);
  }
  return controls;
}

async function expectControlInventory(page: Page, root: Locator, context: string): Promise<number> {
  const controls = await getVisibleControls(root);

  for (let index = 0; index < controls.length; index += 1) {
    const control = controls[index];
    const identity = await control.evaluate((element, controlIndex) => {
      const text = element.textContent?.replace(/\s+/gu, ' ').trim();
      return (
        element.getAttribute('aria-label') ??
        element.getAttribute('name') ??
        text ??
        `${element.tagName.toLowerCase()} ${controlIndex + 1}`
      ).slice(0, 90);
    }, index);
    const controlContext = `${context}: ${identity || `control ${index + 1}`}`;

    await expect
      .soft(control, `${controlContext} has an accessible name`)
      .toHaveAccessibleName(/\S/u);

    const target = await control.evaluate((element) => {
      const activationTargets = new Set<HTMLElement>();
      if (element instanceof HTMLElement) activationTargets.add(element);
      if (element instanceof HTMLInputElement) {
        for (const label of Array.from(element.labels ?? [])) activationTargets.add(label);
      }
      const wrappingLabel = element.closest('label');
      if (wrappingLabel) activationTargets.add(wrappingLabel);

      const candidates = Array.from(activationTargets, (targetElement) => {
        const rect = targetElement.getBoundingClientRect();
        return { height: rect.height, width: rect.width };
      });
      return candidates.sort(
        (left, right) => right.height * right.width - left.height * left.width,
      )[0];
    });
    expect
      .soft(target?.height ?? 0, `${controlContext} activation height`)
      .toBeGreaterThanOrEqual(44);
    expect
      .soft(target?.width ?? 0, `${controlContext} activation width`)
      .toBeGreaterThanOrEqual(44);

    await page.keyboard.press('Tab');
    const focus = await control.evaluate(async (element) => {
      const candidates = new Set<Element>();
      const addCandidate = (candidate: Element | null | undefined) => {
        if (candidate) candidates.add(candidate);
      };

      addCandidate(element);
      addCandidate(element.previousElementSibling);
      addCandidate(element.nextElementSibling);
      if (element instanceof HTMLInputElement) {
        for (const label of Array.from(element.labels ?? [])) addCandidate(label);
      }

      let ancestor = element.parentElement;
      for (let depth = 0; ancestor && depth < 4; depth += 1) {
        addCandidate(ancestor);
        addCandidate(ancestor.previousElementSibling);
        addCandidate(ancestor.nextElementSibling);
        ancestor = ancestor.parentElement;
      }

      const styleSignature = (candidate: Element): string => {
        const serialize = (style: CSSStyleDeclaration) =>
          [
            style.outlineColor,
            style.outlineOffset,
            style.outlineStyle,
            style.outlineWidth,
            style.boxShadow,
            style.borderBlockEndColor,
            style.borderBlockStartColor,
            style.borderInlineEndColor,
            style.borderInlineStartColor,
            style.backgroundColor,
            style.color,
            style.textDecorationColor,
            style.textDecorationLine,
            style.textDecorationStyle,
            style.opacity,
          ].join('|');
        return [
          serialize(getComputedStyle(candidate)),
          serialize(getComputedStyle(candidate, '::before')),
          serialize(getComputedStyle(candidate, '::after')),
        ].join('||');
      };
      const visibleOutline = (candidate: Element): boolean => {
        const style = getComputedStyle(candidate);
        return (
          ((style.outlineStyle !== 'none' && style.outlineStyle !== 'hidden') ||
            style.boxShadow !== 'none') &&
          candidate.getClientRects().length > 0
        );
      };

      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const targets = Array.from(candidates);
      const before = targets.map(styleSignature);
      if (element instanceof HTMLElement) element.focus({ preventScroll: true });
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      const after = targets.map(styleSignature);

      return {
        focused: document.activeElement === element,
        visible:
          after.some((signature, candidateIndex) => signature !== before[candidateIndex]) ||
          targets.some(visibleOutline),
      };
    });
    expect.soft(focus.focused, `${controlContext} accepts focus`).toBe(true);
    expect.soft(focus.visible, `${controlContext} has visible focus treatment`).toBe(true);
  }

  return controls.length;
}

test.beforeEach(async ({ page }) => {
  observeRuntime(page);
});

test.afterEach(async ({ page }, testInfo) => {
  expectCleanRuntime(page, testInfo);
});

test.describe('Reader LearningBored deterministic matrix', () => {
  test('covers every deterministic Reader state in every theme', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openPreview(page);

    for (const theme of themes) {
      await selectTheme(page, theme);
      for (const state of previewStates) {
        await selectState(page, state.label, state.id);
        await expect(page.locator('#preview-state-heading')).toHaveText(state.label);
      }
    }
  });

  for (const theme of themes) {
    for (const width of responsiveWidths) {
      for (const group of LEARNINGBORED_PREVIEW_GROUPS) {
        test(`responsive matrix: ${group.id} in ${theme} at ${width}px`, async ({ page }) => {
          await page.setViewportSize({ width, height: 900 });
          await openPreview(page);
          await selectTheme(page, theme);

          for (const state of group.states) {
            await selectResponsiveState(page, state.label, state.id);
            await expectProductPlaneWidth(page, width);
            await expectNoHorizontalOverflow(page, width, `${state.id} in ${theme} at ${width}px`);
          }
        });
      }
    }
  }

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

  test('keeps Capture, Board, Progress, and Review in their normal-flow topology', async ({
    page,
  }) => {
    const topologyStates = [
      { label: 'Selection ready', stateId: 'capture-ready', mobileHeightRatio: 0.44 },
      { label: 'Complete Board', stateId: 'board-complete', mobileHeightRatio: 0.44 },
      { label: 'Four mastery states', stateId: 'progress-overview', mobileHeightRatio: 0.44 },
      { label: 'Review start', stateId: 'review-start', mobileHeightRatio: 0.78 },
    ] as const;
    const topologyViewports = [
      { width: 375, height: 900 },
      { width: 639, height: 900 },
      { width: 640, height: 900 },
      { width: 1440, height: 900 },
      { width: 639, height: 375 },
    ] as const;

    await page.setViewportSize({ width: 375, height: 900 });
    await openPreview(page);

    for (const { width, height } of topologyViewports) {
      await page.setViewportSize({ width, height });

      for (const state of topologyStates) {
        await selectResponsiveState(page, state.label, state.stateId);
        await expectProductPlaneWidth(page, width);

        const geometry = await page
          .locator('[data-lb-preview-study-scene="true"]')
          .evaluate((scene) => {
            const book = scene.querySelector<HTMLElement>('[data-lb-preview-book="true"]');
            const panel = scene.querySelector<HTMLElement>(
              '[data-testid="learningbored-work-surface"], .learningbored-progress, [data-testid="learningbored-review-panel"]',
            );
            if (!book || !panel) throw new Error('Study preview siblings are missing.');
            const sceneRect = scene.getBoundingClientRect();
            const bookRect = book.getBoundingClientRect();
            const panelRect = panel.getBoundingClientRect();
            const overlapWidth = Math.max(
              0,
              Math.min(bookRect.right, panelRect.right) - Math.max(bookRect.left, panelRect.left),
            );
            const overlapHeight = Math.max(
              0,
              Math.min(bookRect.bottom, panelRect.bottom) - Math.max(bookRect.top, panelRect.top),
            );
            const fixedDescendants = Array.from(panel.querySelectorAll<HTMLElement>('*')).filter(
              (element) => getComputedStyle(element).position === 'fixed',
            );
            return {
              book: {
                bottom: bookRect.bottom,
                height: bookRect.height,
                left: bookRect.left,
                right: bookRect.right,
              },
              falseAffordances:
                fixedDescendants.length +
                panel.querySelectorAll(
                  '[aria-modal="true"], [data-backdrop], [data-drag-handle], [draggable="true"], [role="dialog"], [aria-label*="drag" i], [aria-label*="resize" i]',
                ).length,
              overlapArea: overlapWidth * overlapHeight,
              panel: {
                height: panelRect.height,
                left: panelRect.left,
                position: getComputedStyle(panel).position,
                top: panelRect.top,
                width: panelRect.width,
              },
              scene: { height: sceneRect.height, top: sceneRect.top },
              siblingOrder:
                Array.from(scene.children).indexOf(book) <
                Array.from(scene.children).indexOf(panel),
            };
          });

        expect(geometry.falseAffordances).toBe(0);
        expect(geometry.overlapArea).toBe(0);
        expect(
          geometry.book.height,
          `${state.stateId} at ${width}×${height} keeps a visible Reader book sibling (${JSON.stringify(geometry)})`,
        ).toBeGreaterThan(0);
        expect(geometry.panel.position).not.toBe('fixed');
        expect(geometry.siblingOrder).toBe(true);
        if (width < 640) {
          expect(Math.abs(geometry.book.bottom - geometry.panel.top)).toBeLessThanOrEqual(1);
          expect(Math.abs(geometry.book.left - geometry.panel.left)).toBeLessThanOrEqual(1);
          expect(
            Math.abs(geometry.panel.height - height * state.mobileHeightRatio),
            `${state.stateId} at ${width}×${height} uses its approved mobile height`,
          ).toBeLessThanOrEqual(1);
          expect(geometry.panel.width).toBeGreaterThanOrEqual(width - 2);
        } else {
          expect(Math.abs(geometry.book.right - geometry.panel.left)).toBeLessThanOrEqual(1);
          expect(Math.abs(geometry.scene.top - geometry.panel.top)).toBeLessThanOrEqual(1);
          expect(Math.abs(geometry.scene.height - geometry.panel.height)).toBeLessThanOrEqual(2);
          expect(geometry.panel.width).toBeGreaterThanOrEqual(360);
          expect(geometry.panel.width).toBeLessThanOrEqual(520);
        }
      }
    }
  });

  test('uses outline-first mobile Boards and a native-scale, keyboard-pannable SVG on desktop', async ({
    page,
  }) => {
    await openStudyState(page, { label: 'Complete Board', stateId: 'board-complete' }, 375);

    const outline = page.getByRole('list', { name: 'Board text outline' });
    await expect(outline).toBeVisible();
    await expect(page.locator('.learningbored-svg')).toBeHidden();
    await expect(page.locator('.learningbored-figure-projection')).toBeVisible();
    await expect(page.getByText('Settling chamber Figure', { exact: true })).toBeVisible();

    await selectResponsiveState(page, 'Board without SVG', 'board-svg-unavailable');
    const mobileFigureRegions = page.getByTestId('learningbored-figure-pan');
    await expect(mobileFigureRegions).toHaveCount(2);
    await expect(mobileFigureRegions.nth(0)).toHaveAttribute(
      'aria-label',
      /Figure 1 — scroll to explore: A generic chamber receives water/,
    );
    await expect(mobileFigureRegions.nth(1)).toHaveAttribute(
      'aria-label',
      /Figure 2 — scroll to explore: A generic detail view places the upper outlet/,
    );
    const mobileFigureNames = await mobileFigureRegions.evaluateAll((regions) =>
      regions.map((region) => region.getAttribute('aria-label')),
    );
    expect(new Set(mobileFigureNames).size).toBe(2);

    await selectResponsiveState(page, 'Complete Board', 'board-complete');

    for (const width of [640, 1440] as const) {
      await page.setViewportSize({ width, height: 900 });
      await expectProductPlaneWidth(page, width);
      await expect(page.locator('.learningbored-svg')).toBeVisible();
      await expect(outline).toBeVisible();
      await expect(page.locator('.learningbored-figure-projection')).toBeHidden();

      const panRegion = page.getByRole('region', { name: 'Board visual — scroll to explore' });
      await expect(panRegion).toHaveAttribute('tabindex', '0');
      await panRegion.focus();
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      await expect(panRegion).toBeFocused();

      const geometry = await panRegion.evaluate((pan) => {
        const svg = pan.querySelector('svg');
        if (!svg) throw new Error('The desktop Board pan region has no SVG.');
        const panRect = pan.getBoundingClientRect();
        const panStyle = getComputedStyle(pan);
        return {
          clientWidth: pan.clientWidth,
          focusOutlineColor: panStyle.outlineColor,
          focusOutlineStyle: panStyle.outlineStyle,
          focusOutlineWidth: Number.parseFloat(panStyle.outlineWidth),
          pageScrollWidth: document.documentElement.scrollWidth,
          panLeft: panRect.left,
          panRight: panRect.right,
          scrollWidth: pan.scrollWidth,
          svgWidth: svg.getBoundingClientRect().width,
          viewportWidth: window.innerWidth,
        };
      });

      expect(geometry.svgWidth).toBe(920);
      expect(geometry.svgWidth).toBeGreaterThan(geometry.clientWidth);
      expect(geometry.scrollWidth).toBeGreaterThan(geometry.clientWidth);
      expect(geometry.focusOutlineStyle).toBe('solid');
      expect(geometry.focusOutlineWidth).toBeGreaterThanOrEqual(3);
      expect(geometry.focusOutlineColor).not.toBe('rgba(0, 0, 0, 0)');
      expect(geometry.panLeft).toBeGreaterThanOrEqual(0);
      expect(geometry.panRight).toBeLessThanOrEqual(width);
      expect(geometry.pageScrollWidth).toBe(geometry.viewportWidth);

      await panRegion.evaluate((pan) => {
        pan.scrollLeft = 0;
      });
      await page.keyboard.press('ArrowRight');
      await expect
        .poll(() => panRegion.evaluate((pan) => pan.scrollLeft), {
          message: `the ${width}px Board region scrolls from the keyboard`,
        })
        .toBeGreaterThan(0);
    }

    const expectedThemeIds = {
      light: 'miura-deployment-light-v1',
      dark: 'miura-deployment-dark-v1',
      eink: 'miura-deployment-eink-v1',
    } as const;

    for (const theme of themes) {
      await setResponsiveProductPlane(page, false);
      await selectTheme(page, theme);
      await setResponsiveProductPlane(page, true);
      await expect(
        page.locator(
          `.learningbored-svg svg[data-board-theme-source="${expectedThemeIds[theme]}"]`,
        ),
      ).toBeVisible();
    }
  });

  test('names generation cancellation, refund, failure, retry, and serial-poll recovery', async ({
    page,
  }) => {
    await openStudyState(
      page,
      { label: 'Cancelled and refunded', stateId: 'generation-cancelled-refunded' },
      639,
    );
    await expect(page.getByText('Your Chalk was refunded.', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'Start again' }).click();

    await selectResponsiveState(page, 'Failed and refunded', 'generation-failed-refunded');
    await expect(page.getByRole('heading', { name: 'Board generation failed' })).toBeVisible();
    await expect(
      page.getByText('This Board could not be completed', { exact: false }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(
      page.getByText('This Board could not be completed', { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByText('The retry could not be started. Check your connection and try again.'),
    ).toBeVisible();
    await expect(
      page.getByText('Announced the deterministic retry request failure.'),
    ).toBeAttached();
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('heading', { name: 'Retry queued' })).toBeVisible();

    await selectResponsiveState(page, 'Retry recovery', 'generation-retry-recovery');
    await expect(page.getByRole('heading', { name: 'Retry queued' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancel generation' })).toBeEnabled();

    await selectResponsiveState(page, 'Status recovery', 'generation-poll-error');
    await expect(
      page.getByText('latest status could not be loaded', { exact: false }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Finishing the Board' })).toBeVisible();
  });

  test('offers all 13 free Board shapes and toggles scaffold only in local fixture state', async ({
    page,
  }) => {
    await openStudyState(page, { label: 'Complete Board', stateId: 'board-complete' }, 1440);
    const requests: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith('/api/')) requests.push(request.url());
    });

    const kind = page.getByRole('combobox', { name: 'Board shape' });
    expect(
      await kind
        .locator('option')
        .evaluateAll((options) => options.map((option) => option.getAttribute('value'))),
    ).toEqual([...LEARNINGBORED_BOARD_KINDS]);
    await kind.selectOption('timeline');
    await expect(kind).toHaveValue('timeline');
    await expect(
      page.getByText('Changed the deterministic Board shape to timeline without a request.'),
    ).toBeAttached();

    const addedHelp = page.getByRole('checkbox', { name: 'Added help' });
    await expect(addedHelp).toBeChecked();
    expect(await page.locator('[data-provenance="scaffold"]').count()).toBeGreaterThan(0);
    await addedHelp.uncheck();
    await expect(addedHelp).not.toBeChecked();
    await expect(page.locator('[data-provenance="scaffold"]')).toHaveCount(0);
    expect(requests).toEqual([]);
  });

  test('connects keyboard source focus to the preserved passage marker', async ({ page }) => {
    await openStudyState(page, { label: 'Complete Board', stateId: 'board-complete' }, 375);
    const marker = page.locator('mark[data-lb-source-active]');
    const source = page.getByRole('button', {
      name: 'How the fictional settling chamber separates particles',
      exact: true,
    });

    await expect(marker).toHaveAttribute('data-lb-source-active', 'false');
    await source.focus();
    await expect(source).toBeFocused();
    await expect(marker).toHaveAttribute('data-lb-source-active', 'true');
    await expect(marker).toHaveAttribute('data-lb-source-start', '0');
    await page.getByRole('button', { name: 'Close LearningBored panel' }).focus();
    await expect(marker).toHaveAttribute('data-lb-source-active', 'false');
  });

  test('covers Figure fallback, confirmation, progress, success, and refunded failure', async ({
    page,
  }) => {
    await openStudyState(page, { label: 'Figure fallback', stateId: 'figure-load-failure' }, 375);
    await expect(page.getByText('Figure unavailable:', { exact: false })).toBeVisible();
    await expect(
      page.getByText('A generic chamber receives water', { exact: false }).first(),
    ).toBeVisible();

    await selectResponsiveState(page, 'Replace Figure', 'figure-replacement-confirm');
    await expect(page.getByRole('heading', { name: 'Replace this figure?' })).toBeVisible();

    const figurePan = page.getByRole('region', { name: 'Figure visual — scroll to explore' });
    await expect(figurePan).toHaveAttribute('tabindex', '0');
    await figurePan.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(figurePan).toBeFocused();
    const figureGeometry = await figurePan.evaluate((pan) => {
      const svg = pan.querySelector('svg');
      const label = pan.querySelector('svg text');
      if (!svg || !label) throw new Error('The mobile Figure pan region is incomplete.');
      const panRect = pan.getBoundingClientRect();
      const panStyle = getComputedStyle(pan);
      return {
        clientWidth: pan.clientWidth,
        focusOutlineColor: panStyle.outlineColor,
        focusOutlineStyle: panStyle.outlineStyle,
        focusOutlineWidth: Number.parseFloat(panStyle.outlineWidth),
        labelFontSize: getComputedStyle(label).fontSize,
        pageScrollWidth: document.documentElement.scrollWidth,
        panLeft: panRect.left,
        panRight: panRect.right,
        scrollWidth: pan.scrollWidth,
        svgWidth: svg.getBoundingClientRect().width,
        viewportWidth: window.innerWidth,
      };
    });
    expect(figureGeometry.svgWidth).toBe(760);
    expect(figureGeometry.svgWidth).toBeGreaterThan(figureGeometry.clientWidth);
    expect(figureGeometry.scrollWidth).toBeGreaterThan(figureGeometry.clientWidth);
    expect(figureGeometry.focusOutlineStyle).toBe('solid');
    expect(figureGeometry.focusOutlineWidth).toBeGreaterThanOrEqual(3);
    expect(figureGeometry.focusOutlineColor).not.toBe('rgba(0, 0, 0, 0)');
    expect(figureGeometry.labelFontSize).toBe('18px');
    expect(figureGeometry.panLeft).toBeGreaterThanOrEqual(0);
    expect(figureGeometry.panRight).toBeLessThanOrEqual(375);
    expect(figureGeometry.pageScrollWidth).toBe(figureGeometry.viewportWidth);

    await figurePan.evaluate((pan) => {
      pan.scrollLeft = 0;
    });
    await page.keyboard.press('ArrowRight');
    await expect
      .poll(() => figurePan.evaluate((pan) => pan.scrollLeft), {
        message: 'the mobile Figure region scrolls from the keyboard',
      })
      .toBeGreaterThan(0);

    await page.getByRole('combobox', { name: 'What should improve?' }).selectOption('missing_part');
    await page.getByRole('button', { name: 'Use 1 Chalk' }).click();
    await expect(
      page.getByText('Confirmed one deterministic one-Chalk Figure replacement.'),
    ).toBeAttached();

    await selectResponsiveState(page, 'Replacement in progress', 'figure-replacement-progress');
    await expect(
      page.getByRole('heading', { name: 'Drawing the replacement figure' }),
    ).toBeVisible();
    await expect(
      page.getByText('current figure remains available', { exact: false }),
    ).toBeVisible();

    await selectResponsiveState(page, 'Replacement complete', 'figure-replacement-success');
    await expect(page.getByRole('heading', { name: 'Replacement figure ready' })).toBeVisible();
    await expect(page.getByText('1 Chalk charged exactly once.')).toBeVisible();

    await selectResponsiveState(
      page,
      'Replacement failed and refunded',
      'figure-replacement-failed-refunded',
    );
    await expect(page.getByRole('heading', { name: 'Figure replacement failed' })).toBeVisible();
    await expect(page.getByText('Your Chalk was refunded', { exact: false })).toBeVisible();
    await expect(page.getByText('previous figure is unchanged', { exact: false })).toBeVisible();
  });

  test('records both comprehension outcomes without leaving the deterministic Board', async ({
    page,
  }) => {
    await openStudyState(
      page,
      { label: 'Comprehension check', stateId: 'comprehension-unanswered' },
      375,
    );
    await page.getByRole('button', { name: 'Yes, I understand it' }).click();
    await expect(page.getByText('Thanks — your answer was recorded.')).toBeVisible();

    await selectResponsiveState(page, 'Passage clicked', 'comprehension-breakthrough');
    await selectResponsiveState(page, 'Comprehension check', 'comprehension-unanswered');
    await page.getByRole('button', { name: 'I still don’t get it' }).click();
    await expect(page.getByText('Try a different Board kind', { exact: false })).toBeVisible();
    await expect(page.locator('[data-lb-reading-position="chapter-2-page-17"]')).toBeVisible();
  });

  test('keeps Progress actionable and omits every readiness boundary without a blueprint', async ({
    page,
  }) => {
    const readinessRequests: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (/readiness|blueprints?/iu.test(url.pathname)) readinessRequests.push(request.url());
    });

    await openStudyState(page, { label: 'Concept actions', stateId: 'progress-concept' }, 375);
    const progress = page.getByTestId('learningbored-progress-panel');
    await expect(progress).toHaveAttribute('data-lb-theme', 'light');
    for (const tier of ['New', 'Learning', 'Retained', 'Lapsed'] as const) {
      await expect(progress.getByRole('button', { name: `${tier}: 1` })).toBeVisible();
    }
    await expect(progress.getByText('Not started', { exact: true })).toBeVisible();
    await expect(
      progress.getByRole('button', {
        name: /Settling sequence\. Lapsed\. 72%\. 2 due/u,
      }),
    ).toHaveAttribute('aria-expanded', 'true');
    await expect(
      progress.getByRole('region', { name: '2 due items for Settling sequence' }),
    ).toBeVisible();
    await expect(progress.getByText('Due recall item 1', { exact: true })).toBeVisible();
    await expect(progress.getByText('Due recall item 2', { exact: true })).toBeVisible();
    await expect(progress.getByRole('button', { name: 'Open Board' })).toBeVisible();
    await expect(progress.getByRole('button', { name: 'Review this concept' })).toBeVisible();

    await progress.getByRole('button', { name: 'Review this concept' }).click();
    await expect(
      page.getByText('Opened deterministic review for preview-concept-settling.'),
    ).toBeAttached();
    await progress.getByRole('button', { name: 'Open Board' }).click();
    await expect(
      progress.getByRole('heading', {
        name: 'How the fictional settling chamber separates particles',
      }),
    ).toBeVisible();

    await selectResponsiveState(page, 'Four mastery states', 'progress-overview');
    await expect(page.getByText('Readiness by objective', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Attached exam overlay', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Edit exam plan' })).toHaveCount(0);
    expect(readinessRequests).toEqual([]);

    await selectResponsiveState(page, 'Attached exam readiness', 'readiness-objectives');
    await expect(page.getByRole('heading', { name: 'Readiness by objective' })).toBeVisible();
    await expect(page.getByText('Trace the treatment flow', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Trace the treatment flow.*72%/u }),
    ).toBeVisible();

    await selectResponsiveState(page, 'Readiness not started', 'readiness-not-started');
    await expect(
      page.getByRole('button', { name: /Trace the treatment flow.*Not started/u }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Locate generic chamber parts.*Not started/u }),
    ).toBeVisible();
  });

  test('runs the answer-free Review boundary from the keyboard and advances immediately', async ({
    page,
  }) => {
    await openStudyState(page, { label: 'Review start', stateId: 'review-start' }, 375);
    const review = page.getByTestId('learningbored-review-panel');
    await expect(review).toHaveAttribute('data-lb-review-state', 'start');
    await expect(review.getByText('2 questions are due now.', { exact: true })).toBeVisible();
    await review.getByRole('button', { name: 'Begin review' }).click();

    const firstQuestion = review.getByRole('heading', {
      name: 'What happens after water slows inside the fictional settling chamber?',
    });
    await expect(firstQuestion).toBeVisible();
    await expect(firstQuestion).toBeFocused();
    await expect(review.getByText('Answer', { exact: true })).toHaveCount(0);
    await expect(
      review.getByText('Why each choice works or does not', { exact: true }),
    ).toHaveCount(0);
    await expect(review.getByText('Source anchor', { exact: true })).toHaveCount(0);
    await expect(review.getByRole('group', { name: 'Recall grade' })).toHaveCount(0);

    await review.getByRole('radio', { name: 'Denser particles settle downward.' }).check();
    await expect(review).toHaveAttribute('data-lb-review-state', 'selected-choice');
    await firstQuestion.focus();
    await page.keyboard.press('Space');

    const answerLabel = review.getByText('Answer', { exact: true });
    await expect(answerLabel).toBeVisible();
    await expect(answerLabel.locator('..')).toBeFocused();
    await expect(
      review.getByText('Why each choice works or does not', { exact: true }),
    ).toBeVisible();
    await expect(review.getByText('Source anchor', { exact: true })).toBeVisible();
    await expect(review.getByTestId('learningbored-review-status')).toContainText(
      'Answer revealed',
    );

    for (const label of [
      'Again, next review 1 min',
      'Hard, next review 2 min',
      'Good, next review 2 days',
      'Easy, next review 4 days',
    ]) {
      await expect(review.getByRole('button', { name: label })).toBeVisible();
    }

    await page.keyboard.press('3');
    const secondQuestion = review.getByRole('heading', {
      name: 'Where does clarified water leave the fictional chamber?',
    });
    await expect(secondQuestion).toBeVisible();
    await expect(secondQuestion).toBeFocused();
    await expect(review.getByText('Answer', { exact: true })).toHaveCount(0);
  });

  test('keeps one panel and the reading marker through theme, close, and reopen; reloads cleanly', async ({
    page,
  }) => {
    await openStudyState(page, { label: 'Complete Board', stateId: 'board-complete' }, 640);
    const marker = page.locator('[data-lb-reading-position="chapter-2-page-17"]');
    await expect(marker).toHaveCount(1);
    await expect(page.locator('[data-testid="learningbored-work-surface"]')).toHaveCount(1);

    await setResponsiveProductPlane(page, false);
    await selectTheme(page, 'dark');
    await setResponsiveProductPlane(page, true);
    await expect(marker).toHaveCount(1);

    await page.getByRole('button', { name: 'Close LearningBored panel' }).click();
    await expect(page.locator('[data-testid="learningbored-work-surface"]')).toHaveCount(0);
    await expect(marker).toHaveCount(1);
    await page.getByRole('button', { name: 'Reopen LearningBored' }).click();
    await expect(page.locator('[data-testid="learningbored-work-surface"]')).toHaveCount(1);

    await page.reload();
    await expect(page.getByRole('region', { name: previewRegionName })).toHaveAttribute(
      'data-lb-preview-fixture',
      'deterministic',
    );
    await expect(page.getByRole('region', { name: previewRegionName })).toHaveAttribute(
      'data-lb-preview-state',
      'auth-initial',
    );
    await expect(page.locator('[data-testid="learningbored-work-surface"]')).toHaveCount(0);
    expect(
      await page.evaluate(() => ({
        localStorage: Object.keys(window.localStorage),
        sessionStorage: Object.keys(window.sessionStorage),
      })),
    ).toEqual({ localStorage: [], sessionStorage: [] });
  });

  test('keeps the secondary passage and Board actions safe across responsive boundaries', async ({
    page,
  }) => {
    await openStudyState(page, { label: 'Selection ready', stateId: 'capture-ready' }, 375);

    const actionStates = [
      {
        state: { label: 'Selection ready', stateId: 'capture-ready' },
        trigger: 'Passage actions',
        menuItem: 'Clear captured passage',
        confirmation: 'Clear this captured passage?',
      },
      {
        state: { label: 'Complete Board', stateId: 'board-complete' },
        trigger: 'Board actions',
        menuItem: 'Remove this Board from the reader',
        confirmation: 'Remove this Board?',
      },
    ] as const;

    for (const width of clearActionWidths) {
      await page.setViewportSize({ width, height: 900 });
      await expectProductPlaneWidth(page, width);

      for (const actionState of actionStates) {
        await selectResponsiveState(page, actionState.state.label, actionState.state.stateId);
        const trigger = page.getByRole('button', { name: actionState.trigger, exact: true });
        await expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
        await expect(trigger).toHaveAttribute('aria-expanded', 'false');

        const triggerBox = await trigger.boundingBox();
        expect(triggerBox, `${actionState.trigger} at ${width}px has geometry`).not.toBeNull();
        expect(triggerBox!.height).toBeGreaterThanOrEqual(44);
        expect(triggerBox!.width).toBeGreaterThanOrEqual(44);

        await trigger.click();
        const menuItem = page.getByRole('menuitem', {
          name: actionState.menuItem,
          exact: true,
        });
        await expect(menuItem).toBeFocused();
        await expect(page.getByText(/deterministic (?:Board|captured passage) from/u)).toHaveCount(
          0,
        );

        await menuItem.click();
        const confirmation = page.getByRole('region', {
          name: actionState.confirmation,
          exact: true,
        });
        await expect(confirmation).toBeVisible();
        await expect(confirmation.getByRole('button', { name: 'Cancel' })).toBeFocused();
        await expect(page.locator('[data-testid="learningbored-work-surface"]')).toHaveCount(1);

        await confirmation.getByRole('button', { name: 'Cancel' }).click();
        await expect(confirmation).toHaveCount(0);
        await expect(trigger).toBeFocused();
        await expect(page.locator('[data-testid="learningbored-work-surface"]')).toHaveCount(1);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
          `${actionState.trigger} at ${width}px does not widen the page`,
        ).toBe(width);
      }
    }
  });

  test('supports keyboard dismissal and requires an explicit Board-removal confirmation', async ({
    page,
  }) => {
    await openStudyState(page, { label: 'Selection ready', stateId: 'capture-ready' }, 375);
    const passageTrigger = page.getByRole('button', { name: 'Passage actions', exact: true });
    await passageTrigger.focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('menuitem', { name: 'Clear captured passage' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(passageTrigger).toBeFocused();
    await expect(
      page.getByText('Cleared the deterministic captured passage', { exact: false }),
    ).toHaveCount(0);

    await page.setViewportSize({ width: 640, height: 900 });
    await selectResponsiveState(page, 'Complete Board', 'board-complete');
    const boardTrigger = page.getByRole('button', { name: 'Board actions', exact: true });
    await boardTrigger.focus();
    await page.keyboard.press('Enter');
    const removeItem = page.getByRole('menuitem', {
      name: 'Remove this Board from the reader',
    });
    await expect(removeItem).toBeFocused();
    await page.keyboard.press('Enter');
    const confirmation = page.getByRole('region', { name: 'Remove this Board?' });
    await expect(confirmation.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(confirmation).toHaveCount(0);
    await expect(boardTrigger).toBeFocused();
    await expect(page.getByText('Removed the deterministic Board', { exact: false })).toHaveCount(
      0,
    );

    await boardTrigger.click();
    await removeItem.click();
    const confirmationAxe = await new AxeBuilder({ page })
      .include('[data-testid="learningbored-work-surface"]')
      .withTags([...axeWcagTags])
      .analyze();
    expect(confirmationAxe.violations).toEqual([]);
    await page.getByRole('button', { name: 'Remove Board' }).click();
    await expect(page.locator('[data-testid="learningbored-work-surface"]')).toHaveCount(0);
    await expect(
      page.getByText('Removed the deterministic Board from this Reader preview.'),
    ).toBeAttached();
  });

  test('wraps expanded action copy without clipping at mobile, boundary, tablet, or desktop widths', async ({
    page,
  }) => {
    await openStudyState(
      page,
      { label: 'Unsupported PDF', stateId: 'capture-pdf-unavailable' },
      375,
    );

    for (const width of clearActionWidths) {
      await page.setViewportSize({ width, height: 900 });
      await expectProductPlaneWidth(page, width);
      const trigger = page.getByRole('button', {
        name: expandedPassageActionLabels.trigger,
        exact: true,
      });
      await trigger.click();
      await page
        .getByRole('menuitem', { name: expandedPassageActionLabels.menuItem, exact: true })
        .click();

      const confirmation = page.getByRole('region', {
        name: expandedPassageActionLabels.confirmation,
        exact: true,
      });
      await expect(confirmation).toBeVisible();
      await expect(
        confirmation.getByRole('button', {
          name: expandedPassageActionLabels.cancel,
          exact: true,
        }),
      ).toBeFocused();
      await expect(
        confirmation.getByRole('button', {
          name: expandedPassageActionLabels.confirm,
          exact: true,
        }),
      ).toBeVisible();

      const overflow = await page
        .locator('[data-testid="learningbored-work-surface"] > footer')
        .evaluate((footer) => {
          const visibleText = Array.from(
            footer.querySelectorAll<HTMLElement>('button, p, span'),
          ).filter((element) => element.getClientRects().length > 0);
          return {
            page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            text: visibleText
              .filter(
                (element) =>
                  element.scrollWidth > element.clientWidth + 1 ||
                  element.scrollHeight > element.clientHeight + 1,
              )
              .map((element) => element.textContent?.trim() ?? element.tagName),
          };
        });
      expect(overflow, `expanded action copy at ${width}px remains fully readable`).toEqual({
        page: 0,
        text: [],
      });

      await confirmation
        .getByRole('button', { name: expandedPassageActionLabels.cancel, exact: true })
        .click();
      await expect(trigger).toBeFocused();
    }
  });

  test('keeps 44px touch controls, reduced motion, and structural scaffold cues in greyscale', async ({
    page,
  }) => {
    await openStudyState(page, { label: 'Complete Board', stateId: 'board-complete' }, 375);
    await setResponsiveProductPlane(page, false);
    await selectTheme(page, 'eink');
    await setResponsiveProductPlane(page, true);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addStyleTag({
      content: '[data-lb-preview-study-scene="true"] { filter: grayscale(1); }',
    });

    const targetSizes = await page
      .locator('[data-testid="learningbored-work-surface"] :is(button, select, summary):visible')
      .evaluateAll((targets) =>
        targets.map((target) => {
          const rect = target.getBoundingClientRect();
          return {
            height: rect.height,
            label: target.getAttribute('aria-label') ?? target.textContent,
            width: rect.width,
          };
        }),
      );
    expect(targetSizes.length).toBeGreaterThan(0);
    for (const target of targetSizes) {
      expect.soft(target.height, `${target.label} touch height`).toBeGreaterThanOrEqual(44);
      expect.soft(target.width, `${target.label} touch width`).toBeGreaterThanOrEqual(44);
    }

    const motion = await page.locator('[data-testid="learningbored-work-surface"] *').evaluateAll(
      (elements) =>
        elements.filter((element) => {
          const style = getComputedStyle(element);
          return style.animationDuration !== '0s' || style.transitionDuration !== '0s';
        }).length,
    );
    expect(motion).toBe(0);

    const scaffold = page
      .locator('[data-provenance="scaffold"]')
      .filter({ hasText: 'Added to help' })
      .first();
    await expect(scaffold).toBeVisible();
    expect(await scaffold.evaluate((element) => getComputedStyle(element).borderStyle)).toBe(
      'dashed',
    );
    await expect(
      scaffold.getByText('Added to help — not from your document', { exact: false }),
    ).toBeVisible();
  });

  test('keeps outline, descriptions, and actions usable with Board SVG and images disabled', async ({
    page,
  }) => {
    await openStudyState(
      page,
      { label: 'Board without SVG', stateId: 'board-svg-unavailable' },
      375,
    );
    await expect(page.locator('.learningbored-svg')).toHaveCount(0);
    await expect(page.getByRole('list', { name: 'Board text outline' })).toBeVisible();
    await expect(page.getByText('Board visual unavailable', { exact: false })).toBeVisible();
    await page.locator('[data-testid="learningbored-work-surface"] image').evaluateAll((images) => {
      for (const image of images) image.remove();
    });
    await page.addStyleTag({
      content: '[data-testid="learningbored-work-surface"] svg { display: none !important; }',
    });
    await expect(
      page.getByText('A generic chamber receives water', { exact: false }).first(),
    ).toBeVisible();
    await page
      .getByRole('button', { name: /Replace figure: A generic chamber receives water/ })
      .click();
    await expect(page.getByText('Opened deterministic Figure replacement.')).toBeAttached();

    await selectResponsiveState(page, 'Figure fallback', 'figure-load-failure');
    await expect(page.locator('.learningbored-figure-projection')).toHaveCount(0);
    await expect(page.getByText('Figure unavailable:', { exact: false })).toBeVisible();
    await expect(
      page.getByText('A generic chamber receives water', { exact: false }).first(),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Replace figure' }).click();
    await expect(
      page.getByText('Opened the deterministic Figure replacement confirmation.'),
    ).toBeAttached();
  });

  for (const width of assistiveWidths) {
    test(`assistive representatives: reduced motion at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await openPreview(page);

      for (const state of assistiveRepresentativeStates) {
        await selectResponsiveState(page, state.label, state.stateId);
        await expectProductPlaneWidth(page, width);
        const movingElements = await productRenderStage(page).evaluate((stage) =>
          Array.from(stage.querySelectorAll<HTMLElement>('*'))
            .filter((element) => element.getClientRects().length > 0)
            .filter((element) => {
              const style = getComputedStyle(element);
              const durationInSeconds = (value: string): number =>
                Math.max(
                  ...value.split(',').map((duration) => {
                    const normalized = duration.trim();
                    if (normalized.endsWith('ms')) return Number.parseFloat(normalized) / 1000;
                    return Number.parseFloat(normalized) || 0;
                  }),
                );
              return (
                durationInSeconds(style.animationDuration) > 0.001 ||
                durationInSeconds(style.transitionDuration) > 0.001
              );
            })
            .map((element) =>
              (element.getAttribute('aria-label') ?? element.className ?? element.tagName)
                .toString()
                .slice(0, 90),
            ),
        );
        expect
          .soft(movingElements, `${state.groupId} respects reduced motion at ${width}px`)
          .toEqual([]);
      }
    });

    test(`assistive representatives: WCAG text spacing at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await openPreview(page);
      await page.addStyleTag({
        content: `
          #preview-state-plane :is(a, button, dd, dt, figcaption, h1, h2, h3, h4, input, label, legend, li, p, select, summary, textarea) {
            letter-spacing: 0.12em !important;
            line-height: 1.5 !important;
            word-spacing: 0.16em !important;
          }
          #preview-state-plane p {
            margin-block-end: 2em !important;
          }
        `,
      });

      for (const state of assistiveRepresentativeStates) {
        await selectResponsiveState(page, state.label, state.stateId);
        await expectProductPlaneWidth(page, width);
        await expectNoHorizontalOverflow(
          page,
          width,
          `${state.groupId} with WCAG text spacing at ${width}px`,
        );
        await expectNoClippedText(page, `${state.groupId} with WCAG text spacing at ${width}px`);
      }
    });

    test(`assistive representatives: forced colors at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ forcedColors: 'active' });
      await openPreview(page);
      expect(await page.evaluate(() => matchMedia('(forced-colors: active)').matches)).toBe(true);

      for (const state of assistiveRepresentativeStates) {
        await selectResponsiveState(page, state.label, state.stateId);
        await expectProductPlaneWidth(page, width);
        await expectRenderedContent(page, `${state.groupId} in forced colors at ${width}px`);
        await expectNoHorizontalOverflow(
          page,
          width,
          `${state.groupId} in forced colors at ${width}px`,
        );
      }
    });

    test(`assistive representatives: greyscale at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await openPreview(page);
      await page.addStyleTag({
        content: '#preview-state-plane > div { filter: grayscale(1) !important; }',
      });

      for (const state of assistiveRepresentativeStates) {
        await selectResponsiveState(page, state.label, state.stateId);
        await expectProductPlaneWidth(page, width);
        await expectRenderedContent(page, `${state.groupId} in greyscale at ${width}px`);
        await expect(productRenderStage(page)).toHaveCSS('filter', 'grayscale(1)');
      }
    });

    test(`assistive representatives: images disabled at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await openPreview(page);
      await page.addStyleTag({
        content: '#preview-state-plane :is(img, picture, svg, image) { display: none !important; }',
      });

      for (const state of assistiveRepresentativeStates) {
        await selectResponsiveState(page, state.label, state.stateId);
        await expectProductPlaneWidth(page, width);
        await expectRenderedContent(page, `${state.groupId} without images at ${width}px`);
        await expectNoHorizontalOverflow(
          page,
          width,
          `${state.groupId} without images at ${width}px`,
        );
      }
    });

    test(`assistive representatives: print at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await openPreview(page);

      for (const state of assistiveRepresentativeStates) {
        await page.emulateMedia({ media: 'screen' });
        await selectResponsiveState(page, state.label, state.stateId);
        await page.emulateMedia({ media: 'print' });
        expect(await page.evaluate(() => matchMedia('print').matches)).toBe(true);
        await expectRenderedContent(page, `${state.groupId} in print at ${width}px`);
        await expectNoHorizontalOverflow(page, width, `${state.groupId} in print at ${width}px`);
      }
    });
  }

  test.describe('representative touch actionability', () => {
    test.use({ hasTouch: true });

    for (const width of assistiveWidths) {
      test(`keeps all contract groups safely touch-actionable at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await openPreview(page);

        for (const state of assistiveRepresentativeStates) {
          await selectResponsiveState(page, state.label, state.stateId);
          const controls = await getVisibleControls(productRenderStage(page));
          expect
            .soft(controls.length, `${state.groupId} exposes a touch target`)
            .toBeGreaterThan(0);
          const control = controls[0];
          if (!control) continue;

          await expect
            .soft(control, `${state.groupId} representative touch target has a name`)
            .toHaveAccessibleName(/\S/u);
          const box = await control.boundingBox();
          expect.soft(box?.height ?? 0, `${state.groupId} touch height`).toBeGreaterThanOrEqual(44);
          expect.soft(box?.width ?? 0, `${state.groupId} touch width`).toBeGreaterThanOrEqual(44);
          await control.tap({ trial: true });
          await expect(page.getByRole('region', { name: previewRegionName })).toHaveAttribute(
            'data-lb-preview-state',
            state.stateId,
          );
        }
      });
    }
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

  for (const pageScale of [1, 2] as const) {
    for (const chunk of controlInventoryStateChunks) {
      test(`T-10 control inventory: ${chunk.groupId} chunk ${chunk.chunkIndex} at ${pageScale * 100}% page scale`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: 375, height: 900 });
        await openPreview(page);
        const cdp = await page.context().newCDPSession(page);
        let inventoryCount = 0;

        try {
          await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: pageScale });
          await expect
            .poll(() => page.evaluate(() => window.visualViewport?.scale ?? 1))
            .toBe(pageScale);

          for (const state of chunk.states) {
            await selectResponsiveInventoryState(page, state.label, state.id);
            await expectProductPlaneWidth(page, 375);
            inventoryCount += await expectControlInventory(
              page,
              productRenderStage(page),
              `${state.id} at ${pageScale * 100}% page scale`,
            );
          }
        } finally {
          if (!page.isClosed()) {
            await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
            await cdp.detach();
          }
        }

        expect(inventoryCount, `${chunk.groupId} reachable control inventory`).toBeGreaterThan(0);
      });
    }

    test(`T-10 transient clear controls at ${pageScale * 100}% page scale`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 900 });
      await openPreview(page);
      const cdp = await page.context().newCDPSession(page);
      const actionStates = [
        {
          state: { label: 'Selection ready', stateId: 'capture-ready' },
          trigger: 'Passage actions',
          menuItem: 'Clear captured passage',
          confirmation: 'Clear this captured passage?',
        },
        {
          state: { label: 'Complete Board', stateId: 'board-complete' },
          trigger: 'Board actions',
          menuItem: 'Remove this Board from the reader',
          confirmation: 'Remove this Board?',
        },
      ] as const;

      try {
        await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: pageScale });
        await expect
          .poll(() => page.evaluate(() => window.visualViewport?.scale ?? 1))
          .toBe(pageScale);

        for (const actionState of actionStates) {
          await selectResponsiveInventoryState(
            page,
            actionState.state.label,
            actionState.state.stateId,
          );
          const trigger = page.getByRole('button', {
            name: actionState.trigger,
            exact: true,
          });
          await trigger.focus();
          await trigger.press('Enter');
          const menu = page.getByRole('menu', { name: actionState.trigger, exact: true });
          expect(
            await expectControlInventory(
              page,
              menu,
              `${actionState.state.stateId} menu at ${pageScale * 100}% page scale`,
            ),
          ).toBe(1);

          const menuItem = menu.getByRole('menuitem', {
            name: actionState.menuItem,
            exact: true,
          });
          await menuItem.focus();
          await menuItem.press('Enter');
          const confirmation = page.getByRole('region', {
            name: actionState.confirmation,
            exact: true,
          });
          expect(
            await expectControlInventory(
              page,
              confirmation,
              `${actionState.state.stateId} confirmation at ${pageScale * 100}% page scale`,
            ),
          ).toBe(2);
          const cancel = confirmation.getByRole('button', { name: 'Cancel' });
          await cancel.focus();
          await cancel.press('Enter');
          await expect(trigger).toBeFocused();
        }
      } finally {
        if (!page.isClosed()) {
          await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
          await cdp.detach();
        }
      }
    });
  }

  test('keeps the preview on its deterministic local fixture boundary', async ({ page }) => {
    const forbiddenRequests: string[] = [];
    const hostileLocalStorage = {
      'learningbored.review-grade-outbox.v1': '{"hostile":"preview-must-not-read-or-remove"}',
      'preview.hostile.local': 'leave-existing-reader-state-unchanged',
    } as const;
    const hostileSessionStorage = {
      'preview.hostile.session': 'leave-existing-session-state-unchanged',
    } as const;
    await page.addInitScript(
      ({ local, session }) => {
        for (const [key, value] of Object.entries(local)) localStorage.setItem(key, value);
        for (const [key, value] of Object.entries(session)) sessionStorage.setItem(key, value);
      },
      { local: hostileLocalStorage, session: hostileSessionStorage },
    );
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
        localStorage: Object.fromEntries(
          Object.entries(window.localStorage).sort(([left], [right]) => left.localeCompare(right)),
        ),
        sessionStorage: Object.fromEntries(
          Object.entries(window.sessionStorage).sort(([left], [right]) =>
            left.localeCompare(right),
          ),
        ),
      })),
    ).toEqual({
      localStorage: hostileLocalStorage,
      sessionStorage: hostileSessionStorage,
    });
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

    test('keeps the primary Review path one-handed at 375px', async ({ page }) => {
      await openPreview(page);
      await page.getByRole('button', { name: 'Show Review start', exact: true }).tap();
      await setResponsiveProductPlane(page, true);
      const review = page.getByTestId('learningbored-review-panel');

      await review.getByRole('button', { name: 'Begin review' }).tap();
      await review.getByRole('button', { name: 'Reveal answer' }).tap();
      await review.getByRole('button', { name: 'Good, next review 2 days' }).tap();
      await expect(
        review.getByRole('heading', {
          name: 'Where does clarified water leave the fictional chamber?',
        }),
      ).toBeVisible();

      const primaryTargets = await review.locator('button:visible').evaluateAll((buttons) =>
        buttons.map((button) => {
          const rect = button.getBoundingClientRect();
          return { height: rect.height, width: rect.width };
        }),
      );
      for (const target of primaryTargets) {
        expect.soft(target.height).toBeGreaterThanOrEqual(44);
        expect.soft(target.width).toBeGreaterThanOrEqual(44);
      }
    });

    test('requires a deliberate touch confirmation before clearing a passage', async ({ page }) => {
      await openPreview(page);
      await page.getByRole('button', { name: 'Show Selection ready', exact: true }).tap();
      await setResponsiveProductPlane(page, true);
      const trigger = page.getByRole('button', { name: 'Passage actions', exact: true });

      await trigger.tap();
      await page.getByRole('menuitem', { name: 'Clear captured passage' }).tap();
      await expect(page.locator('[data-testid="learningbored-work-surface"]')).toHaveCount(1);
      await expect(
        page.getByText('Cleared the deterministic captured passage', { exact: false }),
      ).toHaveCount(0);

      await page.getByRole('button', { name: 'Clear passage' }).tap();
      await expect(page.locator('[data-testid="learningbored-work-surface"]')).toHaveCount(0);
      await expect(
        page.getByText('Cleared the deterministic captured passage from this Reader preview.'),
      ).toBeAttached();
    });

    test('supports Board touch cancellation before a separate confirmed removal', async ({
      page,
    }) => {
      await openPreview(page);
      await page.getByRole('button', { name: 'Show Complete Board', exact: true }).tap();
      await setResponsiveProductPlane(page, true);
      const workSurface = page.locator('[data-testid="learningbored-work-surface"]');
      const trigger = page.getByRole('button', { name: 'Board actions', exact: true });

      await trigger.tap();
      await page.getByRole('menuitem', { name: 'Remove this Board from the reader' }).tap();
      const confirmation = page.getByRole('region', { name: 'Remove this Board?' });
      await expect(confirmation.getByRole('button', { name: 'Cancel' })).toBeFocused();
      await confirmation.getByRole('button', { name: 'Cancel' }).tap();
      await expect(workSurface).toHaveCount(1);
      await expect(trigger).toBeFocused();
      await expect(page.getByText('Removed the deterministic Board', { exact: false })).toHaveCount(
        0,
      );

      await trigger.tap();
      await page.getByRole('menuitem', { name: 'Remove this Board from the reader' }).tap();
      await page.getByRole('button', { name: 'Remove Board' }).tap();
      await expect(workSurface).toHaveCount(0);
      await expect(
        page.getByText('Removed the deterministic Board from this Reader preview.'),
      ).toBeAttached();
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
