'use client';

import DOMPurify from 'dompurify';
import Image from 'next/image';
import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  BarChart3,
  BookOpenText,
  Check,
  Clock3,
  Flag,
  RefreshCw,
  Send,
  X,
} from 'lucide-react';

import { useTranslation } from '@/hooks/useTranslation';
import {
  isLearningBoredTerminalStatus,
  LEARNINGBORED_BOARD_KINDS,
  LEARNINGBORED_FIGURE_REGENERATION_ISSUES,
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

const BOARD_KIND_LABELS: Record<LearningBoredBoardKind, string> = {
  concept_map: 'Concept map',
  process_flow: 'Process flow',
  comparison_matrix: 'Comparison matrix',
  hierarchy: 'Hierarchy',
  timeline: 'Timeline',
  decision_tree: 'Decision tree',
  system_architecture: 'System architecture',
  labeled_diagram: 'Labeled diagram',
  formula_breakdown: 'Formula breakdown',
  cause_effect: 'Cause and effect',
  annotated_illustration: 'Annotated illustration',
  analogy_panel: 'Analogy panel',
  worked_example: 'Worked example',
};

const REPORT_CATEGORIES: Array<{ value: LearningBoredFeedbackCategory; label: string }> = [
  { value: 'factually_wrong', label: 'Something is wrong' },
  { value: 'not_in_passage', label: 'Not supported by the passage' },
  { value: 'scaffold_wrong', label: 'The added explanation is wrong' },
  { value: 'figure_misleading', label: 'A picture is misleading' },
  { value: 'wrong_board_kind', label: 'This Board shape does not fit' },
  { value: 'unclear_layout', label: 'The layout is unclear' },
];

const FIGURE_REGENERATION_CHALK_COST = 1;
const FIGURE_REGENERATION_ISSUE_LABELS: Record<LearningBoredFigureRegenerationIssue, string> = {
  wrong_arrangement: 'The arrangement is wrong',
  missing_part: 'A required part is missing',
  too_detailed: 'The picture is too detailed',
  too_abstract: 'The picture is too abstract',
  unclear: 'The picture is unclear',
};

type PanelOperation = 'creating' | 'cancelling' | 'retrying' | 'rerendering' | 'feedback';

interface PanelMachineState {
  generation: LearningBoredGenerationSnapshot | null;
  board: LearningBoredBoardResult | null;
  operation: PanelOperation | null;
  error: string | null;
  feedbackMessage: string | null;
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
  | { type: 'feedback_sent'; message: string }
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
    feedbackMessage: null,
  };
}

function panelMachineReducer(
  state: PanelMachineState,
  action: PanelMachineAction,
): PanelMachineState {
  switch (action.type) {
    case 'operation_started':
      return { ...state, operation: action.operation, error: null, feedbackMessage: null };
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
    case 'feedback_sent':
      return { ...state, operation: null, error: null, feedbackMessage: action.message };
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

function sanitizeBoardSvg(svg?: string | null): string | null {
  if (!svg) return null;

  return DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    ADD_ATTR: ['data-provenance', 'data-source-start', 'data-source-end', 'role', 'tabindex'],
  });
}

function sourceSpanFromElement(target: EventTarget | null): LearningBoredSourceSpan | null {
  if (!(target instanceof Element)) return null;
  const anchor = target.closest<HTMLElement>('[data-source-start][data-source-end]');
  if (!anchor) return null;

  const sourceStart = Number(anchor.dataset['sourceStart']);
  const sourceEnd = Number(anchor.dataset['sourceEnd']);
  return Number.isInteger(sourceStart) && Number.isInteger(sourceEnd) && sourceEnd > sourceStart
    ? { sourceStart, sourceEnd }
    : null;
}

