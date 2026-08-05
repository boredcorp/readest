import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (message: string) => message,
}));

import LearningBoredCapturePanel, {
  type LearningBoredCapturePanelProps,
} from '@/integrations/learningbored/LearningBoredCapturePanel';
import type {
  LearningBoredBoardResult,
  LearningBoredClient,
  LearningBoredGenerationSnapshot,
} from '@/integrations/learningbored/client';
import type { LearningBoredReaderSession } from '@/integrations/learningbored/session';

const passage = {
  bookId: 'book-1',
  selectedText: 'A generic signal passes through three fictional stages.',
  surroundingContext: 'Before. A generic signal passes through three fictional stages. After.',
  contextOffset: 8,
  location: {
    version: 1 as const,
    kind: 'cfi' as const,
    bookId: 'book-1',
    cfi: 'epubcfi(/6/2!/4/2/1:0)',
    pageIndex: 0,
  },
};

const documentInput = {
  bookId: 'book-1',
  title: 'Fictional systems lesson',
  author: 'A. Example',
  format: 'EPUB',
};

function createSession(
  overrides: Partial<LearningBoredReaderSession> = {},
): LearningBoredReaderSession {
  return {
    version: 2,
    bookId: 'book-1',
    panelOpen: true,
    passage,
    generationId: 'generation-1',
    boardId: null,
    showScaffold: true,
    kind: null,
    updatedAt: Date.now(),
    ...overrides,
  };
}

function createBoard(overrides: Partial<LearningBoredBoardResult> = {}): LearningBoredBoardResult {
  return {
    id: 'board-1',
    documentId: 'document-1',
    kind: 'process_flow',
    title: 'How the fictional signal moves',
    svg: null,
    outline: [
      {
        id: 'node-1',
        kind: 'content',
        label: 'Core signal',
        description: 'The source introduces a generic signal.',
        provenance: 'anchored',
        sourceSpan: { sourceStart: 2, sourceEnd: 16 },
      },
      {
        id: 'node-2',
        kind: 'content',
        label: 'Helpful bridge',
        description: 'A short restatement connects the stages.',
        provenance: 'scaffold',
        scaffoldForm: 'restatement',
      },
    ],
    figures: [
      {
        id: 'figure-1',
        nodeId: 'node-figure-1',
        description: 'Three unbranded boxes connected by arrows.',
        caption: 'A structural view of the stages.',
        imageUrl: null,
        provenance: 'anchored',
        sourceSpan: { sourceStart: 17, sourceEnd: 31 },
        labels: [],
        failed: true,
      },
    ],
    recallQuestions: [
      {
        id: 'recall-1',
        kind: 'ordering',
        question: 'What order do the three fictional stages follow?',
      },
    ],
    ...overrides,
  };
}

