'use client';

import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Check, Send } from 'lucide-react';

import {
  isLearningBoredTerminalStatus,
  type LearningBoredBoardFigure,
  type LearningBoredBoardKind,
  type LearningBoredBoardResult,
  type LearningBoredClient,
  type LearningBoredFeedbackCategory,
  type LearningBoredFigureRegenerationIssue,
  type LearningBoredFigureRegenerationSnapshot,
  type LearningBoredGenerationSnapshot,
  type LearningBoredGenerationStatus,
  type LearningBoredReaderDocument,
  type LearningBoredSourceSpan,
} from './client';
import { startLearningBoredPoller } from './polling';
import type { LearningBoredReaderSession } from './session';
import LearningBoredComprehensionPrompt from './LearningBoredComprehensionPrompt';
import {
  type LearningBoredPresentationTheme,
  useLearningBoredPresentationTheme,
  useLearningBoredTranslation,
} from './presentation/context';
import LearningBoredWorkSurfaceShell, {
  learningBoredWorkSurfaceStyles,
} from './work-surface/LearningBoredWorkSurfaceShell';
import LearningBoredGenerationState from './work-surface/LearningBoredGenerationState';
import LearningBoredBoardSurface from './work-surface/LearningBoredBoardSurface';
import {
  isActiveFigureRegeneration,
  LearningBoredFigureReplacementState,
} from './work-surface/LearningBoredFigureSurface';

const REPORT_CATEGORIES: Array<{ value: LearningBoredFeedbackCategory; label: string }> = [
  { value: 'factually_wrong', label: 'Something is wrong' },
  { value: 'not_in_passage', label: 'Not supported by the passage' },
  { value: 'scaffold_wrong', label: 'The added explanation is wrong' },
  { value: 'figure_misleading', label: 'A picture is misleading' },
  { value: 'wrong_board_kind', label: 'This Board shape does not fit' },
  { value: 'unclear_layout', label: 'The layout is unclear' },
];

type PanelOperation = 'creating' | 'cancelling' | 'retrying' | 'rerendering';

interface PanelMachineState {
  generation: LearningBoredGenerationSnapshot | null;
  board: LearningBoredBoardResult | null;
  operation: PanelOperation | null;
  error: string | null;
}

type PanelMachineAction =
  | { type: 'operation_started'; operation: PanelOperation }
  | {
      type: 'snapshot_received';
      snapshot: LearningBoredGenerationSnapshot;
      board?: LearningBoredBoardResult | null;
    }
  | { type: 'board_received'; board: LearningBoredBoardResult }
  | { type: 'operation_failed'; message: string }
  | { type: 'poll_failed'; message: string }
  | { type: 'clear_error' };

function createInitialMachineState(session: LearningBoredReaderSession): PanelMachineState {
  return {
    generation: session.generationId
      ? {
          id: session.generationId,
          status: 'queued',
          boardId: session.boardId,
        }
      : null,
    board: null,
    operation: null,
    error: null,
  };
}

function panelMachineReducer(
  state: PanelMachineState,
  action: PanelMachineAction,
): PanelMachineState {
  switch (action.type) {
    case 'operation_started':
      return { ...state, operation: action.operation, error: null };
    case 'snapshot_received':
      return {
        ...state,
        generation: action.snapshot,
        board: action.board === undefined ? (action.snapshot.board ?? state.board) : action.board,
        operation: null,
        error: null,
      };
    case 'board_received':
      return { ...state, board: action.board, operation: null, error: null };
    case 'operation_failed':
      return { ...state, operation: null, error: action.message };
    case 'poll_failed':
      return { ...state, error: action.message };
    case 'clear_error':
      return { ...state, error: null };
  }
}

export interface LearningBoredCapturePanelProps {
  isOpen: boolean;
  session: LearningBoredReaderSession;
  document: LearningBoredReaderDocument | null;
  client: LearningBoredClient | null;
  onClose: () => void;
  onClear: () => void;
  onStartReview?: (documentId: string) => void;
  onOpenProgress?: (documentId: string) => void;
  onSessionPatch: (
    patch: Partial<
      Pick<LearningBoredReaderSession, 'generationId' | 'boardId' | 'showScaffold' | 'kind'>
    >,
  ) => void;
  onSourceSpanEnter?: (span: LearningBoredSourceSpan) => void;
  onSourceSpanLeave?: () => void;
}

