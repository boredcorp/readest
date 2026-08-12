import type {
  LearningBoredClient,
  LearningBoredDueReviewItem,
  LearningBoredReviewAnswer,
  LearningBoredReviewNextResult,
  LearningBoredSubmitReviewGradeInput,
  LearningBoredSubmitReviewGradeResult,
} from '../client';
import type {
  LearningBoredReviewOutboxStore,
  LearningBoredReviewViewState,
} from '../LearningBoredReviewPanel';
import type { LearningBoredReviewGradeOutboxEntry } from '../review-grade-outbox';
import type { LearningBoredPreviewStateId } from './contract';
import {
  LEARNINGBORED_PREVIEW_PASSAGE,
  LEARNINGBORED_PREVIEW_PASSAGE_TEXT,
} from './study-fixtures';

const reviewedAt = '2026-08-12T08:30:00.000Z';

export const LEARNINGBORED_PREVIEW_REVIEW_ITEM: LearningBoredDueReviewItem = {
  recallItem: {
    id: 'preview-recall-settling-order',
    kind: 'multiple_choice',
    stem: 'What happens after water slows inside the fictional settling chamber?',
    documentId: 'preview-waterworks',
    conceptIds: ['preview-concept-settling'],
    options: [
      { id: 'option-1', text: 'Denser particles settle downward.' },
      { id: 'option-2', text: 'The upper outlet moves below the chamber.' },
      { id: 'option-3', text: 'The source passage becomes a public link.' },
    ],
  },
  reviewState: {
    state: 'review',
    dueAt: '2026-08-12T07:30:00.000Z',
    reps: 3,
    lapses: 1,
    overdueDays: 0.04,
  },
  intervalPreviews: {
    again: { intervalSeconds: 60, intervalDays: 0, dueAt: '2026-08-12T08:31:00.000Z' },
    hard: { intervalSeconds: 90, intervalDays: 0, dueAt: '2026-08-12T08:31:30.000Z' },
    good: { intervalSeconds: 172_800, intervalDays: 2, dueAt: '2026-08-14T08:30:00.000Z' },
    easy: { intervalSeconds: 345_600, intervalDays: 4, dueAt: '2026-08-16T08:30:00.000Z' },
  },
  source: {
    documentTitle: 'Maps of the Imaginary Waterworks',
    chapter: 'A fictional waterworks lesson',
    pageLabel: '17',
    passageId: 'preview-passage-settling-chamber',
  },
};

export const LEARNINGBORED_PREVIEW_REVIEW_SECOND_ITEM: LearningBoredDueReviewItem = {
  ...LEARNINGBORED_PREVIEW_REVIEW_ITEM,
  recallItem: {
    ...LEARNINGBORED_PREVIEW_REVIEW_ITEM.recallItem,
    id: 'preview-recall-outlet-position',
    stem: 'Where does clarified water leave the fictional chamber?',
    conceptIds: ['preview-concept-outlet'],
  },
};

export const LEARNINGBORED_PREVIEW_REVIEW_ANSWER: LearningBoredReviewAnswer = {
  answer: 'Denser particles settle downward while clarified water leaves through the upper outlet.',
  explanation:
    'The calming zone slows the fictional flow, giving denser particles time to settle before the water reaches the outlet.',
  optionRationales: [
    {
      id: 'option-1',
      text: 'Denser particles settle downward.',
      isCorrect: true,
      rationale: 'This is the sequence stated in the captured passage.',
    },
    {
      id: 'option-2',
      text: 'The upper outlet moves below the chamber.',
      isCorrect: false,
      rationale: 'The passage places the outlet above the settling region.',
    },
    {
      id: 'option-3',
      text: 'The source passage becomes a public link.',
      isCorrect: false,
      rationale:
        'The fictional source remains private and this choice is unrelated to the passage.',
    },
  ],
  anchor: {
    documentId: 'preview-waterworks',
    title: 'Maps of the Imaginary Waterworks',
    readerBookId: LEARNINGBORED_PREVIEW_PASSAGE.bookId,
    passageId: 'preview-passage-settling-chamber',
    chapter: LEARNINGBORED_PREVIEW_PASSAGE.chapter ?? null,
    pageLabel: LEARNINGBORED_PREVIEW_PASSAGE.location.pageLabel ?? null,
    location: LEARNINGBORED_PREVIEW_PASSAGE.location,
    sourceSpan: { sourceStart: 0, sourceEnd: LEARNINGBORED_PREVIEW_PASSAGE_TEXT.length },
    sourceText: LEARNINGBORED_PREVIEW_PASSAGE_TEXT,
    selectedText: LEARNINGBORED_PREVIEW_PASSAGE_TEXT,
  },
};