function createClient(overrides: Partial<LearningBoredClient> = {}): LearningBoredClient {
  const board = createBoard();
  const queued: LearningBoredGenerationSnapshot = {
    id: 'generation-1',
    status: 'queued',
    boardId: null,
  };

  return {
    listDocuments: vi.fn(async () => ({ documents: [] })),
    getDocument: vi.fn(async () => {
      throw new Error('No document fixture configured.');
    }),
    getDocumentMastery: vi.fn(async () => {
      throw new Error('No mastery fixture configured.');
    }),
    getDocumentReadiness: vi.fn(async () => {
      throw new Error('No readiness fixture configured.');
    }),
    listBlueprints: vi.fn(async () => ({ blueprints: [] })),
    createBlueprint: vi.fn(async () => {
      throw new Error('No blueprint fixture configured.');
    }),
    patchBlueprint: vi.fn(async () => {
      throw new Error('No blueprint fixture configured.');
    }),
    attachBlueprint: vi.fn(async () => {
      throw new Error('No blueprint fixture configured.');
    }),
    setManualConceptMapping: vi.fn(async () => {
      throw new Error('No mapping fixture configured.');
    }),
    getBoardComprehension: vi.fn(async (boardId) => ({
      boardId,
      passageId: 'passage-1',
      status: 'unanswered' as const,
      outcome: null,
      feedbackId: null,
      respondedAt: null,
    })),
    submitBoardComprehension: vi.fn(async (boardId, input) => ({
      boardId,
      passageId: 'passage-1',
      status: 'answered' as const,
      outcome: input.outcome,
      feedbackId: 'feedback-1',
      respondedAt: '2026-08-03T12:00:00.000Z',
    })),
    createGeneration: vi.fn(async () => queued),
    getGeneration: vi.fn(async () => queued),
    getBoard: vi.fn(async () => board),
    rerenderBoard: vi.fn(async () => board),
    requestFigureRegeneration: vi.fn(async (_boardId, nodeId, input) => ({
      id: 'figure-regeneration-1',
      boardId: board.id,
      nodeId,
      clientRequestId: input.clientRequestId,
      issue: input.issue,
      status: 'queued' as const,
      chalkCost: 1,
      failureReason: null,
      refundConfirmed: false,
    })),
    getFigureRegeneration: vi.fn(async () => ({
      id: 'figure-regeneration-1',
      boardId: board.id,
      nodeId: 'node-figure-1',
      clientRequestId: 'reader-request-1',
      issue: 'unclear' as const,
      status: 'queued' as const,
      chalkCost: 1,
      failureReason: null,
      refundConfirmed: false,
    })),
    cancelGeneration: vi.fn(async () => ({ ...queued, status: 'cancelled' as const })),
    retryGeneration: vi.fn(async () => queued),
    getNextReviewItems: vi.fn(async () => ({
      items: [],
      queue: {
        dueNow: 0,
        dueToday: 0,
        newAvailable: 0,
        reviewedToday: 0,
        dailyTarget: 20,
      },
    })),
    revealReviewItem: vi.fn(async () => {
      throw new Error('No review fixture configured.');
    }),
    submitReviewGrade: vi.fn(async () => {
      throw new Error('No review fixture configured.');
    }),
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

function renderPanel(input?: {
  session?: LearningBoredReaderSession;
  client?: LearningBoredClient;
  onSessionPatch?: LearningBoredCapturePanelProps['onSessionPatch'];
  onStartReview?: NonNullable<LearningBoredCapturePanelProps['onStartReview']>;
  onSourceSpanEnter?: NonNullable<LearningBoredCapturePanelProps['onSourceSpanEnter']>;
  onSourceSpanLeave?: NonNullable<LearningBoredCapturePanelProps['onSourceSpanLeave']>;
}) {
  const session = input?.session ?? createSession();
  const client = input?.client ?? createClient();
  const onSessionPatch =
    input?.onSessionPatch ?? vi.fn<LearningBoredCapturePanelProps['onSessionPatch']>();
  const onSourceSpanEnter =
    input?.onSourceSpanEnter ??
    vi.fn<NonNullable<LearningBoredCapturePanelProps['onSourceSpanEnter']>>();
  const onSourceSpanLeave =
    input?.onSourceSpanLeave ??
    vi.fn<NonNullable<LearningBoredCapturePanelProps['onSourceSpanLeave']>>();
  const props = {
    isOpen: true,
    session,
    document: documentInput,
    client,
    onClose: vi.fn(),
    onClear: vi.fn(),
    onStartReview: input?.onStartReview,
    onSessionPatch,
    onSourceSpanEnter,
    onSourceSpanLeave,
  };
  const rendered = render(<LearningBoredCapturePanel {...props} />);
  return {
    ...rendered,
    client,
    props,
    onSessionPatch,
    onSourceSpanEnter,
    onSourceSpanLeave,
  };
}

async function advancePoll(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2_000);
  });
}

