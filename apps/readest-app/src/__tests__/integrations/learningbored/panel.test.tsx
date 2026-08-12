import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (message: string) => message,
}));

import LearningBoredCapturePanel, {
  type LearningBoredCapturePanelProps,
} from '@/integrations/learningbored/LearningBoredCapturePanel';
import {
  LEARNINGBORED_BOARD_KINDS,
  type LearningBoredBoardKind,
  LearningBoredBoardResult,
  LearningBoredClient,
  LearningBoredGenerationSnapshot,
} from '@/integrations/learningbored/client';
import { LearningBoredPresentationThemeProvider } from '@/integrations/learningbored/presentation/context';
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
    titleSourceSpan: { sourceStart: 0, sourceEnd: 31 },
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

function createFigureProjection(figureId: string, imageUrl: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" data-figure-projection="${figureId}" focusable="false" viewBox="0 0 320 240" width="320" height="240"><g data-node-id="node-figure-private"><rect x="0" y="0" width="320" height="240"/><image data-figure-id="${figureId}" href="${imageUrl}" preserveAspectRatio="xMidYMid meet" x="10" y="10" width="300" height="180"/></g></svg>`;
}

function createClient(overrides: Partial<LearningBoredClient> = {}): LearningBoredClient {
  const board = createBoard();
  const queued: LearningBoredGenerationSnapshot = {
    id: 'generation-1',
    status: 'queued',
    boardId: null,
  };

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
  theme?: 'light' | 'dark' | 'eink';
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
  const rendered = render(
    <LearningBoredPresentationThemeProvider value={input?.theme ?? 'light'}>
      <LearningBoredCapturePanel {...props} />
    </LearningBoredPresentationThemeProvider>,
  );
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

async function flushProjectionEffects(): Promise<void> {
  await act(async () => {
    for (let pass = 0; pass < 8; pass += 1) await Promise.resolve();
  });
}

function waitForProjectionAbort(signal?: AbortSignal): Promise<LearningBoredBoardResult> {
  return new Promise((_resolve, reject) => {
    const rejectWithAbort = () => {
      const error = new Error('superseded');
      error.name = 'AbortError';
      reject(error);
    };
    if (signal?.aborted) rejectWithAbort();
    else signal?.addEventListener('abort', rejectWithAbort, { once: true });
  });
}

describe('LearningBored reader result panel', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
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

    expect(screen.getByRole('note', { name: 'AI-generated content notice' }).textContent).toContain(
      'AI-generated study aid. Check important details against the source.',
    );
    expect(screen.getAllByText('Waiting to begin')).toHaveLength(2);
    await advancePoll();
    expect(screen.getAllByText('Illustrating')).toHaveLength(2);
    await advancePoll();

    expect(screen.getByRole('heading', { name: board.title })).toBeTruthy();
    expect(screen.getByText('Core signal')).toBeTruthy();
    expect(
      screen.getByText('Three unbranded boxes connected by arrows.', { exact: false }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', {
        name: 'Replace figure: Three unbranded boxes connected by arrows.',
      }),
    ).toBeTruthy();
    expect(screen.queryByRole('img', { name: board.figures[0]!.description })).toBeNull();
    expect(screen.getByText('What order do the three fictional stages follow?')).toBeTruthy();
  });

  it.each([
    ['queued', 'Waiting to begin'],
    ['extracting', 'Reading the passage'],
    ['composing', 'Drawing the Board and writing questions'],
    ['illustrating', 'Illustrating'],
    ['rendering', 'Finishing the Board'],
  ] as const)(
    'shows the exact %s generation stage without fake progress',
    async (status, label) => {
      vi.useFakeTimers();
      renderPanel({
        client: createClient({
          getGeneration: vi.fn(async () => ({ id: 'generation-1', status, boardId: null })),
        }),
      });

      await advancePoll();
      expect(screen.getAllByText(label)).toHaveLength(2);
      expect(screen.queryByText(/\d+%/u)).toBeNull();
      expect(document.querySelector('.animate-spin')).toBeNull();
    },
  );

  it('keeps polling after a transient status error and recovers without overlapping requests', async () => {
    vi.useFakeTimers();
    let activeRequests = 0;
    let maximumActiveRequests = 0;
    const getGeneration = vi
      .fn<LearningBoredClient['getGeneration']>()
      .mockImplementationOnce(async () => {
        activeRequests += 1;
        maximumActiveRequests = Math.max(maximumActiveRequests, activeRequests);
        activeRequests -= 1;
        throw new Error('temporary');
      })
      .mockImplementationOnce(async () => {
        activeRequests += 1;
        maximumActiveRequests = Math.max(maximumActiveRequests, activeRequests);
        activeRequests -= 1;
        return { id: 'generation-1', status: 'composing', boardId: null };
      });
    renderPanel({ client: createClient({ getGeneration }) });

    await advancePoll();
    expect(
      screen.getByText('The latest status could not be loaded. LearningBored will keep trying.'),
    ).toBeTruthy();
    await advancePoll();
    expect(screen.getAllByText('Drawing the Board and writing questions')).toHaveLength(2);
    expect(maximumActiveRequests).toBe(1);
  });

  it('discloses only a non-zero truthful dropped-claim count', async () => {
    vi.useFakeTimers();
    const board = createBoard();
    renderPanel({
      client: createClient({
        getGeneration: vi.fn(async () => ({
          id: 'generation-1',
          status: 'completed' as const,
          boardId: board.id,
          board,
          droppedClaimCount: 2,
        })),
      }),
    });
    await advancePoll();

    expect(
      screen.getByText('Two claims were dropped because the passage did not support them.'),
    ).toBeTruthy();
  });

  it('rerenders only a completed Board when the presentation theme changes', async () => {
    vi.useFakeTimers();
    const board = createBoard();
    const rerenderBoard = vi.fn(async () => board);
    const createGeneration = vi.fn();
    const requestFigureRegeneration = vi.fn();
    const client = createClient({
      createGeneration,
      requestFigureRegeneration,
      rerenderBoard,
      getGeneration: vi.fn(async () => ({
        id: 'generation-1',
        status: 'completed' as const,
        boardId: board.id,
        board,
      })),
    });
    const rendered = renderPanel({ client, theme: 'light' });
    await advancePoll();

    rendered.rerender(
      <LearningBoredPresentationThemeProvider value='dark'>
        <LearningBoredCapturePanel {...rendered.props} />
      </LearningBoredPresentationThemeProvider>,
    );
    await act(async () => {
      await Promise.resolve();
    });

    expect(rerenderBoard).toHaveBeenCalledTimes(1);
    expect(rerenderBoard).toHaveBeenCalledWith(
      board.id,
      { kind: board.kind, includeScaffold: true },
      { signal: expect.any(AbortSignal) },
    );
    expect(createGeneration).not.toHaveBeenCalled();
    expect(requestFigureRegeneration).not.toHaveBeenCalled();
  });

  it('does not surface an error when a superseded theme rerender is aborted', async () => {
    vi.useFakeTimers();
    const board = createBoard();
    const rerenderBoard = vi.fn<LearningBoredClient['rerenderBoard']>(
      (_boardId, _input, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener(
            'abort',
            () => {
              const error = new Error('aborted');
              error.name = 'AbortError';
              reject(error);
            },
            { once: true },
          );
        }),
    );
    const rendered = renderPanel({
      theme: 'light',
      client: createClient({
        rerenderBoard,
        getGeneration: vi.fn(async () => ({
          id: 'generation-1',
          status: 'completed' as const,
          boardId: board.id,
          board,
        })),
      }),
    });
    await advancePoll();
    rendered.rerender(
      <LearningBoredPresentationThemeProvider value='dark'>
        <LearningBoredCapturePanel {...rendered.props} />
      </LearningBoredPresentationThemeProvider>,
    );
    await act(async () => {
      await Promise.resolve();
    });
    rendered.rerender(
      <LearningBoredPresentationThemeProvider value='eink'>
        <LearningBoredCapturePanel {...rendered.props} />
      </LearningBoredPresentationThemeProvider>,
    );
    await act(async () => {
      await Promise.resolve();
    });

    expect(rerenderBoard).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('The Board theme could not be refreshed yet.')).toBeNull();
  });

  it('retries one transient theme refresh and commits the recovered projection', async () => {
    vi.useFakeTimers();
    const board = createBoard();
    const refreshedBoard = createBoard({ title: 'Dark theme Board' });
    const rerenderBoard = vi
      .fn<LearningBoredClient['rerenderBoard']>()
      .mockRejectedValueOnce(new Error('temporary render failure'))
      .mockResolvedValueOnce(refreshedBoard);
    const rendered = renderPanel({
      theme: 'light',
      client: createClient({
        rerenderBoard,
        getGeneration: vi.fn(async () => ({
          id: 'generation-1',
          status: 'completed' as const,
          boardId: board.id,
          board,
        })),
      }),
    });
    await advancePoll();

    rendered.rerender(
      <LearningBoredPresentationThemeProvider value='dark'>
        <LearningBoredCapturePanel {...rendered.props} />
      </LearningBoredPresentationThemeProvider>,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(rerenderBoard).toHaveBeenCalledTimes(1);
    expect(screen.getByText('The Board theme could not be refreshed yet.')).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(rerenderBoard).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('heading', { name: 'Dark theme Board' })).toBeTruthy();
    expect(screen.queryByText('The Board theme could not be refreshed yet.')).toBeNull();
  });

  it('does not let a stale theme response overwrite a newer Board kind', async () => {
    vi.useFakeTimers();
    const board = createBoard();
    const timelineBoard = createBoard({ kind: 'timeline', title: 'Newest timeline Board' });
    let resolveTheme: ((value: LearningBoredBoardResult) => void) | undefined;
    const staleThemeResponse = new Promise<LearningBoredBoardResult>((resolve) => {
      resolveTheme = resolve;
    });
    const rerenderBoard = vi.fn<LearningBoredClient['rerenderBoard']>(async (_boardId, input) =>
      input.kind === 'timeline' ? timelineBoard : await staleThemeResponse,
    );
    const rendered = renderPanel({
      theme: 'light',
      client: createClient({
        rerenderBoard,
        getGeneration: vi.fn(async () => ({
          id: 'generation-1',
          status: 'completed' as const,
          boardId: board.id,
          board,
        })),
      }),
    });
    await advancePoll();

    rendered.rerender(
      <LearningBoredPresentationThemeProvider value='dark'>
        <LearningBoredCapturePanel {...rendered.props} />
      </LearningBoredPresentationThemeProvider>,
    );
    await act(async () => {
      await Promise.resolve();
    });
    const staleSignal = rerenderBoard.mock.calls[0]?.[2]?.signal;
    fireEvent.change(screen.getByLabelText('Board shape'), { target: { value: 'timeline' } });
    await act(async () => {
      await Promise.resolve();
    });
    expect(staleSignal?.aborted).toBe(true);
    expect(screen.getByRole('heading', { name: 'Newest timeline Board' })).toBeTruthy();

    resolveTheme?.(createBoard({ title: 'Stale themed Board' }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByRole('heading', { name: 'Newest timeline Board' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Stale themed Board' })).toBeNull();
  });

  it('unlocks the Board shape control when a theme supersedes its redraw', async () => {
    vi.useFakeTimers();
    const board = createBoard();
    const themedBoard = createBoard({ kind: 'concept_map', title: 'Dark concept map' });
    let rejectKind: ((reason?: unknown) => void) | undefined;
    const kindRedraw = new Promise<LearningBoredBoardResult>((_resolve, reject) => {
      rejectKind = reject;
    });
    const rerenderBoard = vi
      .fn<LearningBoredClient['rerenderBoard']>()
      .mockImplementationOnce(async (_boardId, _input, options) => {
        options?.signal?.addEventListener(
          'abort',
          () => {
            const error = new Error('superseded');
            error.name = 'AbortError';
            rejectKind?.(error);
          },
          { once: true },
        );
        return await kindRedraw;
      })
      .mockResolvedValueOnce(themedBoard);
    const client = createClient({
      rerenderBoard,
      getGeneration: vi.fn(async () => ({
        id: 'generation-1',
        status: 'completed' as const,
        boardId: board.id,
        board,
      })),
    });
    const rendered = renderPanel({ client, theme: 'light' });
    await advancePoll();

    const kindSelect = screen.getByLabelText('Board shape') as HTMLSelectElement;
    fireEvent.change(kindSelect, { target: { value: 'concept_map' } });
    expect(kindSelect.disabled).toBe(true);

    rendered.rerender(
      <LearningBoredPresentationThemeProvider value='dark'>
        <LearningBoredCapturePanel {...rendered.props} />
      </LearningBoredPresentationThemeProvider>,
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByRole('heading', { name: themedBoard.title })).toBeTruthy();
    expect((screen.getByLabelText('Board shape') as HTMLSelectElement).disabled).toBe(false);
    expect(screen.queryByText('Changing the Board shape…')).toBeNull();
  });

  it('restores the committed kind and recovers the current theme after a superseding kind redraw fails', async () => {
    vi.useFakeTimers();
    const board = createBoard();
    const recoveredThemeBoard = createBoard({ title: 'Recovered dark process Board' });
    const rerenderBoard = vi
      .fn<LearningBoredClient['rerenderBoard']>()
      .mockImplementationOnce(
        async (_boardId, _input, options) => await waitForProjectionAbort(options?.signal),
      )
      .mockRejectedValueOnce(new Error('kind redraw failed'))
      .mockResolvedValueOnce(recoveredThemeBoard);
    const onSessionPatch = vi.fn<LearningBoredCapturePanelProps['onSessionPatch']>();
    const rendered = renderPanel({
      theme: 'light',
      onSessionPatch,
      client: createClient({
        rerenderBoard,
        getGeneration: vi.fn(async () => ({
          id: 'generation-1',
          status: 'completed' as const,
          boardId: board.id,
          board,
        })),
      }),
    });
    await advancePoll();

    rendered.rerender(
      <LearningBoredPresentationThemeProvider value='dark'>
        <LearningBoredCapturePanel {...rendered.props} />
      </LearningBoredPresentationThemeProvider>,
    );
    await flushProjectionEffects();
    fireEvent.change(screen.getByLabelText('Board shape'), { target: { value: 'timeline' } });
    await flushProjectionEffects();

    expect(rerenderBoard).toHaveBeenCalledTimes(3);
    expect(rerenderBoard.mock.calls[2]?.[1]).toEqual({
      kind: board.kind,
      includeScaffold: true,
    });
    expect(onSessionPatch).toHaveBeenCalledWith({ kind: 'timeline' });
    expect(onSessionPatch).toHaveBeenCalledWith({ kind: board.kind });
    expect(onSessionPatch.mock.calls.at(-1)?.[0]).toEqual({
      boardId: recoveredThemeBoard.id,
      kind: board.kind,
    });
    expect(screen.getByRole('heading', { name: recoveredThemeBoard.title })).toBeTruthy();
    const restoredKindSelect = screen.getByLabelText('Board shape') as HTMLSelectElement;
    expect(restoredKindSelect.disabled).toBe(false);
    expect(restoredKindSelect.value).toBe(board.kind);
  });

  it('clears a failed theme alert when the presentation returns to the already-rendered theme', async () => {
    vi.useFakeTimers();
    const board = createBoard();
    const rerenderBoard = vi.fn<LearningBoredClient['rerenderBoard']>(async () => {
      throw new Error('dark render failed');
    });
    const rendered = renderPanel({
      theme: 'light',
      client: createClient({
        rerenderBoard,
        getGeneration: vi.fn(async () => ({
          id: 'generation-1',
          status: 'completed' as const,
          boardId: board.id,
          board,
        })),
      }),
    });
    await advancePoll();

    rendered.rerender(
      <LearningBoredPresentationThemeProvider value='dark'>
        <LearningBoredCapturePanel {...rendered.props} />
      </LearningBoredPresentationThemeProvider>,
    );
    await flushProjectionEffects();
    expect(screen.getByText('The Board theme could not be refreshed yet.')).toBeTruthy();

    rendered.rerender(
      <LearningBoredPresentationThemeProvider value='light'>
        <LearningBoredCapturePanel {...rendered.props} />
      </LearningBoredPresentationThemeProvider>,
    );
    await flushProjectionEffects();

    expect(rerenderBoard).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('The Board theme could not be refreshed yet.')).toBeNull();
    expect(screen.getByRole('heading', { name: board.title })).toBeTruthy();
  });

  it('filters Added help immediately without a request and keeps it hidden across kind changes', async () => {
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
    renderPanel({
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
    expect(rerenderBoard).not.toHaveBeenCalled();
    expect(onSessionPatch).toHaveBeenCalledWith({ showScaffold: false });
    expect(screen.queryByText('Helpful bridge')).toBeNull();
    expect(screen.queryByText('Updating the Board view…')).toBeNull();

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Board shape'), { target: { value: 'timeline' } });
      await Promise.resolve();
    });
    expect(rerenderBoard).toHaveBeenCalledTimes(1);
    expect(rerenderBoard).toHaveBeenCalledWith(
      board.id,
      {
        kind: 'timeline',
        includeScaffold: true,
      },
      { signal: expect.any(AbortSignal) },
    );
    expect(onSessionPatch).toHaveBeenCalledWith({ kind: 'timeline' });
    expect(screen.getByRole('heading', { name: 'Signal timeline' })).toBeTruthy();
    expect(screen.queryByText('Helpful bridge')).toBeNull();
    expect(screen.getByText('Changing Board shape is free.')).toBeTruthy();
    expect(screen.getByText('No Chalk is charged.')).toBeTruthy();
    expect(screen.queryByText('Free and instant.')).toBeNull();
  });

  it('offers every Board kind as a free local rerender without starting another generation', async () => {
    vi.useFakeTimers();
    const board = createBoard();
    const rerenderBoard = vi.fn(async (_boardId: string, input: { kind: LearningBoredBoardKind }) =>
      createBoard({ kind: input.kind }),
    );
    const createGeneration = vi.fn();
    renderPanel({
      client: createClient({
        createGeneration,
        rerenderBoard,
        getGeneration: vi.fn(async () => ({
          id: 'generation-1',
          status: 'completed' as const,
          boardId: board.id,
          board,
        })),
      }),
    });
    await advancePoll();

    const select = screen.getByLabelText('Board shape') as HTMLSelectElement;
    expect(Array.from(select.options, (option) => option.value)).toEqual([
      ...LEARNINGBORED_BOARD_KINDS,
    ]);
    for (const kind of LEARNINGBORED_BOARD_KINDS.filter((kind) => kind !== board.kind)) {
      await act(async () => {
        fireEvent.change(select, { target: { value: kind } });
        await Promise.resolve();
      });
    }
    expect(rerenderBoard).toHaveBeenCalledTimes(LEARNINGBORED_BOARD_KINDS.length - 1);
    expect(createGeneration).not.toHaveBeenCalled();
  });

  it('restores Added help from the retained Board while offline', async () => {
    vi.useFakeTimers();
    const board = createBoard();
    const rerenderBoard = vi.fn(async () => {
      throw new Error('offline');
    });
    renderPanel({
      session: createSession({ showScaffold: false }),
      client: createClient({
        rerenderBoard,
        getGeneration: vi.fn(async () => ({
          id: 'generation-1',
          status: 'completed' as const,
          boardId: board.id,
          board,
        })),
      }),
    });
    await advancePoll();

    expect(screen.queryByText('Helpful bridge')).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Added help' }));
    expect(screen.getByText('Helpful bridge')).toBeTruthy();
    expect(rerenderBoard).not.toHaveBeenCalled();
  });

  it('never exposes the canonical desktop SVG when its scaffold-free projection is absent', async () => {
    vi.useFakeTimers();
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query) =>
        ({
          matches: query === '(min-width: 640px)',
          media: query,
          onchange: null,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          addListener: vi.fn(),
          removeListener: vi.fn(),
          dispatchEvent: vi.fn(() => false),
        }) as MediaQueryList,
    );
    const board = createBoard({
      svg: '<svg xmlns="http://www.w3.org/2000/svg" data-canonical-with-scaffold="true"></svg>',
      svgWithoutScaffold: null,
    });
    const rendered = renderPanel({
      session: createSession({ showScaffold: false }),
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

    expect(rendered.container.querySelector('[data-canonical-with-scaffold="true"]')).toBeNull();
    expect(screen.queryByText('Helpful bridge')).toBeNull();
  });

  it('uses the canonical mobile Figure projection and exposes its text once through the outline', async () => {
    vi.useFakeTimers();
    const projectionSvg = `<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" data-figure-projection="figure-private" focusable="false" viewBox="12 24 320 240" width="320" height="240"><g data-node-id="node-figure-private"><rect x="12" y="24" width="320" height="240"/><image data-figure-id="figure-private" href="data:image/png;base64,AA==" preserveAspectRatio="xMidYMid meet" x="20" y="40" width="300" height="160"/><text>A quiet canonical caption.</text><g data-callout-index="1"><circle cx="120" cy="100" r="10"/></g><g data-legend-for="label-rotor"><text>1 Rotor — the moving part.</text></g></g></svg>`;
    const board = createBoard({
      outline: [
        {
          id: 'node-figure-private',
          kind: 'figure',
          label: 'Rotor arrangement',
          description: 'A private hydrated raster.',
          provenance: 'anchored',
          sourceSpan: { sourceStart: 17, sourceEnd: 31 },
          caption: 'A quiet canonical caption.',
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
      ],
      figures: [
        {
          id: 'figure-private',
          nodeId: 'node-figure-private',
          description: 'A private hydrated raster.',
          caption: 'A quiet canonical caption.',
          imageUrl: 'data:image/png;base64,AA==',
          provenance: 'anchored',
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
          projectionSvg,
        },
      ],
    });
    const rendered = renderPanel({
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

    const projection = rendered.container.querySelector(
      '[data-figure-projection="figure-private"]',
    );
    expect(projection?.getAttribute('viewBox')).toBe('12 24 320 240');
    expect(projection?.querySelector('[data-callout-index="1"]')).toBeTruthy();
    expect(projection?.querySelector('[data-legend-for="label-rotor"]')).toBeTruthy();
    expect(projection?.getAttribute('aria-hidden')).toBe('true');
    expect(
      projection?.querySelector('[tabindex], [role], [aria-label], [aria-labelledby]'),
    ).toBeNull();
    expect(screen.queryByRole('img', { name: 'A private hydrated raster.' })).toBeNull();
    expect(screen.getAllByRole('button', { name: /1\. Rotor.*The moving part/ })).toHaveLength(1);
    expect(
      screen.getAllByRole('button', { name: /Figure caption: A quiet canonical caption\./ }),
    ).toHaveLength(1);

    const title = screen.getByRole('button', { name: board.title });
    fireEvent.focus(title);
    expect(rendered.onSourceSpanEnter).toHaveBeenCalledWith(board.titleSourceSpan);
  });

  it('gives every mobile Figure pan region a unique contextual name', async () => {
    vi.useFakeTimers();
    const firstFigure = createBoard().figures[0]!;
    const board = createBoard({
      figures: [
        {
          ...firstFigure,
          projectionSvg: createFigureProjection(firstFigure.id, 'data:image/png;base64,AA=='),
        },
        {
          ...firstFigure,
          id: 'figure-2',
          nodeId: 'node-figure-2',
          description: 'A second fictional chamber arrangement.',
          projectionSvg: createFigureProjection('figure-2', 'data:image/png;base64,AQ=='),
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

    const regions = screen.getAllByRole('region', { name: /scroll to explore/u });
    expect(regions.map((region) => region.getAttribute('aria-label'))).toEqual([
      'Figure 1 — scroll to explore: Three unbranded boxes connected by arrows.',
      'Figure 2 — scroll to explore: A second fictional chamber arrangement.',
    ]);
    expect(regions.every((region) => region.getAttribute('tabindex') === '0')).toBe(true);
  });

  it('keeps Figure replacement operable without duplicating the canonical desktop Board', async () => {
    vi.useFakeTimers();
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query) =>
        ({
          matches: query === '(min-width: 640px)',
          media: query,
          onchange: null,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          addListener: vi.fn(),
          removeListener: vi.fn(),
          dispatchEvent: vi.fn(() => false),
        }) as MediaQueryList,
    );
    const firstFigure = createBoard().figures[0]!;
    const board = createBoard({
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 240"><g data-figure-id="figure-1"><image href="data:image/png;base64,AA=="/></g></svg>',
      figures: [
        firstFigure,
        {
          ...firstFigure,
          id: 'figure-2',
          nodeId: 'node-figure-2',
          description: 'Two fictional chambers separated by a narrow bridge.',
        },
      ],
    });
    const rendered = renderPanel({
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

    await act(async () => {
      await Promise.resolve();
    });
    expect(rendered.container.querySelector('.learningbored-svg')).toBeTruthy();
    expect(rendered.container.querySelector('.learningbored-figure-projection')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Figures' })).toBeNull();
    expect(
      screen.getByRole('button', {
        name: 'Replace figure 1: Three unbranded boxes connected by arrows.',
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', {
        name: 'Replace figure 2: Two fictional chambers separated by a narrow bridge.',
      }),
    ).toBeTruthy();
    expect(screen.getByText('Replace figure 1')).toBeTruthy();
    expect(screen.getByText('Replace figure 2')).toBeTruthy();

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Replace figure 1: Three unbranded boxes connected by arrows.',
      }),
    );
    expect(screen.getByRole('heading', { name: 'Replace this figure?' })).toBeTruthy();
    expect(screen.getByText(/This uses 1 Chalk/u)).toBeTruthy();
  });

  it('keeps disclosures in study order and moves focus to newly revealed controls', async () => {
    vi.useFakeTimers();
    const board = createBoard({
      outline: Array.from({ length: 12 }, (_, index) => ({
        id: `node-long-${index}`,
        kind: 'content' as const,
        label: `Long outline item ${index + 1}`,
        description: 'A generic grounded explanation item.',
        provenance: 'anchored' as const,
        sourceSpan: { sourceStart: 0, sourceEnd: 8 },
      })),
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

    fireEvent.click(screen.getByRole('button', { name: /Replace figure/u }));
    await act(async () => {
      await Promise.resolve();
    });
    const replacementHeading = screen.getByRole('heading', { name: 'Replace this figure?' });
    const recallHeading = screen.getByRole('heading', { name: 'Recall preview' });
    const comprehensionHeading = screen.getByRole('heading', {
      name: 'Did this Board make the passage click?',
    });
    const reportButton = screen.getByRole('button', { name: 'Report' });
    expect(document.activeElement).toBe(replacementHeading);
    expect(
      replacementHeading.compareDocumentPosition(recallHeading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      recallHeading.compareDocumentPosition(comprehensionHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      comprehensionHeading.compareDocumentPosition(reportButton) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(reportButton.getAttribute('aria-expanded')).toBe('false');
    expect(reportButton.getAttribute('aria-controls')).toBe('learningbored-report-form');

    fireEvent.click(reportButton);
    await act(async () => {
      await Promise.resolve();
    });
    const reportCategory = screen.getByLabelText('What needs attention?');
    const reportForm = document.getElementById('learningbored-report-form');
    expect(reportButton.getAttribute('aria-expanded')).toBe('true');
    expect(reportForm).toBeTruthy();
    expect(document.activeElement).toBe(reportCategory);
    expect(
      reportButton.compareDocumentPosition(reportForm!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('returns focus to the originating Figure action after dismiss and terminal confirmation', async () => {
    vi.useFakeTimers();
    const board = createBoard();
    const client = createClient({
      getGeneration: vi.fn(async () => ({
        id: 'generation-1',
        status: 'completed' as const,
        boardId: board.id,
        board,
      })),
      requestFigureRegeneration: vi.fn(async (_boardId, nodeId, input) => ({
        id: 'figure-regeneration-focus',
        boardId: board.id,
        nodeId,
        clientRequestId: input.clientRequestId,
        issue: input.issue,
        status: 'completed' as const,
        chalkCost: 1,
        failureReason: null,
        refundConfirmed: false,
      })),
      rerenderBoard: vi.fn(async () => board),
    });
    renderPanel({ client });
    await advancePoll();

    const replaceButton = screen.getByRole('button', { name: /Replace figure/u });
    replaceButton.focus();
    fireEvent.click(replaceButton);
    expect(document.activeElement).toBe(
      screen.getByRole('heading', { name: 'Replace this figure?' }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Keep current figure' }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(document.activeElement).toBe(replaceButton);

    fireEvent.click(replaceButton);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Use 1 Chalk' }));
      await Promise.resolve();
    });
    expect(screen.getByRole('heading', { name: 'Replacement figure ready' })).toBeTruthy();
    expect(document.activeElement).toBe(replaceButton);
  });

  it('keeps feedback single-flight while a theme projection commits', async () => {
    vi.useFakeTimers();
    const board = createBoard();
    const themedBoard = createBoard({ title: 'Dark Board during feedback' });
    let resolveFeedback: (() => void) | undefined;
    const feedbackRequest = new Promise<void>((resolve) => {
      resolveFeedback = resolve;
    });
    const submitFeedback = vi.fn(async () => await feedbackRequest);
    const client = createClient({
      submitFeedback,
      rerenderBoard: vi.fn(async () => themedBoard),
      getGeneration: vi.fn(async () => ({
        id: 'generation-1',
        status: 'completed' as const,
        boardId: board.id,
        board,
      })),
    });
    const rendered = renderPanel({ client, theme: 'light' });
    await advancePoll();

    fireEvent.click(screen.getByRole('button', { name: 'Report' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send report' }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(submitFeedback).toHaveBeenCalledTimes(1);
    expect(
      (screen.getByRole('button', { name: 'Send report' }) as HTMLButtonElement).disabled,
    ).toBe(true);

    rendered.rerender(
      <LearningBoredPresentationThemeProvider value='dark'>
        <LearningBoredCapturePanel {...rendered.props} />
      </LearningBoredPresentationThemeProvider>,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByRole('heading', { name: themedBoard.title })).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Send report' }) as HTMLButtonElement).disabled,
    ).toBe(true);

    fireEvent.submit(document.getElementById('learningbored-report-form')!);
    expect(submitFeedback).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFeedback?.();
      await feedbackRequest;
    });
    expect(screen.getByText('Thanks — your feedback was recorded.')).toBeTruthy();
  });

  it('keeps the kind control locked when feedback resolves during its redraw', async () => {
    vi.useFakeTimers();
    const board = createBoard();
    const redrawnBoard = createBoard({ kind: 'concept_map', title: 'Concept map redraw' });
    let resolveRedraw: ((value: LearningBoredBoardResult) => void) | undefined;
    const redraw = new Promise<LearningBoredBoardResult>((resolve) => {
      resolveRedraw = resolve;
    });
    const client = createClient({
      submitFeedback: vi.fn(async () => undefined),
      rerenderBoard: vi.fn(async () => await redraw),
      getGeneration: vi.fn(async () => ({
        id: 'generation-1',
        status: 'completed' as const,
        boardId: board.id,
        board,
      })),
    });
    renderPanel({ client });
    await advancePoll();

    fireEvent.click(screen.getByRole('button', { name: 'Report' }));
    const kindSelect = screen.getByLabelText('Board shape');
    fireEvent.change(kindSelect, { target: { value: 'concept_map' } });
    expect((kindSelect as HTMLSelectElement).disabled).toBe(true);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send report' }));
      await Promise.resolve();
    });
    expect(screen.getByText('Thanks — your feedback was recorded.')).toBeTruthy();
    expect((kindSelect as HTMLSelectElement).disabled).toBe(true);

    await act(async () => {
      resolveRedraw?.(redrawnBoard);
      await redraw;
    });
    expect(screen.getByRole('heading', { name: redrawnBoard.title })).toBeTruthy();
    expect((screen.getByLabelText('Board shape') as HTMLSelectElement).disabled).toBe(false);
  });

  it('preserves a feedback failure when a later theme projection succeeds', async () => {
    vi.useFakeTimers();
    const board = createBoard();
    const themedBoard = createBoard({ title: 'Dark Board after feedback failure' });
    const rendered = renderPanel({
      theme: 'light',
      client: createClient({
        submitFeedback: vi.fn(async () => {
          throw new Error('feedback unavailable');
        }),
        rerenderBoard: vi.fn(async () => themedBoard),
        getGeneration: vi.fn(async () => ({
          id: 'generation-1',
          status: 'completed' as const,
          boardId: board.id,
          board,
        })),
      }),
    });
    await advancePoll();

    fireEvent.click(screen.getByRole('button', { name: 'Report' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send report' }));
    await flushProjectionEffects();
    expect(screen.getByText('Your feedback could not be sent. Please try again.')).toBeTruthy();

    rendered.rerender(
      <LearningBoredPresentationThemeProvider value='dark'>
        <LearningBoredCapturePanel {...rendered.props} />
      </LearningBoredPresentationThemeProvider>,
    );
    await flushProjectionEffects();

    expect(screen.getByRole('heading', { name: themedBoard.title })).toBeTruthy();
    expect(screen.getByText('Your feedback could not be sent. Please try again.')).toBeTruthy();
  });

  it('preserves a projection failure when feedback later succeeds', async () => {
    vi.useFakeTimers();
    const board = createBoard();
    const rendered = renderPanel({
      theme: 'light',
      client: createClient({
        submitFeedback: vi.fn(async () => undefined),
        rerenderBoard: vi.fn(async () => {
          throw new Error('theme render unavailable');
        }),
        getGeneration: vi.fn(async () => ({
          id: 'generation-1',
          status: 'completed' as const,
          boardId: board.id,
          board,
        })),
      }),
    });
    await advancePoll();

    rendered.rerender(
      <LearningBoredPresentationThemeProvider value='dark'>
        <LearningBoredCapturePanel {...rendered.props} />
      </LearningBoredPresentationThemeProvider>,
    );
    await flushProjectionEffects();
    expect(screen.getByText('The Board theme could not be refreshed yet.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Report' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send report' }));
    await flushProjectionEffects();

    expect(screen.getByText('Thanks — your feedback was recorded.')).toBeTruthy();
    expect(screen.getByText('The Board theme could not be refreshed yet.')).toBeTruthy();
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
          projectionSvg: createFigureProjection('figure-private', 'data:image/png;base64,AA=='),
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
          projectionSvg: createFigureProjection('figure-private', 'data:image/png;base64,AQ=='),
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
    const rendered = renderPanel({ client });
    await advancePoll();

    fireEvent.click(screen.getByRole('button', { name: /Replace figure/u }));
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
      rendered.container
        .querySelector('[data-figure-projection="figure-private"] image')
        ?.getAttribute('href'),
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

  it('keeps completed Figure hydration alive when the terminal status stops its poller', async () => {
    vi.useFakeTimers();
    const board = createBoard();
    const refreshed = createBoard({ title: 'Board hydrated after the poll stopped' });
    let resolveProjection: ((value: LearningBoredBoardResult) => void) | undefined;
    const projection = new Promise<LearningBoredBoardResult>((resolve) => {
      resolveProjection = resolve;
    });
    let statusSignal: AbortSignal | undefined;
    let projectionSignal: AbortSignal | undefined;
    const getFigureRegeneration = vi.fn<LearningBoredClient['getFigureRegeneration']>(
      async (_regenerationId, options) => {
        statusSignal = options?.signal;
        return {
          id: 'figure-regeneration-terminal',
          boardId: board.id,
          nodeId: 'node-figure-1',
          clientRequestId: 'reader-request-terminal',
          issue: 'unclear',
          status: 'completed',
          chalkCost: 1,
          failureReason: null,
          refundConfirmed: false,
        };
      },
    );
    const rerenderBoard = vi.fn<LearningBoredClient['rerenderBoard']>(
      async (_boardId, _input, options) => {
        projectionSignal = options?.signal;
        return await projection;
      },
    );
    const client = createClient({
      getGeneration: vi.fn(async () => ({
        id: 'generation-1',
        status: 'completed' as const,
        boardId: board.id,
        board,
      })),
      requestFigureRegeneration: vi.fn(async (_boardId, nodeId, input) => ({
        id: 'figure-regeneration-terminal',
        boardId: board.id,
        nodeId,
        clientRequestId: input.clientRequestId,
        issue: input.issue,
        status: 'queued' as const,
        chalkCost: 1,
        failureReason: null,
        refundConfirmed: false,
      })),
      getFigureRegeneration,
      rerenderBoard,
    });
    renderPanel({ client });
    await advancePoll();

    fireEvent.click(screen.getByRole('button', { name: /Replace figure/u }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Use 1 Chalk' }));
      await Promise.resolve();
    });

    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(rerenderBoard).toHaveBeenCalledTimes(1);
    expect(statusSignal?.aborted).toBe(true);
    expect(projectionSignal?.aborted).toBe(false);

    await act(async () => {
      resolveProjection?.(refreshed);
      await Promise.resolve();
    });
    expect(
      screen.getByRole('heading', { name: 'Board hydrated after the poll stopped' }),
    ).toBeTruthy();
  });

  it('reports a completed Figure request truthfully when immediate Board hydration fails', async () => {
    vi.useFakeTimers();
    const board = createBoard();
    const client = createClient({
      getGeneration: vi.fn(async () => ({
        id: 'generation-1',
        status: 'completed' as const,
        boardId: board.id,
        board,
      })),
      requestFigureRegeneration: vi.fn(async (_boardId, nodeId, input) => ({
        id: 'figure-regeneration-immediate',
        boardId: board.id,
        nodeId,
        clientRequestId: input.clientRequestId,
        issue: input.issue,
        status: 'completed' as const,
        chalkCost: 1,
        failureReason: null,
        refundConfirmed: false,
      })),
      rerenderBoard: vi.fn(async () => {
        throw new Error('temporary hydration failure');
      }),
    });
    renderPanel({ client });
    await advancePoll();

    fireEvent.click(screen.getByRole('button', { name: /Replace figure/u }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Use 1 Chalk' }));
      await Promise.resolve();
    });

    expect(screen.getByRole('heading', { name: 'Replacement figure ready' })).toBeTruthy();
    expect(screen.getByText('1 Chalk charged exactly once.')).toBeTruthy();
    expect(
      screen.getByText('The new figure is ready, but the Board could not be refreshed yet.'),
    ).toBeTruthy();
    expect(
      screen.queryByText(
        'The figure replacement could not be started. No new request will be made if you retry.',
      ),
    ).toBeNull();
  });

  it('recovers the current theme after a Figure hydration supersedes it and fails', async () => {
    vi.useFakeTimers();
    const board = createBoard();
    const recoveredBoard = createBoard({ title: 'Dark Board after Figure recovery' });
    let resolveRecovery: ((value: LearningBoredBoardResult) => void) | undefined;
    const recovery = new Promise<LearningBoredBoardResult>((resolve) => {
      resolveRecovery = resolve;
    });
    const rerenderBoard = vi
      .fn<LearningBoredClient['rerenderBoard']>()
      .mockImplementationOnce(
        async (_boardId, _input, options) => await waitForProjectionAbort(options?.signal),
      )
      .mockRejectedValueOnce(new Error('Figure hydration failed'))
      .mockImplementationOnce(async () => await recovery);
    const client = createClient({
      rerenderBoard,
      getGeneration: vi.fn(async () => ({
        id: 'generation-1',
        status: 'completed' as const,
        boardId: board.id,
        board,
      })),
      requestFigureRegeneration: vi.fn(async (_boardId, nodeId, input) => ({
        id: 'figure-regeneration-theme-recovery',
        boardId: board.id,
        nodeId,
        clientRequestId: input.clientRequestId,
        issue: input.issue,
        status: 'completed' as const,
        chalkCost: 1,
        failureReason: null,
        refundConfirmed: false,
      })),
    });
    const rendered = renderPanel({ client, theme: 'light' });
    await advancePoll();

    rendered.rerender(
      <LearningBoredPresentationThemeProvider value='dark'>
        <LearningBoredCapturePanel {...rendered.props} />
      </LearningBoredPresentationThemeProvider>,
    );
    await flushProjectionEffects();
    fireEvent.click(screen.getByRole('button', { name: /Replace figure/u }));
    fireEvent.click(screen.getByRole('button', { name: 'Use 1 Chalk' }));
    await flushProjectionEffects();

    expect(rerenderBoard).toHaveBeenCalledTimes(3);
    expect(
      screen.getByText('The new figure is ready, but the Board could not be refreshed yet.'),
    ).toBeTruthy();

    await act(async () => {
      resolveRecovery?.(recoveredBoard);
      await recovery;
    });

    expect(screen.getByRole('heading', { name: recoveredBoard.title })).toBeTruthy();
    expect(
      screen.queryByText('The new figure is ready, but the Board could not be refreshed yet.'),
    ).toBeNull();
  });

  it('records the theme rendered by a successful Figure hydration before a later theme toggle', async () => {
    vi.useFakeTimers();
    const board = createBoard();
    const darkFigureBoard = createBoard({ title: 'Dark Board with the new Figure' });
    const restoredLightBoard = createBoard({ title: 'Restored light Board' });
    const rerenderBoard = vi
      .fn<LearningBoredClient['rerenderBoard']>()
      .mockImplementationOnce(
        async (_boardId, _input, options) => await waitForProjectionAbort(options?.signal),
      )
      .mockResolvedValueOnce(darkFigureBoard)
      .mockResolvedValueOnce(restoredLightBoard);
    const client = createClient({
      rerenderBoard,
      getGeneration: vi.fn(async () => ({
        id: 'generation-1',
        status: 'completed' as const,
        boardId: board.id,
        board,
      })),
      requestFigureRegeneration: vi.fn(async (_boardId, nodeId, input) => ({
        id: 'figure-regeneration-theme-bookkeeping',
        boardId: board.id,
        nodeId,
        clientRequestId: input.clientRequestId,
        issue: input.issue,
        status: 'completed' as const,
        chalkCost: 1,
        failureReason: null,
        refundConfirmed: false,
      })),
    });
    const rendered = renderPanel({ client, theme: 'light' });
    await advancePoll();

    rendered.rerender(
      <LearningBoredPresentationThemeProvider value='dark'>
        <LearningBoredCapturePanel {...rendered.props} />
      </LearningBoredPresentationThemeProvider>,
    );
    await flushProjectionEffects();
    fireEvent.click(screen.getByRole('button', { name: /Replace figure/u }));
    fireEvent.click(screen.getByRole('button', { name: 'Use 1 Chalk' }));
    await flushProjectionEffects();
    expect(screen.getByRole('heading', { name: darkFigureBoard.title })).toBeTruthy();

    rendered.rerender(
      <LearningBoredPresentationThemeProvider value='light'>
        <LearningBoredCapturePanel {...rendered.props} />
      </LearningBoredPresentationThemeProvider>,
    );
    await flushProjectionEffects();

    expect(rerenderBoard).toHaveBeenCalledTimes(3);
    expect(screen.getByRole('heading', { name: restoredLightBoard.title })).toBeTruthy();
  });

  it('does not let a stale Figure refresh overwrite a newer theme projection', async () => {
    vi.useFakeTimers();
    const board = createBoard();
    const staleFigureBoard = createBoard({ title: 'Stale Figure refresh' });
    const currentThemeBoard = createBoard({ title: 'Current dark theme Board' });
    let resolveFigureRefresh: ((value: LearningBoredBoardResult) => void) | undefined;
    const figureRefresh = new Promise<LearningBoredBoardResult>((resolve) => {
      resolveFigureRefresh = resolve;
    });
    const rerenderBoard = vi
      .fn<LearningBoredClient['rerenderBoard']>()
      .mockImplementationOnce(async () => await figureRefresh)
      .mockResolvedValueOnce(currentThemeBoard);
    const client = createClient({
      rerenderBoard,
      getGeneration: vi.fn(async () => ({
        id: 'generation-1',
        status: 'completed' as const,
        boardId: board.id,
        board,
      })),
      requestFigureRegeneration: vi.fn(async (_boardId, nodeId, input) => ({
        id: 'figure-regeneration-complete',
        boardId: board.id,
        nodeId,
        clientRequestId: input.clientRequestId,
        issue: input.issue,
        status: 'completed' as const,
        chalkCost: 1,
        failureReason: null,
        refundConfirmed: false,
      })),
    });
    const rendered = renderPanel({ client, theme: 'light' });
    await advancePoll();

    fireEvent.click(screen.getByRole('button', { name: /Replace figure/u }));
    fireEvent.click(screen.getByRole('button', { name: 'Use 1 Chalk' }));
    await act(async () => {
      await Promise.resolve();
    });
    const staleSignal = rerenderBoard.mock.calls[0]?.[2]?.signal;

    rendered.rerender(
      <LearningBoredPresentationThemeProvider value='dark'>
        <LearningBoredCapturePanel {...rendered.props} />
      </LearningBoredPresentationThemeProvider>,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(staleSignal?.aborted).toBe(true);
    expect(screen.getByRole('heading', { name: 'Current dark theme Board' })).toBeTruthy();

    resolveFigureRefresh?.(staleFigureBoard);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByRole('heading', { name: 'Current dark theme Board' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Stale Figure refresh' })).toBeNull();
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
          projectionSvg: createFigureProjection('figure-private', 'data:image/png;base64,AA=='),
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
    const rendered = renderPanel({ client });
    await advancePoll();

    fireEvent.click(screen.getByRole('button', { name: /Replace figure/u }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Use 1 Chalk' }));
      await Promise.resolve();
    });

    expect(getFigureRegeneration).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Your Chalk was refunded. The previous figure is unchanged./u),
    ).toBeTruthy();
    expect(
      rendered.container
        .querySelector('[data-figure-projection="figure-private"] image')
        ?.getAttribute('href'),
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

  it.each(['failed', 'cancelled'] as const)(
    'announces a %s generation retry request failure with recovery guidance',
    async (status) => {
      vi.useFakeTimers();
      const retryGeneration = vi.fn(async () => {
        throw new Error('offline');
      });
      renderPanel({
        client: createClient({
          retryGeneration,
          getGeneration: vi.fn(async () => ({
            id: 'generation-1',
            status,
            failureReason: status === 'failed' ? 'provider_unavailable' : null,
          })),
        }),
      });
      await advancePoll();

      fireEvent.click(
        screen.getByRole('button', { name: status === 'failed' ? 'Try again' : 'Start again' }),
      );
      await act(async () => {
        await Promise.resolve();
      });

      expect(retryGeneration).toHaveBeenCalledWith('generation-1');
      expect(
        screen.getByText('The retry could not be started. Check your connection and try again.'),
      ).toBeTruthy();
    },
  );
});