function getStageLabel(status: LearningBoredGenerationStatus): string {
  switch (status) {
    case 'queued':
      return 'Waiting to begin';
    case 'extracting':
      return 'Reading the passage';
    case 'composing':
      return 'Drawing the Board and writing questions';
    case 'illustrating':
      return 'Illustrating';
    case 'rendering':
      return 'Finishing the Board';
    case 'completed':
      return 'Board ready';
    case 'failed':
      return 'Board generation failed';
    case 'cancelled':
      return 'Board generation cancelled';
  }
}

function getFailureMessage(reason?: string | null): string {
  switch (reason) {
    case 'insufficient_grounding':
      return 'The passage did not contain enough supported material for a reliable Board.';
    case 'validation_failed':
      return 'The generated explanation did not pass the grounding checks.';
    case 'provider_unavailable':
      return 'The explanation service was temporarily unavailable.';
    case 'generation_timed_out':
      return 'The explanation took too long to finish.';
    default:
      return 'The Board could not be completed safely.';
  }
}

function isActiveGeneration(status: LearningBoredGenerationStatus): boolean {
  return !isLearningBoredTerminalStatus(status);
}

interface FigureRegenerationDraft {
  figure: LearningBoredBoardFigure;
  issue: LearningBoredFigureRegenerationIssue;
  clientRequestId: string;
}