export const LEARNINGBORED_PREVIEW_REVIEW_QUEUE: LearningBoredReviewNextResult = {
  items: [LEARNINGBORED_PREVIEW_REVIEW_ITEM, LEARNINGBORED_PREVIEW_REVIEW_SECOND_ITEM],
  queue: {
    dueNow: 2,
    dueToday: 2,
    newAvailable: 0,
    reviewedToday: 3,
    dailyTarget: 10,
  },
};

export function createLearningBoredReviewPreviewOutboxStore(): LearningBoredReviewOutboxStore {
  let storedEntry: LearningBoredReviewGradeOutboxEntry | null = null;

  return {
    read: () => (storedEntry ? { status: 'available', entry: storedEntry } : { status: 'empty' }),
    write: (entry) => {
      if (storedEntry && storedEntry.request.clientRequestId !== entry.request.clientRequestId) {
        return { status: 'conflict', entry: storedEntry };
      }
      storedEntry = entry;
      return { status: 'stored' };
    },
    clear: (clientRequestId) => {
      if (storedEntry && storedEntry.request.clientRequestId !== clientRequestId) {
        return { status: 'conflict', entry: storedEntry };
      }
      storedEntry = null;
      return { status: 'cleared' };
    },
  };
}

const reviewQuestionScreen = {
  kind: 'question',
  item: LEARNINGBORED_PREVIEW_REVIEW_ITEM,
  questionNumber: 1,
  totalQuestions: 2,
  selectedOptionId: null,
  controlsDisabled: false,
  recovery: null,
} as const;

const reviewRevealedScreen = {
  kind: 'revealed',
  item: LEARNINGBORED_PREVIEW_REVIEW_ITEM,
  questionNumber: 1,
  totalQuestions: 2,
  selectedOptionId: 'option-1',
  controlsDisabled: false,
  answer: LEARNINGBORED_PREVIEW_REVIEW_ANSWER,
  recovery: null,
} as const;

/** Complete, answer-safe view-state inventory for the gated Reader preview. */
export function createLearningBoredReviewPreviewViewState(
  stateId: Extract<LearningBoredPreviewStateId, `review-${string}`>,
): LearningBoredReviewViewState {
  const base = { subtitle: 'From this Board' } as const;

  switch (stateId) {
    case 'review-selected-choice':
      return {
        ...base,
        visualState: 'selected-choice',
        statusMessage: 'Choice selected. Reveal the answer when ready.',
        screen: { ...reviewQuestionScreen, selectedOptionId: 'option-1' },
      };
    case 'review-reveal-request':
      return {
        ...base,
        visualState: 'reveal-request',
        statusMessage: 'Revealing answer.',
        screen: { ...reviewQuestionScreen, controlsDisabled: true },
      };
    case 'review-revealed':
      return {
        ...base,
        visualState: 'revealed-answer',
        statusMessage: 'Answer revealed. Choose a grade from 1 to 4.',
        screen: reviewRevealedScreen,
      };
    case 'review-grading':
      return {
        ...base,
        visualState: 'grading',
        statusMessage: 'Saving grade.',
        screen: { ...reviewRevealedScreen, controlsDisabled: true },
      };
    case 'review-outbox-pending':
      return {
        ...base,
        visualState: 'pending-outbox',
        statusMessage: 'Grade awaiting confirmation.',
        screen: {
          ...reviewRevealedScreen,
          controlsDisabled: true,
          recovery: {
            message: 'The grade is saved locally and is awaiting confirmation.',
            action: 'retry-grade',
            actionDisabled: false,
          },
        },
      };
    case 'review-recovery':
      return {
        ...base,
        visualState: 'rejection-recovery',
        statusMessage: 'Action needed before review can continue.',
        screen: {
          ...reviewRevealedScreen,
          recovery: {
            message: 'This review occurrence changed. Reload the queue before grading again.',
            action: 'reload-review',
            actionDisabled: false,
          },
        },
      };
    case 'review-suppression':
      return {
        ...base,
        visualState: 'suppression',
        statusMessage: 'Removing question from future review.',
        screen: { ...reviewQuestionScreen, controlsDisabled: true },
      };
    case 'review-continuation':
      return {
        ...base,
        visualState: 'continuation',
        statusMessage: 'More questions are available.',
        screen: {
          kind: 'summary',
          mode: 'continuation',
          remainingCount: 7,
          reviewedCount: 2,
          removedCount: 0,
          documentId: 'preview-waterworks',
          canOpenProgress: true,
          recovery: null,
        },
      };
    case 'review-empty':
      return {
        ...base,
        visualState: 'empty',
        statusMessage: 'No validated questions are due.',
        screen: {
          kind: 'summary',
          mode: 'empty',
          remainingCount: 0,
          reviewedCount: 0,
          removedCount: 0,
          documentId: 'preview-waterworks',
          canOpenProgress: true,
          recovery: null,
        },
      };
    case 'review-complete':
      return {
        ...base,
        visualState: 'completion',
        statusMessage: 'Review complete.',
        screen: {
          kind: 'summary',
          mode: 'completion',
          remainingCount: 0,
          reviewedCount: 2,
          removedCount: 0,
          documentId: 'preview-waterworks',
          canOpenProgress: true,
          recovery: null,
        },
      };
    case 'review-question':
    default:
      return {
        ...base,
        visualState: 'question',
        statusMessage: 'Question ready. Answer before revealing.',
        screen: reviewQuestionScreen,
      };
  }
}

