import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (message: string) => message,
}));

import LearningBoredReviewPanel from '@/integrations/learningbored/LearningBoredReviewPanel';
import type {
  LearningBoredClient,
  LearningBoredDueReviewItem,
  LearningBoredReviewAnswer,
  LearningBoredReviewGrade,
  LearningBoredSubmitReviewGradeInput,
} from '@/integrations/learningbored/client';
import {
  createLearningBoredReviewGradeOutboxEntry,
  writeLearningBoredReviewGradeOutbox,
} from '@/integrations/learningbored/review-grade-outbox';

const REQUEST_ID = '00000000-0000-4000-8000-000000000006';

const intervals = {
  again: { intervalSeconds: 60, intervalDays: 0, dueAt: '2026-08-02T12:01:00.000Z' },
  hard: { intervalSeconds: 600, intervalDays: 0, dueAt: '2026-08-02T12:10:00.000Z' },
  good: { intervalSeconds: 172_800, intervalDays: 2, dueAt: '2026-08-04T12:00:00.000Z' },
  easy: {
    intervalSeconds: 31_536_000,
    intervalDays: 365,
    dueAt: '2027-08-02T12:00:00.000Z',
  },
} as const;

function dueItem(
  id: string,
  stem: string,
  kind: LearningBoredDueReviewItem['recallItem']['kind'] = 'multiple_choice',
): LearningBoredDueReviewItem {
  return {
    recallItem: {
      id,
      kind,
      stem,
      documentId: 'document-fictional',
      conceptIds: [`concept-${id}`],
      ...(kind === 'multiple_choice'
        ? {
            options: [
              { id: 'choice-1', text: 'The outer fictional ring.' },
              { id: 'choice-2', text: 'The inner fictional rotor.' },
            ],
          }
        : {}),
    },
    reviewState: {
      state: 'new',
      dueAt: null,
      reps: 0,
      lapses: 0,
      overdueDays: 0,
    },
    intervalPreviews: intervals,
    source: {
      documentTitle: 'Fictional mechanics notes',
      chapter: 'Gentle mechanisms',
      pageLabel: 'p. 7',
      passageId: 'passage-fictional',
    },
  };
}

function revealedAnswer(): LearningBoredReviewAnswer {
  const selectedText = 'The inner fictional rotor moves while the outer ring stays still.';
  return {
    answer: 'The inner fictional rotor moves.',
    explanation: 'The passage contrasts the moving inner part with the stationary outer ring.',
    optionRationales: [
      {
        id: 'choice-1',
        text: 'The outer fictional ring.',
        isCorrect: false,
        rationale: 'The source describes the outer ring as stationary.',
      },
      {
        id: 'choice-2',
        text: 'The inner fictional rotor.',
        isCorrect: true,
        rationale: 'The source explicitly identifies the inner rotor as moving.',
      },
    ],
    rubric: ['Names the inner rotor.', 'Distinguishes it from the stationary ring.'],
    anchor: {
      documentId: 'document-fictional',
      title: 'Fictional mechanics notes',
      readerBookId: 'reader-book-fictional',
      passageId: 'passage-fictional',
      chapter: 'Gentle mechanisms',
      pageLabel: 'p. 7',
      location: {
        version: 1,
        kind: 'cfi',
        bookId: 'reader-book-fictional',
        cfi: 'epubcfi(/6/2!/4/2/1:0)',
        pageIndex: 6,
        pageLabel: 'p. 7',
      },
      sourceSpan: { sourceStart: 0, sourceEnd: selectedText.length },
      sourceText: selectedText,
      selectedText,
    },
  };
}

function reviewQueue(items: LearningBoredDueReviewItem[]) {
  return {
    items,
    queue: {
      dueNow: items.filter((item) => item.reviewState.dueAt !== null).length,
      dueToday: items.filter((item) => item.reviewState.dueAt !== null).length,
      newAvailable: items.filter((item) => item.reviewState.dueAt === null).length,
      reviewedToday: 4,
      dailyTarget: 12,
    },
  };
}