describe('LearningBored reader result panel', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('starts a new generation through the injected client and shows real stages', async () => {
    const createGeneration = vi.fn(async () => ({
      id: 'generation-new',
      status: 'extracting' as const,
      boardId: null,
    }));
    const client = createClient({ createGeneration });
    const onSessionPatch = vi.fn();

    const rendered = renderPanel({
      session: createSession({ generationId: null, boardId: null }),
      client,
      onSessionPatch,
    });

    await waitFor(() => expect(createGeneration).toHaveBeenCalledTimes(1));
    expect(createGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        document: documentInput,
        selectedText: passage.selectedText,
        surroundingContext: passage.surroundingContext,
        location: passage.location,
        allowFigures: true,
        allowScaffold: true,
      }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(screen.getAllByText('Reading the passage')).toHaveLength(2);
    expect(rendered.container.querySelector('.animate-spin')).toBeNull();
    expect(onSessionPatch).toHaveBeenCalledWith({ generationId: 'generation-new' });
  });

  it('restarts an initial generation when StrictMode replays mount effects', async () => {
    const requestSignals: AbortSignal[] = [];
    const createGeneration = vi.fn<LearningBoredClient['createGeneration']>((_input, options) => {
      const signal = options?.signal;
      if (!signal) throw new Error('Expected the generation request to be abortable.');
      requestSignals.push(signal);

      if (requestSignals.length === 1) {
        return new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        });
      }

      return Promise.resolve({
        id: 'generation-after-replay',
        status: 'extracting' as const,
        boardId: null,
      });
    });
    const onSessionPatch = vi.fn();

    render(
      <StrictMode>
        <LearningBoredCapturePanel
          isOpen
          session={createSession({ generationId: null, boardId: null })}
          document={documentInput}
          client={createClient({ createGeneration })}
          onClose={vi.fn()}
          onClear={vi.fn()}
          onSessionPatch={onSessionPatch}
        />
      </StrictMode>,
    );

    await waitFor(() => expect(createGeneration).toHaveBeenCalledTimes(2));
    expect(requestSignals[0]?.aborted).toBe(true);
    expect(requestSignals[1]?.aborted).toBe(false);
    await waitFor(() =>
      expect(onSessionPatch).toHaveBeenCalledWith({ generationId: 'generation-after-replay' }),
    );
  });

  it('keeps an in-flight generation alive when the source-highlight callback changes', async () => {
    let resolveGeneration!: (snapshot: LearningBoredGenerationSnapshot) => void;
    let requestSignal: AbortSignal | undefined;
    const createGeneration = vi.fn<LearningBoredClient['createGeneration']>((_input, options) => {
      requestSignal = options?.signal;
      return new Promise((resolve) => {
        resolveGeneration = resolve;
      });
    });
    const firstSourceSpanLeave = vi.fn();
    const nextSourceSpanLeave = vi.fn();
    const rendered = renderPanel({
      session: createSession({ generationId: null, boardId: null }),
      client: createClient({ createGeneration }),
      onSourceSpanLeave: firstSourceSpanLeave,
    });

    await waitFor(() => expect(createGeneration).toHaveBeenCalledTimes(1));
    expect(requestSignal?.aborted).toBe(false);

    rendered.rerender(
      <LearningBoredCapturePanel {...rendered.props} onSourceSpanLeave={nextSourceSpanLeave} />,
    );

    expect(firstSourceSpanLeave).toHaveBeenCalledTimes(1);
    expect(requestSignal?.aborted).toBe(false);

    await act(async () => {
      resolveGeneration({
        id: 'generation-new',
        status: 'extracting',
        boardId: null,
      });
      await Promise.resolve();
    });
    expect(screen.getAllByText('Reading the passage')).toHaveLength(2);
  });

  it('polls every two seconds through illustrating and renders the completed result', async () => {
    vi.useFakeTimers();
    const board = createBoard();
    const getGeneration = vi
      .fn<LearningBoredClient['getGeneration']>()
      .mockResolvedValueOnce({ id: 'generation-1', status: 'illustrating', boardId: null })
      .mockResolvedValueOnce({
        id: 'generation-1',
        status: 'completed',
        boardId: board.id,
        board,
      });
    renderPanel({ client: createClient({ getGeneration }) });

    expect(
      screen.getByRole('complementary', { name: 'AI-generated content notice' }).textContent,
    ).toContain('AI-generated study aid. Check important details against the source.');
    expect(screen.getAllByText('Waiting to begin')).toHaveLength(2);
    await advancePoll();
    expect(screen.getAllByText('Illustrating')).toHaveLength(2);
    await advancePoll();

    expect(screen.getByRole('heading', { name: board.title })).toBeTruthy();
    expect(screen.getByText('Core signal')).toBeTruthy();
    expect(
      screen.getByText('Three unbranded boxes connected by arrows.', { exact: false }),
    ).toBeTruthy();
    expect(screen.queryByRole('img', { name: board.figures[0]!.description })).toBeNull();
    expect(screen.getByText('What order do the three fictional stages follow?')).toBeTruthy();
  });

  it('persists display choices, switches kind without regenerating, and highlights anchors', async () => {
    vi.useFakeTimers();
    const board = createBoard();
    const rerendered = createBoard({ kind: 'timeline', title: 'Signal timeline' });
    const rerenderBoard = vi.fn(async () => rerendered);
    const client = createClient({
      getGeneration: vi.fn(async () => ({
        id: 'generation-1',
        status: 'completed' as const,
        boardId: board.id,
        board,
      })),
      rerenderBoard,
    });
    const onSessionPatch = vi.fn();
    const onSourceSpanEnter = vi.fn();
    const onSourceSpanLeave = vi.fn();
    const rendered = renderPanel({
      client,
      onSessionPatch,
      onSourceSpanEnter,
      onSourceSpanLeave,
    });
    await advancePoll();

    const coreSignal = screen.getByRole('button', { name: /Core signal/ });
    fireEvent.mouseEnter(coreSignal);
    expect(onSourceSpanEnter).toHaveBeenCalledWith({ sourceStart: 2, sourceEnd: 16 });
    fireEvent.mouseLeave(coreSignal);
    expect(onSourceSpanLeave).toHaveBeenCalled();

    const scaffoldToggle = screen.getByRole('checkbox', { name: 'Added help' });
    await act(async () => {
      fireEvent.click(scaffoldToggle);
      await Promise.resolve();
    });
    expect(rerenderBoard).toHaveBeenNthCalledWith(1, board.id, {
      kind: 'process_flow',
      includeScaffold: false,
    });
    expect(onSessionPatch).toHaveBeenCalledWith({
      boardId: board.id,
      kind: 'timeline',
      showScaffold: false,
    });
    rendered.rerender(
      <LearningBoredCapturePanel
        {...rendered.props}
        session={createSession({ boardId: board.id, showScaffold: false, kind: 'process_flow' })}
      />,
    );
    expect(screen.queryByText('Helpful bridge')).toBeNull();

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Board shape'), { target: { value: 'timeline' } });
      await Promise.resolve();
    });
    expect(rerenderBoard).toHaveBeenCalledTimes(2);
    expect(rerenderBoard).toHaveBeenNthCalledWith(2, board.id, {
      kind: 'timeline',
      includeScaffold: false,
    });
    expect(onSessionPatch).toHaveBeenCalledWith({ kind: 'timeline' });
    expect(screen.getByRole('heading', { name: 'Signal timeline' })).toBeTruthy();
  });

  it('accepts only private raster data URLs and falls back structurally for other data', async () => {
    vi.useFakeTimers();
    const board = createBoard({
      figures: [
        {
          id: 'figure-private',
          nodeId: 'node-figure-private',
          description: 'A private hydrated raster.',
          imageUrl: 'data:image/png;base64,AA==',
          provenance: 'anchored',
          labels: [],
        },
        {
          id: 'figure-unsafe',
          nodeId: 'node-figure-unsafe',
          description: 'An unsupported embedded vector.',
          imageUrl: 'data:image/svg+xml;base64,PHN2Zy8+',
          provenance: 'anchored',
          labels: [],
        },
      ],
    });
    renderPanel({
      client: createClient({
        getGeneration: vi.fn(async () => ({
          id: 'generation-1',
          status: 'completed' as const,
          boardId: board.id,
          board,
        })),
      }),
    });
    await advancePoll();

    expect(
      screen.getByRole('img', { name: 'A private hydrated raster.' }).getAttribute('src'),
    ).toBe('data:image/png;base64,AA==');
    expect(screen.queryByRole('img', { name: 'An unsupported embedded vector.' })).toBeNull();
    expect(screen.getByText('An unsupported embedded vector.', { exact: false })).toBeTruthy();
  });

  it('launches a document-scoped review from a completed Board recall preview', async () => {
    vi.useFakeTimers();
    const board = createBoard();
    const onStartReview = vi.fn<NonNullable<LearningBoredCapturePanelProps['onStartReview']>>();
    renderPanel({
      onStartReview,
      client: createClient({
        getGeneration: vi.fn(async () => ({
          id: 'generation-1',
          status: 'completed' as const,
          boardId: board.id,
          board,
        })),
      }),
    });
    await advancePoll();

    fireEvent.click(screen.getByRole('button', { name: 'Start review' }));
    expect(onStartReview).toHaveBeenCalledWith('document-1');
  });

  it('keeps relationships, groups, undefined markers, and failed figure labels in the outline', async () => {
    vi.useFakeTimers();
    const board = createBoard({
      outline: [
        {
          id: 'node-undefined',
          kind: 'content',
          label: 'Named regulator',
          description: 'The passage names this without defining it.',
          provenance: 'anchored',
          sourceSpan: { sourceStart: 2, sourceEnd: 16 },
          undefined: true,
          undefinedConceptIds: ['concept-regulator'],
        },
        {
          id: 'node-figure',
          kind: 'figure',
          label: 'Structural figure',
          description: 'The structural explanation remains complete.',
          provenance: 'anchored',
          sourceSpan: { sourceStart: 17, sourceEnd: 31 },
          figureFailed: true,
          labels: [
            {
              id: 'label-rotor',
              text: 'Rotor',
              description: 'The moving part.',
              at: { x: 0.5, y: 0.5 },
              provenance: 'anchored',
              sourceSpan: { sourceStart: 17, sourceEnd: 31 },
            },
          ],
        },
        {
          id: 'relationship:edge-1',
          kind: 'relationship',
          label: 'Named regulator → Structural figure',
          description: 'regulates',
          provenance: 'anchored',
          sourceSpan: { sourceStart: 2, sourceEnd: 31 },
        },
        {
          id: 'group:group-1',
          kind: 'group',
          label: 'Mechanism',
          description: 'Named regulator, Structural figure',
          provenance: 'anchored',
          sourceSpan: { sourceStart: 2, sourceEnd: 31 },
        },
      ],
    });
    renderPanel({
      client: createClient({
        getGeneration: vi.fn(async () => ({
          id: 'generation-1',
          status: 'completed' as const,
          boardId: board.id,
          board,
        })),
      }),
    });
    await advancePoll();

    expect(screen.getByText('Named but not defined in the passage')).toBeTruthy();
    expect(
      screen.getByText('Illustration unavailable. The structural explanation remains.'),
    ).toBeTruthy();
    expect(screen.getByText('Named regulator → Structural figure')).toBeTruthy();
    expect(screen.getByText('Relationship')).toBeTruthy();
    expect(screen.getByText('Mechanism')).toBeTruthy();
    expect(screen.getByText('Group')).toBeTruthy();
    expect(screen.getByText('1. Rotor:')).toBeTruthy();
  });

  it('states the one-Chalk figure cost before requesting, polls, and refreshes hydrated output', async () => {
    vi.useFakeTimers();
    const board = createBoard({
      figures: [
        {
          id: 'figure-private',
          nodeId: 'node-figure-private',
          description: 'A private hydrated raster.',
          caption: 'The current accepted figure.',
          imageUrl: 'data:image/png;base64,AA==',
          provenance: 'anchored',
          sourceSpan: { sourceStart: 17, sourceEnd: 31 },
          labels: [],
          failed: false,
        },
      ],
    });
    const refreshed = createBoard({
      title: 'Board with replacement figure',
      figures: [
        {
          ...board.figures[0]!,
          imageUrl: 'data:image/png;base64,AQ==',
          caption: 'The checked replacement figure.',
        },
      ],
    });
    const requestFigureRegeneration = vi.fn<LearningBoredClient['requestFigureRegeneration']>(
      async (_boardId, nodeId, input) => ({
        id: 'figure-regeneration-1',
        boardId: board.id,
        nodeId,
        clientRequestId: input.clientRequestId,
        issue: input.issue,
        status: 'queued',
        chalkCost: 1,
        failureReason: null,
        refundConfirmed: false,
      }),
    );
    const getFigureRegeneration = vi.fn<LearningBoredClient['getFigureRegeneration']>(async () => ({
      id: 'figure-regeneration-1',
      boardId: board.id,
      nodeId: 'node-figure-private',
      clientRequestId: 'reader-request-stable',
      issue: 'missing_part',
      status: 'completed',
      chalkCost: 1,
      failureReason: null,
      refundConfirmed: false,
    }));
    const rerenderBoard = vi.fn(async () => refreshed);
    const client = createClient({
      getGeneration: vi.fn(async () => ({
        id: 'generation-1',
        status: 'completed' as const,
        boardId: board.id,
        board,
      })),
      requestFigureRegeneration,
      getFigureRegeneration,
      rerenderBoard,
    });
    renderPanel({ client });
    await advancePoll();

    fireEvent.click(screen.getByRole('button', { name: 'Replace figure' }));
    expect(screen.getByText(/This uses 1 Chalk/u)).toBeTruthy();
    expect(requestFigureRegeneration).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('What should improve?'), {
      target: { value: 'missing_part' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Use 1 Chalk' }));
      await Promise.resolve();
    });

    expect(requestFigureRegeneration).toHaveBeenCalledWith(
      board.id,
      'node-figure-private',
      expect.objectContaining({
        issue: 'missing_part',
        clientRequestId: expect.stringMatching(/^reader-/u),
      }),
    );
    expect(
      screen.getByRole('img', { name: 'A private hydrated raster.' }).getAttribute('src'),
    ).toBe('data:image/png;base64,AA==');
    expect(screen.getByText('Waiting to replace the figure')).toBeTruthy();

    await advancePoll();
    expect(getFigureRegeneration).toHaveBeenCalledWith('figure-regeneration-1', {
      signal: expect.any(AbortSignal),
    });
    expect(rerenderBoard).toHaveBeenCalledWith(
      board.id,
      { kind: 'process_flow', includeScaffold: true },
      { signal: expect.any(AbortSignal) },
    );
    expect(screen.getByRole('heading', { name: 'Board with replacement figure' })).toBeTruthy();
    expect(screen.getByText('1 Chalk charged exactly once.')).toBeTruthy();
  });

  it('keeps the old figure and confirms a refund on terminal replacement failure', async () => {
    vi.useFakeTimers();
    const board = createBoard({
      figures: [
        {
          id: 'figure-private',
          nodeId: 'node-figure-private',
          description: 'A private hydrated raster.',
          imageUrl: 'data:image/png;base64,AA==',
          provenance: 'anchored',
          labels: [],
        },
      ],
    });
    const getFigureRegeneration = vi.fn<LearningBoredClient['getFigureRegeneration']>();
    const client = createClient({
      getGeneration: vi.fn(async () => ({
        id: 'generation-1',
        status: 'completed' as const,
        boardId: board.id,
        board,
      })),
      requestFigureRegeneration: vi.fn(async (_boardId, nodeId, input) => ({
        id: 'figure-regeneration-failed',
        boardId: board.id,
        nodeId,
        clientRequestId: input.clientRequestId,
        issue: input.issue,
        status: 'failed' as const,
        chalkCost: 1,
        failureReason: 'The replacement did not pass figure validation.',
        refundConfirmed: true,
      })),
      getFigureRegeneration,
    });
    renderPanel({ client });
    await advancePoll();

    fireEvent.click(screen.getByRole('button', { name: 'Replace figure' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Use 1 Chalk' }));
      await Promise.resolve();
    });

    expect(getFigureRegeneration).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Your Chalk was refunded. The previous figure is unchanged./u),
    ).toBeTruthy();
    expect(
      screen.getByRole('img', { name: 'A private hydrated raster.' }).getAttribute('src'),
    ).toBe('data:image/png;base64,AA==');
  });

  it('confirms refund on failure, retries, cancels active work, and records comprehension', async () => {
    vi.useFakeTimers();
    const failedClient = createClient({
      getGeneration: vi.fn(async () => ({
        id: 'generation-1',
        status: 'failed' as const,
        failureReason: 'insufficient_grounding',
      })),
      retryGeneration: vi.fn(async () => ({
        id: 'generation-1',
        status: 'queued' as const,
      })),
    });
    renderPanel({ client: failedClient });
    await advancePoll();

    expect(screen.getByText('Your Chalk was refunded.')).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
      await Promise.resolve();
    });
    expect(failedClient.retryGeneration).toHaveBeenCalledWith('generation-1');
    expect(screen.getAllByText('Waiting to begin')).toHaveLength(2);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancel generation' }));
      await Promise.resolve();
    });
    expect(failedClient.cancelGeneration).toHaveBeenCalledWith('generation-1');
    expect(screen.getByText(/Nothing was saved/)).toBeTruthy();

    cleanup();
    const board = createBoard();
    const submitBoardComprehension = vi.fn(async (boardId: string) => ({
      boardId,
      passageId: 'passage-1',
      status: 'answered' as const,
      outcome: 'still_unclear' as const,
      feedbackId: 'feedback-1',
      respondedAt: '2026-08-03T12:00:00.000Z',
    }));
    const completedClient = createClient({
      getGeneration: vi.fn(async () => ({
        id: 'generation-1',
        status: 'completed' as const,
        boardId: board.id,
        board,
      })),
      submitBoardComprehension,
    });
    renderPanel({ client: completedClient });
    await advancePoll();
    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole('button', { name: 'I still don’t get it' }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(submitBoardComprehension).toHaveBeenCalledWith(
      'board-1',
      {
        outcome: 'still_unclear',
      },
      { signal: expect.any(AbortSignal) },
    );
    expect(screen.getByText(/Try a different Board kind/u)).toBeTruthy();
  });
});