export type LearningBoredReviewFixtureMode =
  | 'ready'
  | 'loading'
  | 'error'
  | 'empty'
  | 'reveal-pending'
  | 'grade-pending'
  | 'grade-network-error'
  | 'grade-rejected'
  | 'suppress-pending'
  | 'continuation';

function pendingFixtureResult<T>(): Promise<T> {
  return new Promise<T>(() => undefined);
}

function rejectedOccurrenceError(): Error & { status: number } {
  return Object.assign(new Error('The deterministic review occurrence changed.'), { status: 400 });
}

function gradeResult(
  input: LearningBoredSubmitReviewGradeInput,
): LearningBoredSubmitReviewGradeResult {
  return {
    clientRequestId: input.clientRequestId,
    recallItemId: input.recallItemId,
    grade: input.grade,
    answer: LEARNINGBORED_PREVIEW_REVIEW_ANSWER,
    reviewState: {
      state: 'review',
      stability: 8.4,
      difficulty: 4.2,
      reps: LEARNINGBORED_PREVIEW_REVIEW_ITEM.reviewState.reps + 1,
      lapses: LEARNINGBORED_PREVIEW_REVIEW_ITEM.reviewState.lapses,
      lastReviewedAt: reviewedAt,
      dueAt: '2026-08-14T08:30:00.000Z',
      intervalSeconds: 172_800,
      intervalDays: 2,
    },
    schedulerVersion: 'preview-fsrs-1.0.0',
  };
}

/** Offline, fictional port used only by the gated deterministic Reader preview. */
export function createLearningBoredReviewPreviewClient(
  mode: LearningBoredReviewFixtureMode = 'ready',
): LearningBoredClient {
  let queueReadCount = 0;
  return {
    getNextReviewItems: async () => {
      queueReadCount += 1;
      if (mode === 'loading') return pendingFixtureResult();
      if (mode === 'error') throw new Error('The deterministic review queue failed.');
      if (mode === 'empty') {
        return {
          items: [],
          queue: { dueNow: 0, dueToday: 0, newAvailable: 0, reviewedToday: 3, dailyTarget: 10 },
        };
      }
      if (mode === 'continuation') {
        return queueReadCount === 1
          ? {
              items: [LEARNINGBORED_PREVIEW_REVIEW_ITEM],
              queue: { ...LEARNINGBORED_PREVIEW_REVIEW_QUEUE.queue, dueNow: 2 },
            }
          : {
              items: [LEARNINGBORED_PREVIEW_REVIEW_SECOND_ITEM],
              queue: { ...LEARNINGBORED_PREVIEW_REVIEW_QUEUE.queue, dueNow: 1 },
            };
      }
      return LEARNINGBORED_PREVIEW_REVIEW_QUEUE;
    },
    revealReviewItem: async (recallItemId: string) => {
      if (mode === 'reveal-pending') return pendingFixtureResult();
      return { recallItemId, answer: LEARNINGBORED_PREVIEW_REVIEW_ANSWER };
    },
    submitReviewGrade: async (input: LearningBoredSubmitReviewGradeInput) => {
      if (mode === 'grade-pending') return pendingFixtureResult();
      if (mode === 'grade-network-error') throw new Error('The deterministic response was lost.');
      if (mode === 'grade-rejected') throw rejectedOccurrenceError();
      return gradeResult(input);
    },
    submitFeedback: async (): Promise<void> => {
      if (mode === 'suppress-pending') return pendingFixtureResult<void>();
    },
  } as unknown as LearningBoredClient;
}