function createFigureRegenerationRequestId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `reader-${globalThis.crypto.randomUUID()}`;
  }
  return `reader-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const LearningBoredCapturePanel: React.FC<LearningBoredCapturePanelProps> = ({
  isOpen,
  session,
  document,
  client,
  onClose,
  onClear,
  onStartReview,
  onOpenProgress,
  onSessionPatch,
  onSourceSpanEnter,
  onSourceSpanLeave,
}) => {
  const _ = useLearningBoredTranslation();
  const presentationTheme = useLearningBoredPresentationTheme();
  const [machine, dispatch] = useReducer(panelMachineReducer, session, createInitialMachineState);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportCategory, setReportCategory] =
    useState<LearningBoredFeedbackCategory>('factually_wrong');
  const [reportComment, setReportComment] = useState('');
  const [themeRefreshRevision, setThemeRefreshRevision] = useState(0);
  const [themeRefreshError, setThemeRefreshError] = useState<string | null>(null);
  const [figureRegenerationDraft, setFigureRegenerationDraft] =
    useState<FigureRegenerationDraft | null>(null);
  const [figureRegeneration, setFigureRegeneration] =
    useState<LearningBoredFigureRegenerationSnapshot | null>(null);
  const [figureRegenerationError, setFigureRegenerationError] = useState<string | null>(null);
  const [figureHydrationError, setFigureHydrationError] = useState<string | null>(null);
  const [figureRegenerationSubmitting, setFigureRegenerationSubmitting] = useState(false);
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [kindRerendering, setKindRerendering] = useState(false);
  const [showScaffold, setShowScaffold] = useState(session.showScaffold);
  const createAttemptRef = useRef<string | null>(null);
  const operationControllerRef = useRef<AbortController | null>(null);
  const projectionControllerRef = useRef<AbortController | null>(null);
  const projectionRequestRef = useRef(0);
  const kindRerenderRequestRef = useRef(0);
  const themeRefreshFailuresRef = useRef({ theme: presentationTheme, count: 0 });
  const feedbackInFlightRef = useRef(false);
  const figureReplacementTriggerRef = useRef<HTMLButtonElement | null>(null);
  const figureReplacementFocusReturnPendingRef = useRef(false);
  const reportCategoryRef = useRef<HTMLSelectElement>(null);
  const latestSessionRef = useRef(session);
  const renderedThemeRef = useRef(presentationTheme);
  const latestPresentationThemeRef = useRef(presentationTheme);
  latestSessionRef.current = session;
  latestPresentationThemeRef.current = presentationTheme;

  useEffect(() => {
    setShowScaffold(session.showScaffold);
  }, [session.bookId, session.showScaffold]);

  const selectedKind = session.kind ?? machine.board?.kind ?? null;

  const applySnapshot = useCallback(
    async (snapshot: LearningBoredGenerationSnapshot, signal?: AbortSignal): Promise<boolean> => {
      let board = snapshot.board ?? null;
      const boardId = snapshot.boardId ?? board?.id ?? null;

      if (snapshot.status === 'completed' && !board && boardId && client) {
        board = await client.getBoard(
          boardId,
          {
            ...(latestSessionRef.current.kind ? { kind: latestSessionRef.current.kind } : {}),
            includeScaffold: true,
          },
          { signal },
        );
      }

      dispatch({ type: 'snapshot_received', snapshot, board });

      const latestSession = latestSessionRef.current;
      const nextKind = latestSession.kind ?? board?.kind ?? null;
      const patch: Parameters<typeof onSessionPatch>[0] = {};
      if (latestSession.generationId !== snapshot.id) patch.generationId = snapshot.id;
      if (latestSession.boardId !== boardId) patch.boardId = boardId;
      if (latestSession.kind !== nextKind) patch.kind = nextKind;
      if (Object.keys(patch).length > 0) onSessionPatch(patch);

      return isActiveGeneration(snapshot.status);
    },
    [client, onSessionPatch],
  );

  const reloadBoard = useCallback(
    async (
      boardId: string,
      signal?: AbortSignal,
      commit = true,
    ): Promise<LearningBoredBoardResult | null> => {
      const latestSession = latestSessionRef.current;
      const kind = latestSession.kind ?? machine.board?.kind;
      if (!client || !kind) return null;

      const board = await client.rerenderBoard(
        boardId,
        { kind, includeScaffold: true },
        { signal },
      );
      if (commit) {
        dispatch({ type: 'board_received', board });
        onSessionPatch({ boardId: board.id, kind: board.kind });
      }
      return board;
    },
    [client, machine.board?.kind, onSessionPatch],
  );

  const settleNonThemeProjection = useCallback(
    (requestId: number, renderedTheme: LearningBoredPresentationTheme | null) => {
      if (requestId !== projectionRequestRef.current) return;

      if (renderedTheme) {
        renderedThemeRef.current = renderedTheme;
        themeRefreshFailuresRef.current = { theme: renderedTheme, count: 0 };
        setFigureHydrationError(null);
      }

      if (renderedThemeRef.current === latestPresentationThemeRef.current) {
        setThemeRefreshError(null);
      } else {
        setThemeRefreshRevision((revision) => revision + 1);
      }
    },
    [],
  );

  const refreshBoardProjection = useCallback(
    async (boardId: string): Promise<LearningBoredBoardResult | null> => {
      projectionControllerRef.current?.abort();
      const controller = new AbortController();
      projectionControllerRef.current = controller;
      const requestId = ++projectionRequestRef.current;
      const requestedTheme = latestPresentationThemeRef.current;
      let renderedTheme: LearningBoredPresentationTheme | null = null;

      try {
        const board = await reloadBoard(boardId, controller.signal, false);
        if (!board || controller.signal.aborted || requestId !== projectionRequestRef.current) {
          return null;
        }
        dispatch({ type: 'board_received', board });
        onSessionPatch({ boardId: board.id, kind: board.kind });
        renderedTheme = requestedTheme;
        return board;
      } finally {
        if (projectionControllerRef.current === controller) projectionControllerRef.current = null;
        if (!controller.signal.aborted) settleNonThemeProjection(requestId, renderedTheme);
      }
    },
    [onSessionPatch, reloadBoard, settleNonThemeProjection],
  );

  useEffect(() => {
    if (themeRefreshFailuresRef.current.theme !== presentationTheme) {
      themeRefreshFailuresRef.current = { theme: presentationTheme, count: 0 };
    }
    if (renderedThemeRef.current === presentationTheme) {
      setThemeRefreshError(null);
      return;
    }
    if (machine.generation?.status !== 'completed' || !machine.board?.id) {
      return;
    }

    projectionControllerRef.current?.abort();
    const controller = new AbortController();
    projectionControllerRef.current = controller;
    const requestId = ++projectionRequestRef.current;
    const requestedTheme = presentationTheme;
    let retryTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
    void reloadBoard(machine.board.id, controller.signal, false)
      .then((board) => {
        if (board && requestId === projectionRequestRef.current && !controller.signal.aborted) {
          dispatch({ type: 'board_received', board });
          onSessionPatch({ boardId: board.id, kind: board.kind });
          renderedThemeRef.current = requestedTheme;
          themeRefreshFailuresRef.current = { theme: requestedTheme, count: 0 };
          setThemeRefreshError(null);
          setFigureHydrationError(null);
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
          return;
        }
        setThemeRefreshError(_('The Board theme could not be refreshed yet.'));
        themeRefreshFailuresRef.current.count += 1;
        if (themeRefreshFailuresRef.current.count === 1) {
          retryTimer = globalThis.setTimeout(
            () => setThemeRefreshRevision((revision) => revision + 1),
            2_000,
          );
        }
      });
    return () => {
      if (retryTimer !== undefined) globalThis.clearTimeout(retryTimer);
      controller.abort();
      if (projectionControllerRef.current === controller) projectionControllerRef.current = null;
    };
  }, [
    _,
    machine.board?.id,
    machine.generation?.status,
    onSessionPatch,
    presentationTheme,
    reloadBoard,
    themeRefreshRevision,
  ]);

  const startGeneration = useCallback(async () => {
    if (!client || !document || !session.passage || machine.operation === 'creating') return;

    operationControllerRef.current?.abort();
    const controller = new AbortController();
    operationControllerRef.current = controller;
    dispatch({ type: 'operation_started', operation: 'creating' });

    try {
      const snapshot = await client.createGeneration(
        {
          document,
          selectedText: session.passage.selectedText,
          surroundingContext: session.passage.surroundingContext,
          contextOffset: session.passage.contextOffset,
          ...(session.passage.chapter ? { chapter: session.passage.chapter } : {}),
          ...(session.passage.location.pageLabel
            ? { pageLabel: session.passage.location.pageLabel }
            : {}),
          location: session.passage.location,
          ...(session.kind ? { requestedBoardKind: session.kind } : {}),
          recallItemTarget: 6,
          allowFigures: true,
          allowScaffold: true,
        },
        { signal: controller.signal },
      );
      if (!controller.signal.aborted) await applySnapshot(snapshot, controller.signal);
    } catch {
      if (!controller.signal.aborted) {
        dispatch({
          type: 'operation_failed',
          message: _('LearningBored could not start. Check your connection and try again.'),
        });
      }
    } finally {
      if (operationControllerRef.current === controller) operationControllerRef.current = null;
    }
  }, [_, applySnapshot, client, document, machine.operation, session.kind, session.passage]);

  useEffect(() => {
    if (!isOpen || session.generationId || machine.generation || !client || !document) return;
    const passage = session.passage;
    if (!passage) return;

    const attemptKey = `${passage.bookId}:${passage.location.cfi}:${passage.selectedText}`;
    if (createAttemptRef.current === attemptKey) return;
    createAttemptRef.current = attemptKey;
    void startGeneration();
  }, [
    client,
    document,
    isOpen,
    machine.generation,
    session.generationId,
    session.passage,
    startGeneration,
  ]);

  useEffect(() => {
    const generation = machine.generation;
    if (
      !client ||
      !generation ||
      !isActiveGeneration(generation.status) ||
      machine.operation === 'cancelling' ||
      machine.operation === 'retrying'
    ) {
      return;
    }

    const poller = startLearningBoredPoller({
      request: (signal) => client.getGeneration(generation.id, { signal }),
      onResult: (snapshot, signal) => applySnapshot(snapshot, signal),
      onError: () =>
        dispatch({
          type: 'poll_failed',
          message: _('The latest status could not be loaded. LearningBored will keep trying.'),
        }),
    });
    return poller.stop;
  }, [
    _,
    applySnapshot,
    client,
    machine.generation?.id,
    machine.generation?.status,
    machine.operation,
  ]);

  const figureRegenerationActive = isActiveFigureRegeneration(figureRegeneration);
  const figureReplacementDisabled =
    !client || figureRegenerationActive || figureRegenerationSubmitting;
  useEffect(() => {
    if (
      !figureReplacementFocusReturnPendingRef.current ||
      figureRegenerationDraft ||
      figureRegenerationSubmitting ||
      figureRegenerationActive
    ) {
      return;
    }

    figureReplacementFocusReturnPendingRef.current = false;
    const trigger = figureReplacementTriggerRef.current;
    if (trigger?.isConnected && !trigger.disabled) trigger.focus();
  }, [figureRegenerationActive, figureRegenerationDraft, figureRegenerationSubmitting]);
  useEffect(() => {
    if (!client || !figureRegeneration?.id || !figureRegenerationActive) return;

    const poller = startLearningBoredPoller({
      request: (signal) => client.getFigureRegeneration(figureRegeneration.id, { signal }),
      onResult: async (snapshot) => {
        setFigureRegeneration(snapshot);
        setFigureRegenerationError(null);
        if (snapshot.status === 'completed') {
          try {
            // The terminal status update stops its poller and aborts the status request; Board
            // hydration owns a separate sequenced controller so cleanup cannot cancel its result.
            await refreshBoardProjection(snapshot.boardId);
          } catch {
            setFigureHydrationError(
              _('The new figure is ready, but the Board could not be refreshed yet.'),
            );
          }
        }
        return isActiveFigureRegeneration(snapshot);
      },
      onError: () =>
        setFigureRegenerationError(
          _('The replacement status could not be loaded. LearningBored will keep trying.'),
        ),
    });
    return poller.stop;
  }, [_, client, figureRegeneration?.id, figureRegenerationActive, refreshBoardProjection]);

  useEffect(
    () => () => {
      operationControllerRef.current?.abort();
      projectionControllerRef.current?.abort();
      operationControllerRef.current = null;
      projectionControllerRef.current = null;
      createAttemptRef.current = null;
    },
    [],
  );

  useEffect(() => () => onSourceSpanLeave?.(), [onSourceSpanLeave]);

  useEffect(() => {
    if (reportOpen) reportCategoryRef.current?.focus();
  }, [reportOpen]);

  const handleCancel = async () => {
    const generationId = machine.generation?.id;
    if (!client || !generationId) return;
    dispatch({ type: 'operation_started', operation: 'cancelling' });
    try {
      const snapshot = await client.cancelGeneration(generationId);
      await applySnapshot(snapshot);
    } catch {
      dispatch({
        type: 'operation_failed',
        message: _('The generation could not be cancelled. Check its status and try again.'),
      });
    }
  };

  const handleRetry = async () => {
    const generationId = machine.generation?.id;
    if (!client) return;
    if (!generationId) {
      createAttemptRef.current = null;
      dispatch({ type: 'clear_error' });
      await startGeneration();
      return;
    }

    dispatch({ type: 'operation_started', operation: 'retrying' });
    try {
      const snapshot = await client.retryGeneration(generationId);
      await applySnapshot(snapshot);
    } catch {
      dispatch({
        type: 'operation_failed',
        message: _('The retry could not be started. Check your connection and try again.'),
      });
    }
  };

  const handleKindChange = async (kind: LearningBoredBoardKind) => {
    const committedKind = machine.board?.kind ?? session.kind;
    onSessionPatch({ kind });
    const boardId = machine.generation?.boardId ?? machine.board?.id ?? session.boardId;
    if (!client || !boardId || !machine.board) return;

    projectionControllerRef.current?.abort();
    const controller = new AbortController();
    projectionControllerRef.current = controller;
    const requestId = ++projectionRequestRef.current;
    const kindRequestId = ++kindRerenderRequestRef.current;
    const requestedTheme = latestPresentationThemeRef.current;
    let renderedTheme: LearningBoredPresentationTheme | null = null;
    setKindRerendering(true);
    dispatch({ type: 'operation_started', operation: 'rerendering' });
    try {
      const board = await client.rerenderBoard(
        boardId,
        { kind, includeScaffold: true },
        { signal: controller.signal },
      );
      if (controller.signal.aborted || requestId !== projectionRequestRef.current) return;
      dispatch({ type: 'board_received', board });
      onSessionPatch({ boardId: board.id, kind: board.kind });
      renderedTheme = requestedTheme;
    } catch (error: unknown) {
      if (controller.signal.aborted || (error instanceof Error && error.name === 'AbortError'))
        return;
      if (requestId !== projectionRequestRef.current) return;
      if (committedKind) {
        latestSessionRef.current = { ...latestSessionRef.current, kind: committedKind };
        onSessionPatch({ kind: committedKind });
      }
      dispatch({
        type: 'operation_failed',
        message: _('That Board shape could not be rendered. Your current Board is unchanged.'),
      });
    } finally {
      if (kindRequestId === kindRerenderRequestRef.current) setKindRerendering(false);
      if (projectionControllerRef.current === controller) projectionControllerRef.current = null;
      if (!controller.signal.aborted) settleNonThemeProjection(requestId, renderedTheme);
    }
  };

  const handleScaffoldChange = (includeScaffold: boolean) => {
    setShowScaffold(includeScaffold);
    onSessionPatch({ showScaffold: includeScaffold });
  };

  const openFigureRegeneration = (figure: LearningBoredBoardFigure, trigger: HTMLButtonElement) => {
    figureReplacementTriggerRef.current = trigger;
    figureReplacementFocusReturnPendingRef.current = true;
    setFigureRegenerationDraft({
      figure,
      issue: 'unclear',
      clientRequestId: createFigureRegenerationRequestId(),
    });
    setFigureRegenerationError(null);
    setFigureHydrationError(null);
  };

  const confirmFigureRegeneration = async () => {
    const draft = figureRegenerationDraft;
    const boardId = machine.board?.id ?? session.boardId;
    if (!client || !draft || !boardId || figureRegenerationSubmitting) return;

    setFigureRegenerationSubmitting(true);
    setFigureRegenerationError(null);
    setFigureHydrationError(null);
    try {
      const snapshot = await client.requestFigureRegeneration(boardId, draft.figure.nodeId, {
        issue: draft.issue,
        clientRequestId: draft.clientRequestId,
      });
      setFigureRegeneration(snapshot);
      setFigureRegenerationDraft(null);
      if (snapshot.status === 'completed') {
        try {
          await refreshBoardProjection(snapshot.boardId);
        } catch {
          setFigureHydrationError(
            _('The new figure is ready, but the Board could not be refreshed yet.'),
          );
        }
      }
    } catch {
      setFigureRegenerationError(
        _('The figure replacement could not be started. No new request will be made if you retry.'),
      );
    } finally {
      setFigureRegenerationSubmitting(false);
    }
  };

  const sendFeedback = async (category: LearningBoredFeedbackCategory, comment?: string) => {
    if (!client || !machine.generation?.id || feedbackInFlightRef.current) return;
    feedbackInFlightRef.current = true;
    setFeedbackSubmitting(true);
    setFeedbackError(null);
    setFeedbackMessage(null);
    try {
      await client.submitFeedback({
        generationId: machine.generation.id,
        ...(machine.board?.id || session.boardId
          ? { boardId: machine.board?.id ?? session.boardId ?? undefined }
          : {}),
        category,
        ...(comment?.trim() ? { comment: comment.trim() } : {}),
      });
      setFeedbackMessage(_('Thanks — your feedback was recorded.'));
      setReportOpen(false);
      setReportComment('');
    } catch {
      setFeedbackError(_('Your feedback could not be sent. Please try again.'));
    } finally {
      feedbackInFlightRef.current = false;
      setFeedbackSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const status = machine.generation?.status;

  return (
    <LearningBoredWorkSurfaceShell
      stageLabel={status ? getStageLabel(status) : 'Passage ready'}
      theme={presentationTheme}
      passage={session.passage}
      passageOpen={!machine.board}
      onClose={onClose}
      translate={_}
      footer={
        !status || isLearningBoredTerminalStatus(status) ? (
          <footer className={learningBoredWorkSurfaceStyles['footer']}>
            <button
              type='button'
              className={`${learningBoredWorkSurfaceStyles['dangerButton']} ${learningBoredWorkSurfaceStyles['fullWidth']}`}
              onClick={onClear}
            >
              {status === 'completed'
                ? _('Remove this Board from the reader')
                : _('Clear captured passage')}
            </button>
          </footer>
        ) : null
      }
    >
      {!machine.generation && machine.operation !== 'creating' ? (
        <LearningBoredGenerationState
          state={{ kind: 'ready', connected: Boolean(client && document), error: machine.error }}
          onStart={() => void handleRetry()}
          translate={_}
        />
      ) : null}

      {machine.operation === 'creating' || (status && isActiveGeneration(status)) ? (
        <LearningBoredGenerationState
          state={{
            kind: 'active',
            label:
              machine.operation === 'creating' ? 'Starting your Board' : getStageLabel(status!),
            error: machine.error,
            canCancel: Boolean(machine.generation),
            cancelling: machine.operation === 'cancelling',
          }}
          onCancel={() => void handleCancel()}
          translate={_}
        />
      ) : null}

      {status === 'failed' ? (
        <LearningBoredGenerationState
          state={{
            kind: 'failed',
            message: getFailureMessage(machine.generation?.failureReason),
            error: machine.error,
            retrying: machine.operation === 'retrying',
          }}
          onRetry={() => void handleRetry()}
          translate={_}
        />
      ) : null}

      {status === 'cancelled' ? (
        <LearningBoredGenerationState
          state={{
            kind: 'cancelled',
            error: machine.error,
            retrying: machine.operation === 'retrying',
          }}
          onRetry={() => void handleRetry()}
          translate={_}
        />
      ) : null}

      {status === 'completed' && machine.board ? (
        <>
          <LearningBoredBoardSurface
            board={machine.board}
            selectedKind={selectedKind ?? machine.board.kind}
            showScaffold={showScaffold}
            rerendering={kindRerendering}
            droppedClaimCount={machine.generation?.droppedClaimCount}
            replaceDisabled={figureReplacementDisabled}
            onKindChange={client ? (kind) => void handleKindChange(kind) : undefined}
            onScaffoldChange={handleScaffoldChange}
            onReplaceFigure={openFigureRegeneration}
            onStartReview={client ? onStartReview : undefined}
            onOpenProgress={client ? onOpenProgress : undefined}
            onReport={client ? () => setReportOpen((current) => !current) : undefined}
            reportOpen={reportOpen}
            reportControlsId='learningbored-report-form'
            figureReplacement={
              <LearningBoredFigureReplacementState
                draft={figureRegenerationDraft}
                regeneration={figureRegeneration}
                error={figureRegenerationError ?? figureHydrationError}
                submitting={figureRegenerationSubmitting}
                onIssueChange={(issue) =>
                  setFigureRegenerationDraft((current) => (current ? { ...current, issue } : null))
                }
                onConfirm={() => void confirmFigureRegeneration()}
                onDismiss={() => setFigureRegenerationDraft(null)}
                translate={_}
              />
            }
            comprehension={
              client ? (
                <LearningBoredComprehensionPrompt boardId={machine.board.id} client={client} />
              ) : null
            }
            reportForm={
              reportOpen ? (
                <form
                  id='learningbored-report-form'
                  className={learningBoredWorkSurfaceStyles['reportForm']}
                  onSubmit={(event) => {
                    event.preventDefault();
                    void sendFeedback(reportCategory, reportComment);
                  }}
                >
                  <label className={learningBoredWorkSurfaceStyles['field']}>
                    {_('What needs attention?')}
                    <select
                      ref={reportCategoryRef}
                      className={learningBoredWorkSurfaceStyles['select']}
                      value={reportCategory}
                      onChange={(event) =>
                        setReportCategory(event.target.value as LearningBoredFeedbackCategory)
                      }
                    >
                      {REPORT_CATEGORIES.map((category) => (
                        <option key={category.value} value={category.value}>
                          {_(category.label)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={learningBoredWorkSurfaceStyles['field']}>
                    {_('Details (optional)')}
                    <textarea
                      className={learningBoredWorkSurfaceStyles['textarea']}
                      maxLength={4_000}
                      value={reportComment}
                      onChange={(event) => setReportComment(event.target.value)}
                    />
                  </label>
                  <button
                    type='submit'
                    className={`${learningBoredWorkSurfaceStyles['primaryButton']} ${learningBoredWorkSurfaceStyles['fullWidth']}`}
                    disabled={feedbackSubmitting}
                  >
                    <Send aria-hidden='true' />
                    {_('Send report')}
                  </button>
                </form>
              ) : null
            }
            onSourceSpanEnter={onSourceSpanEnter}
            onSourceSpanLeave={onSourceSpanLeave}
            translate={_}
          />

          {feedbackMessage ? (
            <p
              className={`${learningBoredWorkSurfaceStyles['success']} ${learningBoredWorkSurfaceStyles['inlineStatus']}`}
              role='status'
            >
              <Check aria-hidden='true' />
              {feedbackMessage}
            </p>
          ) : null}
          {feedbackError ? (
            <p className={learningBoredWorkSurfaceStyles['error']} role='alert'>
              {feedbackError}
            </p>
          ) : null}
          {themeRefreshError ? (
            <p className={learningBoredWorkSurfaceStyles['error']} role='alert'>
              {themeRefreshError}
            </p>
          ) : null}
          {machine.error ? (
            <p className={learningBoredWorkSurfaceStyles['error']} role='alert'>
              {machine.error}
            </p>
          ) : null}
        </>
      ) : null}

      {status === 'completed' && !machine.board ? (
        <LearningBoredGenerationState state={{ kind: 'unavailable' }} translate={_} />
      ) : null}
    </LearningBoredWorkSurfaceShell>
  );
};

export default LearningBoredCapturePanel;
