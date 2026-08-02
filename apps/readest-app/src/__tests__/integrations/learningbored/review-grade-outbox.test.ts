import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type {
  LearningBoredDueReviewItem,
  LearningBoredSubmitReviewGradeInput,
} from '@/integrations/learningbored/client';
import {
  createLearningBoredReviewGradeOutboxEntry,
  readLearningBoredReviewGradeOutbox,
  writeLearningBoredReviewGradeOutbox,
} from '@/integrations/learningbored/review-grade-outbox';

const NOW = Date.parse('2026-08-02T12:00:00.000Z');
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1_000;

function dueItem(): LearningBoredDueReviewItem {
  return {
    recallItem: {
      id: 'recall-fictional',
      documentId: 'document-fictional',
      kind: 'short_answer',
      stem: 'Which fictional component moves?',
      conceptIds: ['concept-fictional'],
    },
    reviewState: {
      state: 'new',
      dueAt: null,
      reps: 0,
      lapses: 0,
      overdueDays: 0,
    },
    intervalPreviews: {
      again: { intervalSeconds: 60, intervalDays: 0, dueAt: '2026-08-02T12:01:00.000Z' },
      hard: { intervalSeconds: 600, intervalDays: 0, dueAt: '2026-08-02T12:10:00.000Z' },
      good: { intervalSeconds: 86_400, intervalDays: 1, dueAt: '2026-08-03T12:00:00.000Z' },
      easy: {
        intervalSeconds: 604_800,
        intervalDays: 7,
        dueAt: '2026-08-09T12:00:00.000Z',
      },
    },
    source: {
      documentTitle: 'Fictional mechanics notes',
      chapter: null,
      pageLabel: null,
      passageId: 'passage-fictional',
    },
  };
}

function request(clientRequestId = 'request-fictional'): LearningBoredSubmitReviewGradeInput {
  return {
    clientRequestId,
    recallItemId: 'recall-fictional',
    reviewOccurrence: { state: 'new', dueAt: null, reps: 0, lapses: 0 },
    grade: 'good',
    elapsedMs: 420,
    answeredOptionId: 'choice-2',
  };
}

describe('LearningBored review grade outbox', () => {
  beforeEach(() => localStorage.clear());

  afterEach(() => localStorage.clear());

  it('round-trips only the validated request, occurrence fingerprint, and document scope', () => {
    const entry = createLearningBoredReviewGradeOutboxEntry(
      dueItem(),
      'document-fictional',
      request(),
      NOW,
    );

    expect(writeLearningBoredReviewGradeOutbox(entry, NOW)).toEqual({ status: 'stored' });
    expect(readLearningBoredReviewGradeOutbox(NOW + 1)).toEqual({
      status: 'available',
      entry,
    });
    const raw = localStorage.getItem(localStorage.key(0)!);
    expect(raw).not.toContain('"answer":');
    expect(raw).not.toContain('"source":');
    expect(raw).not.toContain('"sourceText":');
    expect(raw).not.toContain('"selectedText":');
  });

  it('drops an entry with unexpected answer material instead of trusting it', () => {
    const entry = createLearningBoredReviewGradeOutboxEntry(
      dueItem(),
      'document-fictional',
      request(),
      NOW,
    );
    expect(writeLearningBoredReviewGradeOutbox(entry, NOW)).toEqual({ status: 'stored' });
    const key = localStorage.key(0)!;
    localStorage.setItem(key, JSON.stringify({ ...entry, answer: 'Leaked answer.' }));

    expect(readLearningBoredReviewGradeOutbox(NOW + 1)).toEqual({ status: 'empty' });
    expect(localStorage).toHaveLength(0);
  });

  it('expires old entries and refuses to write an already-expired request', () => {
    const entry = createLearningBoredReviewGradeOutboxEntry(
      dueItem(),
      'document-fictional',
      request(),
      NOW,
    );
    expect(writeLearningBoredReviewGradeOutbox(entry, NOW)).toEqual({ status: 'stored' });

    expect(readLearningBoredReviewGradeOutbox(NOW + SEVEN_DAYS_MS)).toEqual({
      status: 'empty',
    });
    expect(localStorage).toHaveLength(0);
    expect(writeLearningBoredReviewGradeOutbox(entry, NOW + SEVEN_DAYS_MS)).toEqual({
      status: 'unavailable',
    });
    expect(localStorage).toHaveLength(0);
  });

  it('protects an existing request from a second request ID', () => {
    const first = createLearningBoredReviewGradeOutboxEntry(
      dueItem(),
      'document-fictional',
      request('request-first'),
      NOW,
    );
    const second = createLearningBoredReviewGradeOutboxEntry(
      dueItem(),
      'document-fictional',
      request('request-second'),
      NOW,
    );
    expect(writeLearningBoredReviewGradeOutbox(first, NOW)).toEqual({ status: 'stored' });

    expect(writeLearningBoredReviewGradeOutbox(second, NOW)).toEqual({
      status: 'conflict',
      entry: first,
    });
    expect(readLearningBoredReviewGradeOutbox(NOW + 1)).toEqual({
      status: 'available',
      entry: first,
    });
  });
});
