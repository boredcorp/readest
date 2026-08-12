import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('LearningBored translation isolation', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it.each([
    ['Capture', () => import('@/integrations/learningbored/LearningBoredCapturePanel')],
    [
      'Comprehension',
      () => import('@/integrations/learningbored/LearningBoredComprehensionPrompt'),
    ],
    ['Exam overlay', () => import('@/integrations/learningbored/LearningBoredExamOverlay')],
    ['Mastery', () => import('@/integrations/learningbored/LearningBoredMastery')],
    ['Progress', () => import('@/integrations/learningbored/LearningBoredProgressPanel')],
    ['Review', () => import('@/integrations/learningbored/LearningBoredReviewPanel')],
  ] as const)('%s imports without initializing Readest cached i18n', async (_name, load) => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');

    await load();

    expect(localStorage.getItem('i18nextLng')).toBeNull();
    expect(setItem.mock.calls.some(([key]) => key === 'i18nextLng')).toBe(false);
  });
});