function createClient(
  items: LearningBoredDueReviewItem[],
  overrides: Partial<LearningBoredClient> = {},
): LearningBoredClient {
  const answer = revealedAnswer();
  return {
    getCredits: vi.fn(async () => ({
      availableChalk: 0,
      reservedChalk: 0,
      lifetimeGranted: 0,
      lifetimeSpent: 0,
      recent: [],
    })),
    listDocuments: vi.fn(async () => ({ documents: [] })),
    getDocument: vi.fn(async () => {
      throw new Error('Not used by review tests.');
    }),
    getDocumentMastery: vi.fn(async () => {
      throw new Error('Not used by review tests.');
    }),
    getDocumentReadiness: vi.fn(async () => {
      throw new Error('Not used by review tests.');
    }),
    listBlueprints: vi.fn(async () => ({ blueprints: [] })),
    createBlueprint: vi.fn(async () => {
      throw new Error('Not used by review tests.');
    }),
    patchBlueprint: vi.fn(async () => {
      throw new Error('Not used by review tests.');
    }),
    attachBlueprint: vi.fn(async () => {
      throw new Error('Not used by review tests.');
    }),
    setManualConceptMapping: vi.fn(async () => {
      throw new Error('Not used by review tests.');
    }),
    getBoardComprehension: vi.fn(async () => {
      throw new Error('Not used by review tests.');
    }),
    submitBoardComprehension: vi.fn(async () => {
      throw new Error('Not used by review tests.');
    }),
    createGeneration: vi.fn(async () => {
      throw new Error('Not used by review tests.');
    }),
    getGeneration: vi.fn(async () => {
      throw new Error('Not used by review tests.');
    }),
    getBoard: vi.fn(async () => {
      throw new Error('Not used by review tests.');
    }),
    rerenderBoard: vi.fn(async () => {
      throw new Error('Not used by review tests.');
    }),
    requestFigureRegeneration: vi.fn(async () => {
      throw new Error('Not used by review tests.');
    }),
    getFigureRegeneration: vi.fn(async () => {
      throw new Error('Not used by review tests.');
    }),
    cancelGeneration: vi.fn(async () => {
      throw new Error('Not used by review tests.');
    }),
    retryGeneration: vi.fn(async () => {
      throw new Error('Not used by review tests.');
    }),
    getNextReviewItems: vi.fn(async () => reviewQueue(items)),
    revealReviewItem: vi.fn(async (recallItemId) => ({ recallItemId, answer })),
    submitReviewGrade: vi.fn(async (input) => ({
      clientRequestId: input.clientRequestId,
      recallItemId: input.recallItemId,
      grade: input.grade,
      answer,
      reviewState: {
        state: 'learning' as const,
        stability: 1.4,
        difficulty: 5.1,
        reps: 1,
        lapses: 0,
        lastReviewedAt: '2026-08-02T12:00:00.000Z',
        dueAt: '2026-08-04T12:00:00.000Z',
        intervalSeconds: 172_800,
        intervalDays: 2,
      },
      schedulerVersion: '1.0.0',
    })),
    submitReviewGradeBatch: vi.fn(async () => ({ results: [] })),
    getReviewStats: vi.fn(async () => ({
      daily: [],
      intervalBuckets: [],
      totalReviews: 0,
      retentionRate: 0,
      lapseRate: 0,
      currentStreak: 0,
    })),
    submitFeedback: vi.fn(async () => undefined),
    ...overrides,
  };
}

async function beginReview(): Promise<void> {
  const begin = await screen.findByRole('button', { name: 'Begin review' });
  begin.focus();
  fireEvent.click(begin);
}

async function waitForGradesReady(): Promise<void> {
  await waitFor(() => {
    const again = screen.getByRole('button', { name: 'Again, next review 1 min' });
    expect((again as HTMLButtonElement).disabled).toBe(false);
  });
}