function clampNormalized(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

function safeFigureUrl(value?: string | null): string | null {
  if (!value || typeof window === 'undefined') return null;
  if (/^data:image\/(?:png|webp);base64,[a-z\d+/]+=*$/i.test(value)) return value;
  try {
    const parsed = new URL(value, window.location.origin);
    return ['http:', 'https:', 'blob:'].includes(parsed.protocol) ? parsed.href : null;
  } catch {
    return null;
  }
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

function isActiveFigureRegeneration(
  regeneration: LearningBoredFigureRegenerationSnapshot | null,
): boolean {
  return Boolean(
    regeneration && ['queued', 'illustrating', 'validating'].includes(regeneration.status),
  );
}

function figureRegenerationLabel(
  status: LearningBoredFigureRegenerationSnapshot['status'],
): string {
  switch (status) {
    case 'queued':
      return 'Waiting to replace the figure';
    case 'illustrating':
      return 'Drawing the replacement figure';
    case 'validating':
      return 'Checking the replacement figure';
    case 'completed':
      return 'Replacement figure ready';
    case 'failed':
      return 'Figure replacement failed';
    case 'cancelled':
      return 'Figure replacement cancelled';
  }
}

function SourceInteractionButton({
  span,
  children,
  className,
  style,
  onEnter,
  onLeave,
}: {
  span?: LearningBoredSourceSpan;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onEnter?: (span: LearningBoredSourceSpan) => void;
  onLeave?: () => void;
}) {
  if (!span)
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );

  return (
    <button
      type='button'
      className={className}
      style={style}
      data-source-start={span.sourceStart}
      data-source-end={span.sourceEnd}
      onMouseEnter={() => onEnter?.(span)}
      onMouseLeave={onLeave}
      onFocus={() => onEnter?.(span)}
      onBlur={onLeave}
    >
      {children}
    </button>
  );
}

function BoardFigure({
  figure,
  onSourceSpanEnter,
  onSourceSpanLeave,
  onReplace,
  replaceDisabled,
}: {
  figure: LearningBoredBoardFigure;
  onSourceSpanEnter?: (span: LearningBoredSourceSpan) => void;
  onSourceSpanLeave?: () => void;
  onReplace: () => void;
  replaceDisabled: boolean;
}) {
  const imageUrl = safeFigureUrl(figure.imageUrl);

  if (!imageUrl || figure.failed) {
    return (
      <div className='border-base-300 space-y-3 border-s-2 ps-3 text-sm leading-6'>
        <p className='text-base-content/80'>
          <span className='font-semibold'>Figure unavailable:</span> {figure.description}
        </p>
        {figure.labels.length > 0 && (
          <ol className='space-y-1' aria-label='Figure labels'>
            {figure.labels.map((label, index) => (
              <li key={label.id}>
                <SourceInteractionButton
                  span={label.sourceSpan}
                  onEnter={onSourceSpanEnter}
                  onLeave={onSourceSpanLeave}
                  className='focus-visible:ring-primary rounded text-left focus:outline-none focus-visible:ring-2'
                >
                  <strong>
                    {index + 1}. {label.text}:
                  </strong>{' '}
                  {label.description}
                </SourceInteractionButton>
              </li>
            ))}
          </ol>
        )}
        <button
          type='button'
          className='btn btn-outline btn-sm min-h-10'
          disabled={replaceDisabled}
          onClick={onReplace}
        >
          <RefreshCw className='size-4' />
          Replace figure
        </button>
      </div>
    );
  }

  return (
    <figure className='border-base-300 bg-base-200 overflow-hidden rounded-lg border'>
      <div className='relative min-h-40 overflow-hidden'>
        {/* Dynamic, short-lived private figure URLs cannot be declared in Next image config. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt={figure.description}
          className='max-h-[min(52vh,480px)] min-h-40 w-full object-contain'
        />
        {figure.labels.map((label) => (
          <SourceInteractionButton
            key={label.id}
            span={label.sourceSpan}
            onEnter={onSourceSpanEnter}
            onLeave={onSourceSpanLeave}
            className='learningbored-figure-label absolute max-w-[45%] -translate-x-1/2 -translate-y-1/2 rounded-md border px-2 py-1 text-left text-xs font-semibold shadow-sm focus:outline-none'
            style={{
              left: `${clampNormalized(label.at.x) * 100}%`,
              top: `${clampNormalized(label.at.y) * 100}%`,
            }}
          >
            <span>{label.text}</span>
            <span className='sr-only'> — {label.description}</span>
          </SourceInteractionButton>
        ))}
      </div>
      <figcaption className='border-base-300 bg-base-100 flex flex-wrap items-center justify-between gap-3 border-t p-3 text-sm leading-6'>
        <span>{figure.caption || figure.description}</span>
        <button
          type='button'
          className='btn btn-outline btn-sm min-h-10'
          disabled={replaceDisabled}
          onClick={onReplace}
        >
          <RefreshCw className='size-4' />
          Replace figure
        </button>
      </figcaption>
    </figure>
  );
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
  const _ = useTranslation();
  const [machine, dispatch] = useReducer(panelMachineReducer, session, createInitialMachineState);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportCategory, setReportCategory] =
    useState<LearningBoredFeedbackCategory>('factually_wrong');
  const [reportComment, setReportComment] = useState('');
  const [figureRegenerationDraft, setFigureRegenerationDraft] =
    useState<FigureRegenerationDraft | null>(null);
  const [figureRegeneration, setFigureRegeneration] =
    useState<LearningBoredFigureRegenerationSnapshot | null>(null);
  const [figureRegenerationError, setFigureRegenerationError] = useState<string | null>(null);
  const [figureRegenerationSubmitting, setFigureRegenerationSubmitting] = useState(false);
  const createAttemptRef = useRef<string | null>(null);
  const operationControllerRef = useRef<AbortController | null>(null);
  const latestSessionRef = useRef(session);
  latestSessionRef.current = session;

  const selectedKind = session.kind ?? machine.board?.kind ?? null;
  const sanitizedSvg = useMemo(() => sanitizeBoardSvg(machine.board?.svg), [machine.board?.svg]);
  const visibleOutline = useMemo(
    () =>
      (machine.board?.outline ?? []).filter(
        (item) => session.showScaffold || item.provenance !== 'scaffold',
      ),
    [machine.board?.outline, session.showScaffold],
  );
  const visibleFigures = useMemo(
    () =>
      (machine.board?.figures ?? []).filter(
        (figure) => session.showScaffold || figure.provenance !== 'scaffold',
      ),
    [machine.board?.figures, session.showScaffold],
  );

  const applySnapshot = useCallback(
    async (snapshot: LearningBoredGenerationSnapshot, signal?: AbortSignal): Promise<boolean> => {
      let board = snapshot.board ?? null;
      const boardId = snapshot.boardId ?? board?.id ?? null;

      if (snapshot.status === 'completed' && !board && boardId && client) {
        board = await client.getBoard(
          boardId,
          {
            ...(latestSessionRef.current.kind ? { kind: latestSessionRef.current.kind } : {}),
            includeScaffold: latestSessionRef.current.showScaffold,
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
    async (boardId: string, signal?: AbortSignal) => {
      const latestSession = latestSessionRef.current;
      const kind = latestSession.kind ?? machine.board?.kind;
      if (!client || !kind) return;

      const board = await client.rerenderBoard(
        boardId,
        { kind, includeScaffold: latestSession.showScaffold },
        { signal },
      );
      dispatch({ type: 'board_received', board });
      onSessionPatch({ boardId: board.id, kind: board.kind });
    },
    [client, machine.board?.kind, onSessionPatch],
  );

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
  useEffect(() => {
    if (!client || !figureRegeneration?.id || !figureRegenerationActive) return;

    const poller = startLearningBoredPoller({
      request: (signal) => client.getFigureRegeneration(figureRegeneration.id, { signal }),
      onResult: async (snapshot, signal) => {
        setFigureRegeneration(snapshot);
        setFigureRegenerationError(null);
        if (snapshot.status === 'completed') {
          try {
            await reloadBoard(snapshot.boardId, signal);
          } catch {
            setFigureRegenerationError(
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
  }, [_, client, figureRegeneration?.id, figureRegenerationActive, reloadBoard]);

  useEffect(
    () => () => {
      operationControllerRef.current?.abort();
      operationControllerRef.current = null;
      createAttemptRef.current = null;
    },
    [],
  );

  useEffect(() => () => onSourceSpanLeave?.(), [onSourceSpanLeave]);

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
    onSessionPatch({ kind });
    const boardId = machine.generation?.boardId ?? machine.board?.id ?? session.boardId;
    if (!client || !boardId || !machine.board) return;

    dispatch({ type: 'operation_started', operation: 'rerendering' });
    try {
      const board = await client.rerenderBoard(boardId, {
        kind,
        includeScaffold: latestSessionRef.current.showScaffold,
      });
      dispatch({ type: 'board_received', board });
      onSessionPatch({ boardId: board.id, kind: board.kind });
    } catch {
      dispatch({
        type: 'operation_failed',
        message: _('That Board shape could not be rendered. Your current Board is unchanged.'),
      });
    }
  };

  const handleScaffoldChange = async (includeScaffold: boolean) => {
    const boardId = machine.generation?.boardId ?? machine.board?.id ?? session.boardId;
    const kind = latestSessionRef.current.kind ?? machine.board?.kind;
    if (!client || !boardId || !machine.board || !kind) {
      onSessionPatch({ showScaffold: includeScaffold });
      return;
    }

    dispatch({ type: 'operation_started', operation: 'rerendering' });
    try {
      const board = await client.rerenderBoard(boardId, { kind, includeScaffold });
      dispatch({ type: 'board_received', board });
      onSessionPatch({
        boardId: board.id,
        kind: board.kind,
        showScaffold: includeScaffold,
      });
    } catch {
      dispatch({
        type: 'operation_failed',
        message: _('The scaffold view could not be changed. Your current Board is unchanged.'),
      });
    }
  };

  const openFigureRegeneration = (figure: LearningBoredBoardFigure) => {
    setFigureRegenerationDraft({
      figure,
      issue: 'unclear',
      clientRequestId: createFigureRegenerationRequestId(),
    });
    setFigureRegenerationError(null);
  };

  const confirmFigureRegeneration = async () => {
    const draft = figureRegenerationDraft;
    const boardId = machine.board?.id ?? session.boardId;
    if (!client || !draft || !boardId || figureRegenerationSubmitting) return;

    setFigureRegenerationSubmitting(true);
    setFigureRegenerationError(null);
    try {
      const snapshot = await client.requestFigureRegeneration(boardId, draft.figure.nodeId, {
        issue: draft.issue,
        clientRequestId: draft.clientRequestId,
      });
      setFigureRegeneration(snapshot);
      setFigureRegenerationDraft(null);
      if (snapshot.status === 'completed') await reloadBoard(snapshot.boardId);
    } catch {
      setFigureRegenerationError(
        _('The figure replacement could not be started. No new request will be made if you retry.'),
      );
    } finally {
      setFigureRegenerationSubmitting(false);
    }
  };

  const sendFeedback = async (category: LearningBoredFeedbackCategory, comment?: string) => {
    if (!client || !machine.generation?.id) return;
    dispatch({ type: 'operation_started', operation: 'feedback' });
    try {
      await client.submitFeedback({
        generationId: machine.generation.id,
        ...(machine.board?.id || session.boardId
          ? { boardId: machine.board?.id ?? session.boardId ?? undefined }
          : {}),
        category,
        ...(comment?.trim() ? { comment: comment.trim() } : {}),
      });
      dispatch({ type: 'feedback_sent', message: _('Thanks — your feedback was recorded.') });
      setReportOpen(false);
      setReportComment('');
    } catch {
      dispatch({
        type: 'operation_failed',
        message: _('Your feedback could not be sent. Please try again.'),
      });
    }
  };

  if (!isOpen) return null;

  const status = machine.generation?.status;
  const isBusy = machine.operation !== null;
  const contextAfterOffset = session.passage
    ? session.passage.contextOffset + session.passage.selectedText.length
    : 0;

  return (
    <aside
      aria-label={_('LearningBored Board panel')}
      className='learningbored-panel border-base-300 text-base-content relative z-10 flex h-[44dvh] min-h-64 w-full shrink-0 flex-col border-t sm:h-full sm:max-h-none sm:w-[clamp(360px,32vw,520px)] sm:border-l sm:border-t-0'
    >
      <style>{`
        .learningbored-panel {
          --lb-paper: #faf8f4;
          --lb-raised: #fefdfb;
          --lb-recessed: #f1ece4;
          --lb-border: #e4ddd2;
          --lb-ink: #1b2430;
          --lb-muted: #5a6774;
          --lb-focus: #0e6570;
          background: var(--lb-paper);
          color: var(--lb-ink);
        }
        .learningbored-figure-label {
          border-color: var(--lb-border);
          background: rgba(254, 253, 251, 0.88);
          color: var(--lb-ink);
        }
        .learningbored-figure-label:focus-visible {
          outline: 2px solid var(--lb-focus);
          outline-offset: 2px;
        }
        .learningbored-svg svg {
          display: block;
          width: 100%;
          height: auto;
          max-height: min(52vh, 480px);
        }
        @media (prefers-reduced-motion: reduce) {
          .learningbored-panel * {
            scroll-behavior: auto !important;
            transition-duration: 0ms !important;
            animation-duration: 0ms !important;
          }
        }
      `}</style>

      <div className='flex h-6 shrink-0 items-center justify-center sm:hidden' aria-hidden='true'>
        <span className='bg-base-content/30 h-1 w-10 rounded-full' />
      </div>

      <header className='border-base-300 flex min-h-14 shrink-0 items-center justify-between gap-3 border-b px-4'>
        <div className='flex min-w-0 items-center gap-3'>
          <Image
            src='/learningbored/mark.svg'
            width={28}
            height={28}
            alt=''
            aria-hidden='true'
            className='shrink-0'
          />
          <div className='min-w-0'>
            <h2 className='truncate text-base font-semibold'>{_('LearningBored')}</h2>
            <p className='text-base-content/60 truncate text-xs'>
              {status ? _(getStageLabel(status)) : _('Passage ready')}
            </p>
          </div>
        </div>
        <button
          type='button'
          className='btn btn-ghost btn-sm h-10 min-h-10 w-10 p-0'
          aria-label={_('Close LearningBored panel')}
          title={_('Close LearningBored panel')}
          onClick={onClose}
        >
          <X className='size-5' />
        </button>
      </header>

      <aside
        aria-label={_('AI-generated content notice')}
        className='border-base-300 bg-base-100/70 border-b px-4 py-3 text-xs leading-5'
      >
        <strong>{_('AI-generated study aid.')}</strong>{' '}
        <span className='text-base-content/70'>
          {_('Check important details against the source.')}
        </span>
      </aside>

      <div className='min-h-0 flex-1 overflow-y-auto'>
        {session.passage && (
          <section className='border-base-300 border-b p-4'>
            <details open={!machine.board}>
              <summary className='flex cursor-pointer list-none items-center gap-2 text-sm font-semibold'>
                <BookOpenText className='size-4' aria-hidden='true' />
                {_('Captured passage')}
              </summary>
              <blockquote className='bg-base-200 mt-3 whitespace-pre-wrap break-words rounded-lg p-4 text-sm leading-6'>
                {session.passage.selectedText}
              </blockquote>
              <p className='text-base-content/60 mt-2 text-xs'>
                {_('Anchored at context offsets')} {session.passage.contextOffset}–
                {contextAfterOffset}
              </p>
            </details>
          </section>
        )}

        {!machine.generation && machine.operation !== 'creating' && (
          <section className='p-5 text-center'>
            <h3 className='text-base font-semibold'>{_('Ready to make this passage clear')}</h3>
            <p className='text-base-content/70 mt-2 text-sm leading-6'>
              {client
                ? _('LearningBored will turn the passage into a grounded visual explanation.')
                : _('The passage is saved. LearningBored is not connected in this reader yet.')}
            </p>
            {machine.error && (
              <p className='text-error mt-3 text-sm' role='alert'>
                {machine.error}
              </p>
            )}
            <button
              type='button'
              className='btn btn-primary mt-4 min-h-11'
              disabled={!client || !document}
              onClick={() => void handleRetry()}
            >
              {_('Board it')}
            </button>
          </section>
        )}

        {(machine.operation === 'creating' || (status && isActiveGeneration(status))) && (
          <section className='p-5' aria-live='polite' aria-busy='true'>
            <div className='flex items-start gap-3'>
              <Clock3 className='text-primary mt-0.5 size-5 shrink-0' aria-hidden='true' />
              <div>
                <h3 className='font-semibold'>
                  {_(
                    machine.operation === 'creating'
                      ? 'Starting your Board'
                      : getStageLabel(status!),
                  )}
                </h3>
                <p className='text-base-content/70 mt-1 text-sm leading-6'>
                  {_(
                    'You can close this panel and keep reading. Progress will be here when you return.',
                  )}
                </p>
              </div>
            </div>
            {machine.error && (
              <div className='alert alert-warning mt-4 text-sm' role='status'>
                <AlertTriangle className='size-4' />
                <span>{machine.error}</span>
              </div>
            )}
            {machine.generation && (
              <button
                type='button'
                className='btn btn-ghost mt-4 min-h-11 w-full'
                disabled={machine.operation === 'cancelling'}
                onClick={() => void handleCancel()}
              >
                <Ban className='size-4' />
                {machine.operation === 'cancelling' ? _('Cancelling…') : _('Cancel generation')}
              </button>
            )}
          </section>
        )}

        {status === 'failed' && (
          <section className='p-5' role='alert'>
            <div className='border-error/30 bg-error/5 rounded-lg border p-4'>
              <h3 className='flex items-center gap-2 font-semibold'>
                <AlertTriangle className='text-error size-5' />
                {_('This Board could not be completed')}
              </h3>
              <p className='mt-2 text-sm leading-6'>
                {_(getFailureMessage(machine.generation?.failureReason))}
              </p>
              <p className='mt-2 text-sm font-medium'>{_('Your Chalk was refunded.')}</p>
              <button
                type='button'
                className='btn btn-primary mt-4 min-h-11 w-full'
                disabled={isBusy}
                onClick={() => void handleRetry()}
              >
                <RefreshCw className='size-4' />
                {machine.operation === 'retrying' ? _('Retrying…') : _('Try again')}
              </button>
            </div>
          </section>
        )}

        {status === 'cancelled' && (
          <section className='p-5' role='status'>
            <div className='border-base-300 bg-base-100 rounded-lg border p-4'>
              <h3 className='font-semibold'>{_('Generation cancelled')}</h3>
              <p className='mt-2 text-sm leading-6'>
                {_('Nothing was saved from the incomplete generation. Your Chalk was refunded.')}
              </p>
              <button
                type='button'
                className='btn btn-primary mt-4 min-h-11 w-full'
                disabled={isBusy}
                onClick={() => void handleRetry()}
              >
                <RefreshCw className='size-4' />
                {machine.operation === 'retrying' ? _('Retrying…') : _('Start again')}
              </button>
            </div>
          </section>
        )}

        {status === 'completed' && machine.board && (
          <>
            <section className='border-base-300 border-b p-4'>
              <div className='flex flex-wrap items-end gap-3'>
                <label
                  className='min-w-0 flex-1 text-xs font-semibold'
                  htmlFor='learningbored-kind'
                >
                  <span className='text-base-content/60 mb-1 block uppercase tracking-wide'>
                    {_('Board shape')}
                  </span>
                  <select
                    id='learningbored-kind'
                    className='select select-bordered select-sm w-full min-w-40'
                    value={selectedKind ?? machine.board.kind}
                    disabled={machine.operation === 'rerendering'}
                    onChange={(event) =>
                      void handleKindChange(event.target.value as LearningBoredBoardKind)
                    }
                  >
                    {LEARNINGBORED_BOARD_KINDS.map((kind) => (
                      <option key={kind} value={kind}>
                        {_(BOARD_KIND_LABELS[kind])}
                      </option>
                    ))}
                  </select>
                </label>
                <label className='flex min-h-10 cursor-pointer items-center gap-2 text-sm'>
                  <input
                    type='checkbox'
                    className='toggle toggle-sm toggle-primary'
                    checked={session.showScaffold}
                    disabled={machine.operation === 'rerendering'}
                    onChange={(event) => void handleScaffoldChange(event.target.checked)}
                  />
                  {_('Added help')}
                </label>
              </div>
              {machine.operation === 'rerendering' && (
                <p
                  className='text-base-content/60 mt-2 flex items-center gap-2 text-xs'
                  role='status'
                >
                  <Clock3 className='size-3' aria-hidden='true' />
                  {_('Updating the Board view…')}
                </p>
              )}
            </section>

            <section className='border-base-300 border-b p-4'>
              <h3 className='text-lg font-semibold leading-7'>{machine.board.title}</h3>
              {sanitizedSvg && (
                <div
                  className='learningbored-svg bg-base-100 border-base-300 mt-4 hidden overflow-auto rounded-lg border p-2 sm:block'
                  onMouseOver={(event) => {
                    const span = sourceSpanFromElement(event.target);
                    if (span) onSourceSpanEnter?.(span);
                  }}
                  onMouseOut={(event) => {
                    if (sourceSpanFromElement(event.target)) onSourceSpanLeave?.();
                  }}
                  onFocusCapture={(event) => {
                    const span = sourceSpanFromElement(event.target);
                    if (span) onSourceSpanEnter?.(span);
                  }}
                  onBlurCapture={onSourceSpanLeave}
                  dangerouslySetInnerHTML={{ __html: sanitizedSvg }}
                />
              )}

              <ol className='mt-4 space-y-3' aria-label={_('Board text outline')}>
                {visibleOutline.map((item) => (
                  <li
                    key={item.id}
                    className={`border-base-300 bg-base-100 overflow-hidden rounded-lg border ${
                      item.provenance === 'scaffold' ? 'ms-4 w-[calc(100%-1rem)] border-dashed' : ''
                    }`}
                  >
                    <SourceInteractionButton
                      span={item.sourceSpan}
                      onEnter={onSourceSpanEnter}
                      onLeave={onSourceSpanLeave}
                      className='focus-visible:ring-primary block w-full p-3 text-left focus:outline-none focus-visible:ring-2'
                    >
                      <span className='block text-sm font-semibold'>{item.label}</span>
                      {(item.kind === 'relationship' || item.kind === 'group') && (
                        <span className='text-base-content/60 mt-1 block text-xs font-medium'>
                          {_(item.kind === 'relationship' ? 'Relationship' : 'Group')}
                        </span>
                      )}
                      {item.provenance === 'scaffold' && (
                        <span className='text-base-content/60 mt-1 block text-xs font-medium'>
                          {_('Added to help')}
                          {item.scaffoldForm ? ` · ${_(item.scaffoldForm.replace('_', ' '))}` : ''}
                        </span>
                      )}
                      <span className='text-base-content/80 mt-1 block text-sm leading-6'>
                        {item.description}
                      </span>
                      {item.analogyLimit && (
                        <span className='border-base-300 mt-2 block border-t pt-2 text-xs leading-5'>
                          <strong>{_('Where the analogy stops:')}</strong> {item.analogyLimit}
                        </span>
                      )}
                      {item.undefined && (
                        <span className='border-warning/40 bg-warning/5 mt-2 block rounded border px-2 py-1 text-xs leading-5'>
                          {_('Named but not defined in the passage')}
                        </span>
                      )}
                      {item.figureFailed && (
                        <span className='text-base-content/70 mt-2 block text-xs'>
                          {_('Illustration unavailable. The structural explanation remains.')}
                        </span>
                      )}
                    </SourceInteractionButton>
                    {item.labels && item.labels.length > 0 && (
                      <ol
                        className='border-base-300 space-y-1 border-t px-3 py-2 text-xs'
                        aria-label={_('Figure labels')}
                      >
                        {item.labels.map((label, index) => (
                          <li key={label.id}>
                            <SourceInteractionButton
                              span={label.sourceSpan}
                              onEnter={onSourceSpanEnter}
                              onLeave={onSourceSpanLeave}
                              className='focus-visible:ring-primary rounded text-left focus:outline-none focus-visible:ring-2'
                            >
                              <strong>
                                {index + 1}. {label.text}:
                              </strong>{' '}
                              {label.description}
                            </SourceInteractionButton>
                          </li>
                        ))}
                      </ol>
                    )}
                  </li>
                ))}
              </ol>
            </section>

            {visibleFigures.length > 0 && (
              <section className='border-base-300 space-y-4 border-b p-4'>
                <h3 className='text-sm font-semibold'>{_('Figures')}</h3>
                {visibleFigures.map((figure) => (
                  <BoardFigure
                    key={figure.id}
                    figure={figure}
                    onSourceSpanEnter={onSourceSpanEnter}
                    onSourceSpanLeave={onSourceSpanLeave}
                    onReplace={() => openFigureRegeneration(figure)}
                    replaceDisabled={
                      !client || figureRegenerationActive || figureRegenerationSubmitting
                    }
                  />
                ))}

                {figureRegenerationDraft && (
                  <div
                    className='border-primary/30 bg-base-100 space-y-3 rounded-lg border p-4'
                    role='dialog'
                    aria-labelledby='learningbored-replace-figure-title'
                  >
                    <div>
                      <h4 id='learningbored-replace-figure-title' className='font-semibold'>
                        {_('Replace this figure?')}
                      </h4>
                      <p className='text-base-content/70 mt-1 text-sm leading-6'>
                        {_(
                          'This uses 1 Chalk. Your current figure stays visible until the replacement passes every check.',
                        )}
                      </p>
                    </div>
                    <label className='block text-sm font-medium'>
                      {_('What should improve?')}
                      <select
                        className='select select-bordered mt-1 w-full'
                        value={figureRegenerationDraft.issue}
                        disabled={figureRegenerationSubmitting}
                        onChange={(event) =>
                          setFigureRegenerationDraft((current) =>
                            current
                              ? {
                                  ...current,
                                  issue: event.target.value as LearningBoredFigureRegenerationIssue,
                                }
                              : null,
                          )
                        }
                      >
                        {LEARNINGBORED_FIGURE_REGENERATION_ISSUES.map((issue) => (
                          <option key={issue} value={issue}>
                            {_(FIGURE_REGENERATION_ISSUE_LABELS[issue])}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className='flex justify-end gap-2'>
                      <button
                        type='button'
                        className='btn btn-ghost min-h-11'
                        disabled={figureRegenerationSubmitting}
                        onClick={() => setFigureRegenerationDraft(null)}
                      >
                        {_('Keep current figure')}
                      </button>
                      <button
                        type='button'
                        className='btn btn-primary min-h-11'
                        disabled={figureRegenerationSubmitting}
                        onClick={() => void confirmFigureRegeneration()}
                      >
                        {figureRegenerationSubmitting
                          ? _('Starting replacement…')
                          : _(`Use ${FIGURE_REGENERATION_CHALK_COST} Chalk`)}
                      </button>
                    </div>
                  </div>
                )}

                {figureRegeneration && (
                  <div
                    className='border-base-300 bg-base-100 rounded-lg border p-4'
                    aria-live='polite'
                  >
                    <h4 className='font-semibold'>
                      {_(figureRegenerationLabel(figureRegeneration.status))}
                    </h4>
                    {isActiveFigureRegeneration(figureRegeneration) && (
                      <p className='text-base-content/70 mt-1 text-sm leading-6'>
                        {_(
                          'The current figure remains available while the replacement is checked.',
                        )}
                      </p>
                    )}
                    {figureRegeneration.status === 'completed' && (
                      <p className='text-success mt-1 text-sm'>
                        {_(`${figureRegeneration.chalkCost} Chalk charged exactly once.`)}
                      </p>
                    )}
                    {(figureRegeneration.status === 'failed' ||
                      figureRegeneration.status === 'cancelled') && (
                      <p className='text-base-content/70 mt-1 text-sm leading-6'>
                        {figureRegeneration.failureReason}{' '}
                        {figureRegeneration.refundConfirmed
                          ? _('Your Chalk was refunded. The previous figure is unchanged.')
                          : ''}
                      </p>
                    )}
                  </div>
                )}

                {figureRegenerationError && (
                  <p className='text-error text-sm' role='alert'>
                    {figureRegenerationError}
                  </p>
                )}
              </section>
            )}

            <section className='border-base-300 border-b p-4'>
              <h3 className='text-sm font-semibold'>{_('Recall preview')}</h3>
              <p className='text-base-content/60 mt-1 text-xs'>
                {_('These questions will be ready for review. Answers are not shown here.')}
              </p>
              {machine.board.recallQuestions.length > 0 ? (
                <>
                  <ol className='mt-3 space-y-2'>
                    {machine.board.recallQuestions.map((item, index) => (
                      <li
                        key={item.id}
                        className='bg-base-100 border-base-300 rounded-lg border p-3 text-sm'
                      >
                        <span className='text-base-content/60 me-2 font-semibold'>
                          {index + 1}.
                        </span>
                        {item.question}
                      </li>
                    ))}
                  </ol>
                  {onStartReview && (
                    <button
                      type='button'
                      className='btn btn-primary mt-3 min-h-12 w-full'
                      disabled={!client}
                      onClick={() => {
                        const boardDocumentId = machine.board?.documentId;
                        if (boardDocumentId) onStartReview(boardDocumentId);
                      }}
                    >
                      <BookOpenText className='size-4' />
                      {_('Start review')}
                    </button>
                  )}
                </>
              ) : (
                <p className='text-base-content/60 mt-3 text-sm'>
                  {_('No recall questions were created.')}
                </p>
              )}
            </section>

            {client ? (
              <LearningBoredComprehensionPrompt boardId={machine.board.id} client={client} />
            ) : null}

            <section className='p-4'>
              <div className='grid grid-cols-2 gap-2'>
                <button
                  type='button'
                  className='btn btn-outline min-h-11'
                  disabled={!client || !onOpenProgress}
                  onClick={() => onOpenProgress?.(machine.board!.documentId)}
                >
                  <BarChart3 className='size-4' />
                  {_('Progress')}
                </button>
                <button
                  type='button'
                  className='btn btn-ghost min-h-11'
                  disabled={!client || machine.operation === 'feedback'}
                  aria-expanded={reportOpen}
                  onClick={() => setReportOpen((current) => !current)}
                >
                  <Flag className='size-4' />
                  {_('Report')}
                </button>
              </div>

              {reportOpen && (
                <form
                  className='border-base-300 bg-base-100 mt-3 space-y-3 rounded-lg border p-3'
                  onSubmit={(event) => {
                    event.preventDefault();
                    void sendFeedback(reportCategory, reportComment);
                  }}
                >
                  <label className='block text-sm font-medium'>
                    {_('What needs attention?')}
                    <select
                      className='select select-bordered mt-1 w-full'
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
                  <label className='block text-sm font-medium'>
                    {_('Details (optional)')}
                    <textarea
                      className='textarea textarea-bordered mt-1 min-h-20 w-full'
                      maxLength={4_000}
                      value={reportComment}
                      onChange={(event) => setReportComment(event.target.value)}
                    />
                  </label>
                  <button
                    type='submit'
                    className='btn btn-primary min-h-11 w-full'
                    disabled={machine.operation === 'feedback'}
                  >
                    <Send className='size-4' />
                    {_('Send report')}
                  </button>
                </form>
              )}

              {machine.feedbackMessage && (
                <p className='text-success mt-3 flex items-center gap-2 text-sm' role='status'>
                  <Check className='size-4' />
                  {machine.feedbackMessage}
                </p>
              )}
              {machine.error && (
                <p className='text-error mt-3 text-sm' role='alert'>
                  {machine.error}
                </p>
              )}
            </section>
          </>
        )}

        {status === 'completed' && !machine.board && (
          <section className='p-5' role='alert'>
            <h3 className='font-semibold'>{_('The Board is not available yet')}</h3>
            <p className='text-base-content/70 mt-2 text-sm leading-6'>
              {_(
                'The generation finished, but its result could not be loaded. Try again in a moment.',
              )}
            </p>
          </section>
        )}
      </div>

      {(!status || isLearningBoredTerminalStatus(status)) && (
        <footer className='border-base-300 bg-base-100 shrink-0 border-t p-3'>
          <button
            type='button'
            className='btn btn-ghost text-error min-h-11 w-full'
            onClick={onClear}
          >
            {status === 'completed'
              ? _('Remove this Board from the reader')
              : _('Clear captured passage')}
          </button>
        </footer>
      )}
    </aside>
  );
};

export default LearningBoredCapturePanel;