describe('LearningBored review panel', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 375 });
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(REQUEST_ID);
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('does not present a false mobile drag affordance', async () => {
    const client = createClient([dueItem('recall-one', 'Which fictional component moves?')]);
    render(<LearningBoredReviewPanel client={client} onClose={vi.fn()} />);

    await screen.findByText('1 question is due now.');
    const panel = screen.getByTestId('learningbored-review-panel');
    expect(panel.querySelector('[aria-hidden="true"] > .h-1.w-10.rounded-full')).toBeNull();
  });

  it('keeps the AI-generated source-check notice visible throughout recall study', async () => {
    const client = createClient([dueItem('recall-one', 'Which fictional component moves?')]);
    render(<LearningBoredReviewPanel client={client} onClose={vi.fn()} />);

    await screen.findByText('1 question is due now.');
    const notice = screen.getByRole('note', { name: 'AI-generated review notice' });
    expect(notice.textContent).toContain(
      'AI-generated study aid. Check important details against the source.',
    );

    await beginReview();
    expect(screen.getByRole('note', { name: 'AI-generated review notice' })).toBe(notice);

    fireEvent.keyDown(window, { key: ' ', code: 'Space' });
    await screen.findByText('The inner fictional rotor moves.');
    expect(screen.getByRole('note', { name: 'AI-generated review notice' })).toBe(notice);
  });

  it('keeps answer material out of the DOM until a deliberate Space reveal', async () => {
    const item = dueItem('recall-one', 'Which fictional component moves?');
    const client = createClient([item]);

    render(
      <LearningBoredReviewPanel
        client={client}
        documentId='document-fictional'
        conceptId='concept-fictional'
        onClose={vi.fn()}
      />,
    );

    expect(await screen.findByText('1 question is due now.')).toBeTruthy();
    expect(client.getNextReviewItems).toHaveBeenCalledWith(
      { limit: 20, documentId: 'document-fictional', conceptId: 'concept-fictional' },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(screen.queryByText('The inner fictional rotor moves.')).toBeNull();
    expect(screen.queryByText(/stationary outer ring/u)).toBeNull();
    expect(screen.queryByText(/Names the inner rotor/u)).toBeNull();
    expect(client.revealReviewItem).not.toHaveBeenCalled();

    await beginReview();
    expect(screen.getByText('Which fictional component moves?')).toBeTruthy();
    expect(screen.getByText('The outer fictional ring.')).toBeTruthy();
    expect(screen.queryByText('The inner fictional rotor moves.')).toBeNull();

    fireEvent.keyDown(window, { key: ' ', code: 'Space' });

    expect(await screen.findByText('The inner fictional rotor moves.')).toBeTruthy();
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByText('Answer').closest('section'));
    });
    expect(client.revealReviewItem).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/contrasts the moving inner part/u)).toBeTruthy();
    expect(screen.getByText('The source describes the outer ring as stationary.')).toBeTruthy();
    expect(
      screen.getByText('The source explicitly identifies the inner rotor as moving.'),
    ).toBeTruthy();
    expect(screen.getByText('Names the inner rotor.')).toBeTruthy();
    expect(screen.getByText('Distinguishes it from the stationary ring.')).toBeTruthy();
    expect(
      screen.getAllByText('Fictional mechanics notes · Gentle mechanisms · p. 7'),
    ).toHaveLength(2);
    expect(
      screen.getByText('The inner fictional rotor moves while the outer ring stays still.'),
    ).toBeTruthy();

    expect(screen.getByRole('button', { name: 'Again, next review 1 min' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Hard, next review 10 min' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Good, next review 2 days' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Easy, next review 1 year' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Again, next review 1 min' }).className).toContain(
      'min-h-14',
    );
    expect(screen.getByRole('button', { name: 'Bad choice' }).className).toContain('min-h-11');
    expect(screen.getByRole('button', { name: 'Close review' }).className).toContain('min-h-11');
    expect(screen.getByRole('button', { name: 'Close review' }).className).toContain('min-w-11');
    expect(screen.getByRole('group', { name: 'Recall grade' }).className).toContain('grid-cols-2');

    const panel = screen.getByTestId('learningbored-review-panel');
    expect(panel.className).toContain('w-full');
    expect(panel.className).toContain('min-w-0');
  });

  it.each<[string, LearningBoredReviewGrade]>([
    ['1', 'again'],
    ['2', 'hard'],
    ['3', 'good'],
    ['4', 'easy'],
  ])('maps keyboard grade %s to %s and completes immediately', async (key, grade) => {
    const item = dueItem('recall-one', 'Which fictional component moves?');
    const client = createClient([item]);
    render(<LearningBoredReviewPanel client={client} onClose={vi.fn()} />);

    await beginReview();
    fireEvent.keyDown(window, { key: ' ', code: 'Space' });
    await screen.findByText('The inner fictional rotor moves.');
    await waitForGradesReady();
    fireEvent.keyDown(window, { key, code: `Digit${key}` });

    expect(await screen.findByRole('heading', { name: 'Review complete' })).toBeTruthy();
    expect(client.submitReviewGrade).toHaveBeenCalledWith(
      expect.objectContaining({
        clientRequestId: REQUEST_ID,
        recallItemId: 'recall-one',
        grade,
      }),
    );
  });

  it('offers document progress when a scoped review completes', async () => {
    const item = dueItem('recall-one', 'Which fictional component moves?');
    const client = createClient([item]);
    const onOpenProgress = vi.fn();
    render(
      <LearningBoredReviewPanel
        client={client}
        documentId='document-fictional'
        onClose={vi.fn()}
        onOpenProgress={onOpenProgress}
      />,
    );

    await beginReview();
    fireEvent.keyDown(window, { key: ' ', code: 'Space' });
    await screen.findByText('The inner fictional rotor moves.');
    await waitForGradesReady();
    fireEvent.click(screen.getByRole('button', { name: 'Good, next review 2 days' }));

    fireEvent.click(await screen.findByRole('button', { name: 'View progress' }));
    expect(onOpenProgress).toHaveBeenCalledWith('document-fictional');
  });

  it('holds one request ID through an uncertain grade retry, then advances to the next item', async () => {
    const first = dueItem('recall-one', 'Which fictional component moves?');
    const second = dueItem('recall-two', 'What remains stationary?', 'short_answer');
    const submitReviewGrade = vi
      .fn<LearningBoredClient['submitReviewGrade']>()
      .mockRejectedValueOnce(new Error('Connection lost after write.'))
      .mockImplementationOnce(async (input) => createClient([]).submitReviewGrade(input));
    const getNextReviewItems = vi
      .fn<LearningBoredClient['getNextReviewItems']>()
      .mockResolvedValueOnce(reviewQueue([first, second]))
      .mockResolvedValueOnce(reviewQueue([second]));
    const client = createClient([first, second], { submitReviewGrade, getNextReviewItems });
    render(<LearningBoredReviewPanel client={client} onClose={vi.fn()} />);

    await beginReview();
    fireEvent.keyDown(window, { key: ' ', code: 'Space' });
    await screen.findByText('The inner fictional rotor moves.');
    await waitForGradesReady();
    fireEvent.keyDown(window, { key: '3', code: 'Digit3' });

    const retry = await screen.findByRole('button', { name: 'Retry grade' });
    expect(retry.className).toContain('min-h-11');
    expect(screen.getByText('Which fictional component moves?')).toBeTruthy();
    const suppress = screen.getByRole('button', { name: 'Bad choice' }) as HTMLButtonElement;
    expect(suppress.disabled).toBe(true);
    fireEvent.click(suppress);
    expect(client.submitFeedback).not.toHaveBeenCalled();
    fireEvent.click(retry);

    expect(await screen.findByText('What remains stationary?')).toBeTruthy();
    const requests = submitReviewGrade.mock.calls.map(
      (call) => (call[0] as LearningBoredSubmitReviewGradeInput).clientRequestId,
    );
    expect(requests).toEqual([REQUEST_ID, REQUEST_ID]);
    expect(screen.queryByText('The inner fictional rotor moves.')).toBeNull();
  });

  it('reconciles the exact persisted grade after close and reopen without storing answer material', async () => {
    const first = dueItem('recall-one', 'Which fictional component moves?');
    const second = dueItem('recall-two', 'What remains stationary?', 'short_answer');
    const firstSubmit = vi
      .fn<LearningBoredClient['submitReviewGrade']>()
      .mockRejectedValue(new Error('Connection lost after write.'));
    const firstClient = createClient([first], { submitReviewGrade: firstSubmit });
    const firstRender = render(
      <LearningBoredReviewPanel
        client={firstClient}
        documentId='document-fictional'
        onClose={vi.fn()}
      />,
    );

    await beginReview();
    fireEvent.click(screen.getByLabelText('The inner fictional rotor.'));
    fireEvent.keyDown(window, { key: ' ', code: 'Space' });
    await screen.findByText('The inner fictional rotor moves.');
    await waitForGradesReady();
    fireEvent.keyDown(window, { key: '3', code: 'Digit3' });

    expect(await screen.findByRole('button', { name: 'Retry grade' })).toBeTruthy();
    fireEvent.keyDown(window, { key: '4', code: 'Digit4' });
    expect(firstSubmit).toHaveBeenCalledTimes(1);
    expect(globalThis.crypto.randomUUID).toHaveBeenCalledTimes(1);

    expect(localStorage).toHaveLength(1);
    const storageKey = localStorage.key(0);
    expect(storageKey).not.toBeNull();
    const persistedRaw = localStorage.getItem(storageKey!);
    expect(persistedRaw).not.toBeNull();
    const persisted = JSON.parse(persistedRaw!) as {
      documentScope: string | null;
      occurrence: { recallItemId: string; documentId: string; state: string; dueAt: string | null };
      request: LearningBoredSubmitReviewGradeInput;
    };
    expect(persisted).toMatchObject({
      documentScope: 'document-fictional',
      occurrence: {
        recallItemId: 'recall-one',
        documentId: 'document-fictional',
        state: 'new',
        dueAt: null,
      },
      request: {
        clientRequestId: REQUEST_ID,
        recallItemId: 'recall-one',
        reviewOccurrence: { state: 'new', dueAt: null, reps: 0, lapses: 0 },
        grade: 'good',
        answeredOptionId: 'choice-2',
      },
    });
    expect(persistedRaw).not.toContain('"answer":');
    expect(persistedRaw).not.toContain('"explanation":');
    expect(persistedRaw).not.toContain('"anchor":');
    expect(persistedRaw).not.toContain('"sourceText":');
    expect(persistedRaw).not.toContain('"selectedText":');

    firstRender.unmount();

    const secondClient = createClient([second]);
    render(
      <LearningBoredReviewPanel
        client={secondClient}
        documentId='document-fictional'
        onClose={vi.fn()}
      />,
    );

    expect(await screen.findByRole('button', { name: 'Begin review' })).toBeTruthy();
    expect(secondClient.submitReviewGrade).toHaveBeenCalledTimes(1);
    expect(secondClient.submitReviewGrade).toHaveBeenCalledWith(
      persisted.request,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(globalThis.crypto.randomUUID).toHaveBeenCalledTimes(1);
    expect(localStorage).toHaveLength(0);

    await beginReview();
    expect(screen.getByText('What remains stationary?')).toBeTruthy();
  });

  it('replays an already-applied ID and reloads so its newly-due occurrence remains', async () => {
    const original = dueItem('recall-one', 'Which fictional component moves?');
    const request: LearningBoredSubmitReviewGradeInput = {
      clientRequestId: REQUEST_ID,
      recallItemId: original.recallItem.id,
      reviewOccurrence: { state: 'new', dueAt: null, reps: 0, lapses: 0 },
      grade: 'good',
      elapsedMs: 420,
    };
    const entry = createLearningBoredReviewGradeOutboxEntry(
      original,
      'document-fictional',
      request,
    );
    expect(writeLearningBoredReviewGradeOutbox(entry)).toEqual({ status: 'stored' });

    const newlyDue: LearningBoredDueReviewItem = {
      ...original,
      reviewState: {
        ...original.reviewState,
        state: 'learning',
        dueAt: '2026-08-02T11:59:00.000Z',
        reps: 1,
      },
    };
    const client = createClient([newlyDue]);
    render(
      <LearningBoredReviewPanel
        client={client}
        documentId='document-fictional'
        onClose={vi.fn()}
      />,
    );

    expect(await screen.findByRole('button', { name: 'Begin review' })).toBeTruthy();
    expect(client.submitReviewGrade).toHaveBeenCalledWith(
      request,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(localStorage).toHaveLength(0);
    await beginReview();
    expect(screen.getByText('Which fictional component moves?')).toBeTruthy();
    expect(screen.queryByText('The inner fictional rotor moves.')).toBeNull();
    expect(globalThis.crypto.randomUUID).not.toHaveBeenCalled();
  });

  it('does not let an unapplied stale grade advance a newer occurrence after reopen', async () => {
    const original = dueItem('recall-one', 'Which fictional component moves?');
    const request: LearningBoredSubmitReviewGradeInput = {
      clientRequestId: REQUEST_ID,
      recallItemId: original.recallItem.id,
      reviewOccurrence: { state: 'new', dueAt: null, reps: 0, lapses: 0 },
      grade: 'good',
    };
    const entry = createLearningBoredReviewGradeOutboxEntry(
      original,
      'document-fictional',
      request,
    );
    expect(writeLearningBoredReviewGradeOutbox(entry)).toEqual({ status: 'stored' });

    const newlyDue: LearningBoredDueReviewItem = {
      ...original,
      reviewState: {
        ...original.reviewState,
        state: 'learning',
        dueAt: '2026-08-02T11:59:00.000Z',
        reps: 1,
      },
    };
    const staleOccurrence = Object.assign(
      new Error('The recall item has advanced since this review occurrence was loaded.'),
      { status: 400, code: 'invalid_request' },
    );
    const submitReviewGrade = vi
      .fn<LearningBoredClient['submitReviewGrade']>()
      .mockRejectedValue(staleOccurrence);
    const client = createClient([newlyDue], { submitReviewGrade });
    render(
      <LearningBoredReviewPanel
        client={client}
        documentId='document-fictional'
        onClose={vi.fn()}
      />,
    );

    expect(await screen.findByRole('button', { name: 'Reload review' })).toBeTruthy();
    expect(submitReviewGrade).toHaveBeenCalledTimes(1);
    expect(submitReviewGrade).toHaveBeenCalledWith(
      expect.objectContaining({
        clientRequestId: REQUEST_ID,
        reviewOccurrence: { state: 'new', dueAt: null, reps: 0, lapses: 0 },
      }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(localStorage).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Reload review' }));
    await waitFor(() => expect(client.getNextReviewItems).toHaveBeenCalledTimes(2));
    expect(submitReviewGrade).toHaveBeenCalledTimes(1);
    await beginReview();
    expect(screen.getByText('Which fictional component moves?')).toBeTruthy();
    expect(screen.queryByText('The inner fictional rotor moves.')).toBeNull();
  });

  it('does not submit until the same grade request can be persisted safely', async () => {
    const item = dueItem('recall-one', 'Which fictional component moves?');
    const client = createClient([item]);
    render(<LearningBoredReviewPanel client={client} onClose={vi.fn()} />);

    await beginReview();
    fireEvent.keyDown(window, { key: ' ', code: 'Space' });
    await screen.findByText('The inner fictional rotor moves.');
    await waitForGradesReady();
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage is unavailable.');
    });
    fireEvent.keyDown(window, { key: '3', code: 'Digit3' });

    expect(
      await screen.findByText(
        'This grade was not sent because its retry-safe local record could not be saved. Retry when local storage is available.',
      ),
    ).toBeTruthy();
    expect(client.submitReviewGrade).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: '4', code: 'Digit4' });
    expect(client.submitReviewGrade).not.toHaveBeenCalled();
    expect(globalThis.crypto.randomUUID).toHaveBeenCalledTimes(1);

    setItem.mockRestore();
    fireEvent.click(screen.getByRole('button', { name: 'Retry grade' }));
    expect(await screen.findByRole('heading', { name: 'Review complete' })).toBeTruthy();
    expect(client.submitReviewGrade).toHaveBeenCalledTimes(1);
    expect(client.submitReviewGrade).toHaveBeenCalledWith(
      expect.objectContaining({ clientRequestId: REQUEST_ID, grade: 'good' }),
    );
  });

  it('reloads the queue instead of retrying a definitive grade rejection forever', async () => {
    const item = dueItem('recall-one', 'Which fictional component moves?');
    const definitiveError = Object.assign(new Error('The item was removed.'), {
      status: 404,
      code: 'not_found',
    });
    const submitReviewGrade = vi
      .fn<LearningBoredClient['submitReviewGrade']>()
      .mockRejectedValue(definitiveError);
    const client = createClient([item], { submitReviewGrade });
    render(<LearningBoredReviewPanel client={client} onClose={vi.fn()} />);

    await beginReview();
    fireEvent.keyDown(window, { key: ' ', code: 'Space' });
    await screen.findByText('The inner fictional rotor moves.');
    await waitForGradesReady();
    fireEvent.keyDown(window, { key: '3', code: 'Digit3' });

    const reload = await screen.findByRole('button', { name: 'Reload review' });
    expect(screen.queryByRole('button', { name: 'Retry grade' })).toBeNull();
    expect(submitReviewGrade).toHaveBeenCalledTimes(1);
    expect(
      (screen.getByRole('button', { name: 'Good, next review 2 days' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect((screen.getByRole('button', { name: 'Bad choice' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    fireEvent.keyDown(window, { key: '4', code: 'Digit4' });
    expect(submitReviewGrade).toHaveBeenCalledTimes(1);
    fireEvent.click(reload);

    await waitFor(() => expect(client.getNextReviewItems).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('button', { name: 'Begin review' })).toBeTruthy();
    expect(submitReviewGrade).toHaveBeenCalledTimes(1);
  });

  it('locks duplicate grade shortcuts while the request is active', async () => {
    let releaseGrade: () => void = () => undefined;
    const gradeGate = new Promise<void>((resolve) => {
      releaseGrade = resolve;
    });
    const fallbackClient = createClient([]);
    const submitReviewGrade = vi.fn<LearningBoredClient['submitReviewGrade']>(async (input) => {
      await gradeGate;
      return fallbackClient.submitReviewGrade(input);
    });
    const client = createClient([dueItem('recall-one', 'Which fictional component moves?')], {
      submitReviewGrade,
    });
    render(<LearningBoredReviewPanel client={client} onClose={vi.fn()} />);

    await beginReview();
    fireEvent.keyDown(window, { key: ' ', code: 'Space' });
    await screen.findByText('The inner fictional rotor moves.');
    await waitForGradesReady();
    fireEvent.keyDown(window, { key: '3', code: 'Digit3' });
    fireEvent.keyDown(window, { key: '3', code: 'Digit3' });

    expect(submitReviewGrade).toHaveBeenCalledTimes(1);
    releaseGrade();
    expect(await screen.findByRole('heading', { name: 'Review complete' })).toBeTruthy();
  });

  it('suppresses a reported item in one action and removes it from the session immediately', async () => {
    const first = dueItem('recall-one', 'Which fictional component moves?');
    const second = dueItem('recall-two', 'What remains stationary?', 'short_answer');
    const submitFeedback = vi.fn<LearningBoredClient['submitFeedback']>(async () => undefined);
    const client = createClient([first, second], { submitFeedback });
    render(<LearningBoredReviewPanel client={client} onClose={vi.fn()} />);

    await beginReview();
    fireEvent.click(screen.getByRole('button', { name: 'Bad choice' }));

    expect(screen.queryByText('Which fictional component moves?')).toBeNull();
    expect(screen.getByText('What remains stationary?')).toBeTruthy();
    await waitFor(() =>
      expect(submitFeedback).toHaveBeenCalledWith({
        recallItemId: 'recall-one',
        category: 'bad_distractor',
        suppressItem: true,
      }),
    );
    expect(client.revealReviewItem).not.toHaveBeenCalled();
  });

  it('continues a review larger than one twenty-item page and reports truthful totals', async () => {
    let requestSequence = 0;
    vi.mocked(globalThis.crypto.randomUUID).mockImplementation(() => {
      requestSequence += 1;
      return `00000000-0000-4000-8000-${String(requestSequence).padStart(12, '0')}`;
    });
    const firstPage = Array.from({ length: 20 }, (_, index) =>
      dueItem(`recall-${index + 1}`, `Fictional question ${index + 1}?`, 'short_answer'),
    );
    const finalItem = dueItem('recall-21', 'Fictional question 21?', 'short_answer');
    const queueSummary = (newAvailable: number) => ({
      dueNow: 0,
      dueToday: 0,
      newAvailable,
      reviewedToday: 4,
      dailyTarget: 12,
    });
    const getNextReviewItems = vi
      .fn<LearningBoredClient['getNextReviewItems']>()
      .mockResolvedValueOnce({ items: firstPage, queue: queueSummary(21) })
      .mockResolvedValueOnce({ items: [finalItem], queue: queueSummary(1) });
    const client = createClient(firstPage, { getNextReviewItems });
    render(<LearningBoredReviewPanel client={client} onClose={vi.fn()} />);

    expect(await screen.findByText('21 questions are due now.')).toBeTruthy();
    await beginReview();
    for (let index = 0; index < firstPage.length; index += 1) {
      expect(screen.getByText(`Fictional question ${index + 1}?`)).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: /^Reveal answer/u }));
      await screen.findByText('The inner fictional rotor moves.');
      await waitForGradesReady();
      fireEvent.click(screen.getByRole('button', { name: 'Good, next review 2 days' }));
      if (index + 1 < firstPage.length) {
        await screen.findByText(`Fictional question ${index + 2}?`);
      }
    }

    expect(
      await screen.findByRole('heading', { name: 'More questions are available' }),
    ).toBeTruthy();
    expect(screen.getByText('20 reviewed. 1 remain.')).toBeTruthy();
    expect(getNextReviewItems).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Continue review — 1 remaining' }));

    expect(await screen.findByText('Fictional question 21?')).toBeTruthy();
    expect(getNextReviewItems).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole('button', { name: /^Reveal answer/u }));
    await screen.findByText('The inner fictional rotor moves.');
    await waitForGradesReady();
    fireEvent.click(screen.getByRole('button', { name: 'Good, next review 2 days' }));

    expect(await screen.findByRole('heading', { name: 'Review complete' })).toBeTruthy();
    expect(screen.getByText('21 reviewed. 0 remain.')).toBeTruthy();
    expect(client.submitReviewGrade).toHaveBeenCalledTimes(21);
    expect(
      new Set(
        vi.mocked(client.submitReviewGrade).mock.calls.map(([input]) => input.clientRequestId),
      ).size,
    ).toBe(21);
  }, 15_000);

  it('stops after an empty continuation even when raw queue counts remain nonzero', async () => {
    const item = dueItem('recall-one', 'Which fictional component moves?');
    const summary = (newAvailable: number) => ({
      dueNow: 0,
      dueToday: 0,
      newAvailable,
      reviewedToday: 4,
      dailyTarget: 12,
    });
    const getNextReviewItems = vi
      .fn<LearningBoredClient['getNextReviewItems']>()
      .mockResolvedValueOnce({ items: [item], queue: summary(2) })
      .mockResolvedValueOnce({ items: [], queue: summary(1) });
    const client = createClient([item], { getNextReviewItems });
    render(<LearningBoredReviewPanel client={client} onClose={vi.fn()} />);

    await beginReview();
    fireEvent.keyDown(window, { key: ' ', code: 'Space' });
    await screen.findByText('The inner fictional rotor moves.');
    await waitForGradesReady();
    fireEvent.keyDown(window, { key: '3', code: 'Digit3' });

    fireEvent.click(await screen.findByRole('button', { name: 'Continue review — 1 remaining' }));
    expect(
      await screen.findByText(
        '1 reviewed. No more validated questions are available from the remaining queue right now.',
      ),
    ).toBeTruthy();
    await waitFor(() => expect(getNextReviewItems).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('button', { name: /Continue review/u })).toBeNull();
  });
});
