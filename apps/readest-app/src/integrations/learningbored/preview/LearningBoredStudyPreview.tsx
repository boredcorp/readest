'use client';

import { BookOpenText } from 'lucide-react';
import { useMemo, useState } from 'react';

import type {
  LearningBoredBoardKind,
  LearningBoredComprehensionOutcome,
  LearningBoredFigureRegenerationIssue,
  LearningBoredReviewGrade,
  LearningBoredSourceSpan,
} from '../client';
import LearningBoredBoardSurface from '../work-surface/LearningBoredBoardSurface';
import LearningBoredProgressPanel from '../LearningBoredProgressPanel';
import LearningBoredReviewPanel, {
  LearningBoredReviewPresentation,
  type LearningBoredReviewPresentationActions,
  type LearningBoredReviewViewState,
} from '../LearningBoredReviewPanel';
import LearningBoredComprehensionState, {
  type LearningBoredComprehensionViewState,
} from '../work-surface/LearningBoredComprehensionState';
import LearningBoredFigureSurface, {
  LearningBoredFigureReplacementState,
  type LearningBoredFigureRegenerationDraftView,
} from '../work-surface/LearningBoredFigureSurface';
import LearningBoredGenerationState, {
  type LearningBoredGenerationViewState,
} from '../work-surface/LearningBoredGenerationState';
import LearningBoredWorkSurfaceShell, {
  learningBoredWorkSurfaceStyles,
} from '../work-surface/LearningBoredWorkSurfaceShell';
import type { LearningBoredPreviewStateId, LearningBoredPreviewTheme } from './contract';
import styles from './LearningBoredPreview.module.css';
import {
  createLearningBoredReviewPreviewClient,
  createLearningBoredReviewPreviewOutboxStore,
  createLearningBoredReviewPreviewViewState,
} from './review-fixtures';
import {
  LEARNINGBORED_PREVIEW_BOARD,
  LEARNINGBORED_PREVIEW_FIGURE_REPLACEMENT,
  LEARNINGBORED_PREVIEW_PASSAGE,
  LEARNINGBORED_PREVIEW_PASSAGE_TEXT,
  LEARNINGBORED_PREVIEW_SECOND_FIGURE,
  createLearningBoredStudyPanelPreviewClient,
  getLearningBoredPreviewBoard,
  type LearningBoredStudyPanelPreviewMode,
} from './study-fixtures';

type PreviewAction = (message: string) => void;

const generationStates: Partial<
  Record<LearningBoredPreviewStateId, LearningBoredGenerationViewState>
> = {
  'capture-ready': { kind: 'ready', connected: true },
  'capture-pdf-unavailable': {
    kind: 'ready',
    connected: false,
    error:
      'Board it is unavailable for PDF selections because this Reader cannot guarantee exact source text yet.',
  },
  'generation-starting': {
    kind: 'active',
    label: 'Starting your Board',
    canCancel: false,
  },
  'generation-queued': { kind: 'active', label: 'Waiting to begin', canCancel: true },
  'generation-extracting': {
    kind: 'active',
    label: 'Reading the passage',
    canCancel: true,
  },
  'generation-composing': {
    kind: 'active',
    label: 'Drawing the Board and writing questions',
    canCancel: true,
  },
  'generation-illustrating': { kind: 'active', label: 'Illustrating', canCancel: true },
  'generation-rendering': {
    kind: 'active',
    label: 'Finishing the Board',
    canCancel: true,
  },
  'generation-poll-error': {
    kind: 'active',
    label: 'Finishing the Board',
    canCancel: true,
    error:
      'The latest status could not be loaded. Showing the last confirmed stage while we retry.',
  },
  'generation-cancelled-refunded': { kind: 'cancelled' },
  'generation-failed-refunded': {
    kind: 'failed',
    message: 'This Board could not be completed because a grounding check failed.',
  },
  'generation-retry-recovery': {
    kind: 'active',
    label: 'Retry queued',
    canCancel: true,
  },
};

function ReaderBook({
  highlightedSpan,
  panelOpen,
  onReopen,
}: {
  highlightedSpan: LearningBoredSourceSpan | null;
  panelOpen: boolean;
  onReopen: () => void;
}) {
  return (
    <article
      aria-label='Fictional Reader book'
      className={styles['readerBook']}
      data-lb-preview-book='true'
      data-lb-reading-position='chapter-2-page-17'
    >
      <header className={styles['readerToolbar']}>
        <strong>A fictional waterworks lesson</strong>
        {panelOpen ? (
          <span className={styles['readerLocation']}>Page 17 of 28</span>
        ) : (
          <button
            className={`${styles['button']} ${styles['button-secondary']}`}
            onClick={onReopen}
            type='button'
          >
            <BookOpenText aria-hidden='true' />
            Reopen LearningBored
          </button>
        )}
      </header>
      <div className={styles['readerViewport']}>
        <div className={styles['readerPage']}>
          <h3>Flow through a settling chamber</h3>
          <p>
            This fictional note introduces a generic piece of teaching apparatus.{' '}
            <mark
              data-lb-source-active={highlightedSpan ? 'true' : 'false'}
              data-lb-source-end={highlightedSpan?.sourceEnd}
              data-lb-source-start={highlightedSpan?.sourceStart}
            >
              {LEARNINGBORED_PREVIEW_PASSAGE_TEXT}
            </mark>{' '}
            The next section compares the outlet with a different unbranded example.
          </p>
        </div>
      </div>
    </article>
  );
}

function GenerationFixture({
  state,
  onAction,
}: {
  state: LearningBoredGenerationViewState;
  onAction: PreviewAction;
}) {
  const [viewState, setViewState] = useState(state);
  const [retryFailureShown, setRetryFailureShown] = useState(false);

  const retry = () => {
    if (viewState.kind === 'failed' && !retryFailureShown) {
      setRetryFailureShown(true);
      setViewState({
        ...viewState,
        error: 'The retry could not be started. Check your connection and try again.',
      });
      onAction('Announced the deterministic retry request failure.');
      return;
    }
    setViewState({ kind: 'active', label: 'Retry queued', canCancel: true });
    onAction('Retry queued for the deterministic fixture.');
  };

  return (
    <LearningBoredGenerationState
      onCancel={() => onAction('Cancelled the deterministic fixture generation.')}
      onRetry={retry}
      onStart={() => onAction('Started one deterministic fixture generation request.')}
      state={viewState}
    />
  );
}

function BoardFixture({
  showSvg,
  onAction,
  onSourceSpanEnter,
  onSourceSpanLeave,
  theme,
}: {
  showSvg: boolean;
  onAction: PreviewAction;
  onSourceSpanEnter: (span: LearningBoredSourceSpan) => void;
  onSourceSpanLeave: () => void;
  theme: LearningBoredPreviewTheme;
}) {
  const [selectedKind, setSelectedKind] = useState<LearningBoredBoardKind>('process_flow');
  const [showScaffold, setShowScaffold] = useState(true);
  const themedBoard = getLearningBoredPreviewBoard(theme);
  const board = showSvg
    ? themedBoard
    : {
        ...themedBoard,
        figures: [...themedBoard.figures, LEARNINGBORED_PREVIEW_SECOND_FIGURE],
        svg: null,
        svgWithoutScaffold: null,
      };

  return (
    <>
      {!showSvg ? (
        <p className={learningBoredWorkSurfaceStyles['warning']} role='status'>
          Board visual unavailable. The complete outline and Figure description remain below.
        </p>
      ) : null}
      <LearningBoredBoardSurface
        board={board}
        droppedClaimCount={2}
        onKindChange={(kind) => {
          setSelectedKind(kind);
          onAction(`Changed the deterministic Board shape to ${kind} without a request.`);
        }}
        onOpenProgress={() => onAction('Opened deterministic progress.')}
        onReport={() => onAction('Opened the deterministic report task.')}
        onReplaceFigure={() => onAction('Opened deterministic Figure replacement.')}
        onScaffoldChange={(visible) => {
          setShowScaffold(visible);
          onAction('Toggled added help locally without a request.');
        }}
        onSourceSpanEnter={onSourceSpanEnter}
        onSourceSpanLeave={onSourceSpanLeave}
        onStartReview={() => onAction('Opened deterministic review.')}
        selectedKind={selectedKind}
        showScaffold={showScaffold}
      />
    </>
  );
}

function FigureFixture({ stateId, onAction }: { stateId: string; onAction: PreviewAction }) {
  const sourceFigure = LEARNINGBORED_PREVIEW_BOARD.figures[0];
  const [issue, setIssue] = useState<LearningBoredFigureRegenerationIssue>('unclear');

  if (!sourceFigure) return null;

  const isFallback = stateId === 'figure-load-failure';
  const figure = isFallback
    ? { ...sourceFigure, projectionSvg: null, imageUrl: null, failed: true }
    : sourceFigure;
  const draft: LearningBoredFigureRegenerationDraftView | null =
    stateId === 'figure-replacement-confirm' ? { figure, issue } : null;
  const regeneration =
    stateId === 'figure-replacement-progress'
      ? LEARNINGBORED_PREVIEW_FIGURE_REPLACEMENT.queued
      : stateId === 'figure-replacement-success'
        ? LEARNINGBORED_PREVIEW_FIGURE_REPLACEMENT.completed
        : stateId === 'figure-replacement-failed-refunded'
          ? LEARNINGBORED_PREVIEW_FIGURE_REPLACEMENT.failed
          : null;

  return (
    <>
      <section className={learningBoredWorkSurfaceStyles['section']}>
        <h3 className={learningBoredWorkSurfaceStyles['stateHeading']}>Settling chamber Figure</h3>
        <p className={learningBoredWorkSurfaceStyles['stateCopy']}>{figure.description}</p>
        <LearningBoredFigureSurface
          figure={figure}
          onReplace={() => onAction('Opened the deterministic Figure replacement confirmation.')}
        />
      </section>
      <LearningBoredFigureReplacementState
        draft={draft}
        error={null}
        onConfirm={() => onAction('Confirmed one deterministic one-Chalk Figure replacement.')}
        onDismiss={() => onAction('Kept the current deterministic Figure.')}
        onIssueChange={setIssue}
        regeneration={regeneration}
        submitting={false}
      />
    </>
  );
}

function ComprehensionFixture({ stateId, onAction }: { stateId: string; onAction: PreviewAction }) {
  const initialState: LearningBoredComprehensionViewState =
    stateId === 'comprehension-breakthrough'
      ? { kind: 'answered', outcome: 'breakthrough' }
      : stateId === 'comprehension-still-unclear'
        ? { kind: 'answered', outcome: 'still_unclear' }
        : { kind: 'question', pendingOutcome: null };
  const [state, setState] = useState(initialState);

  const onSubmit = (outcome: LearningBoredComprehensionOutcome) => {
    setState({ kind: 'answered', outcome });
    onAction(`Recorded the deterministic ${outcome} comprehension response.`);
  };

  return <LearningBoredComprehensionState onSubmit={onSubmit} state={state} />;
}

function ReviewFixture({
  stateId,
  onAction,
  onClose,
}: {
  stateId: Extract<LearningBoredPreviewStateId, `review-${string}`>;
  onAction: PreviewAction;
  onClose: () => void;
}) {
  const client = useMemo(
    () => createLearningBoredReviewPreviewClient(stateId === 'review-empty' ? 'empty' : 'ready'),
    [stateId],
  );
  const outboxStore = useMemo(() => createLearningBoredReviewPreviewOutboxStore(), []);
  const [viewState, setViewState] = useState<LearningBoredReviewViewState>(() =>
    createLearningBoredReviewPreviewViewState(stateId),
  );

  if (stateId === 'review-start' || stateId === 'review-empty') {
    return (
      <LearningBoredReviewPanel
        client={client}
        documentId='preview-waterworks'
        onClose={onClose}
        onOpenProgress={() => onAction('Opened deterministic progress from Review.')}
        outboxStore={outboxStore}
      />
    );
  }

  const actions: LearningBoredReviewPresentationActions = {
    onBegin: () => undefined,
    onTryAgain: () => onAction('Retried the deterministic Review read.'),
    onContinue: () => onAction('Continued the deterministic Review page.'),
    onReveal: () => {
      setViewState(createLearningBoredReviewPreviewViewState('review-revealed'));
      onAction('Revealed the deterministic answer through the production presentation seam.');
    },
    onSelectOption: (optionId) => {
      setViewState((current) =>
        current.screen.kind === 'question'
          ? {
              ...current,
              visualState: 'selected-choice',
              statusMessage: 'Choice selected. Reveal the answer when ready.',
              screen: { ...current.screen, selectedOptionId: optionId },
            }
          : current,
      );
      onAction(`Selected deterministic choice ${optionId}.`);
    },
    onGrade: (grade: LearningBoredReviewGrade) =>
      onAction(`Submitted deterministic ${grade} grade.`),
    onSuppress: (category) => onAction(`Removed deterministic question as ${category}.`),
    onRetryGrade: () => onAction('Retried the exact deterministic grade request.'),
    onReloadReview: () => onAction('Reloaded the deterministic Review queue.'),
    onClose,
    onOpenProgress: () => onAction('Opened deterministic progress from Review.'),
  };

  return <LearningBoredReviewPresentation actions={actions} viewState={viewState} />;
}

export default function LearningBoredStudyPreview({
  stateId,
  onAction,
  theme,
}: {
  stateId: LearningBoredPreviewStateId;
  onAction: PreviewAction;
  theme: LearningBoredPreviewTheme;
}) {
  const [panelOpen, setPanelOpen] = useState(true);
  const [highlightedSpan, setHighlightedSpan] = useState<LearningBoredSourceSpan | null>(null);
  const generationState = generationStates[stateId];
  const isProgress = stateId.startsWith('progress-') || stateId.startsWith('readiness-');
  const isReview = stateId.startsWith('review-');
  const progressMode: LearningBoredStudyPanelPreviewMode =
    stateId === 'progress-loading'
      ? 'loading'
      : stateId === 'progress-error'
        ? 'error'
        : stateId === 'progress-empty'
          ? 'empty'
          : stateId === 'progress-board-error'
            ? 'board-error'
            : stateId === 'readiness-objectives'
              ? 'readiness'
              : stateId === 'readiness-not-started'
                ? 'readiness-not-started'
                : 'ready';
  const panelClient = useMemo(
    () => createLearningBoredStudyPanelPreviewClient(progressMode),
    [progressMode],
  );
  const stageLabel = useMemo(() => {
    if (generationState?.kind === 'active') return generationState.label;
    if (stateId.startsWith('capture-')) return 'Passage captured';
    if (stateId.startsWith('board-')) return 'Board ready';
    if (stateId.startsWith('figure-')) return 'Figure resilience';
    if (stateId.startsWith('comprehension-')) return 'Comprehension check';
    if (isReview) return 'Review';
    return 'Progress';
  }, [generationState, isReview, stateId]);
  const closePanel = () => {
    setPanelOpen(false);
    onAction('Closed the deterministic panel without moving the reading position.');
  };

  return (
    <div className={styles['studyScene']} data-lb-preview-study-scene='true'>
      <ReaderBook
        highlightedSpan={highlightedSpan}
        onReopen={() => {
          setPanelOpen(true);
          onAction('Reopened the deterministic LearningBored panel at page 17.');
        }}
        panelOpen={panelOpen}
      />
      {panelOpen && isProgress ? (
        <LearningBoredProgressPanel
          client={panelClient}
          documentId='preview-waterworks'
          initialBoardId={
            stateId === 'progress-board' || stateId === 'progress-board-error'
              ? LEARNINGBORED_PREVIEW_BOARD.id
              : null
          }
          initialSelectedConceptId={
            stateId === 'progress-concept' ? 'preview-concept-settling' : null
          }
          loadExamOverlay={
            stateId.startsWith('readiness-')
              ? () => import('../LearningBoredExamOverlay')
              : () => Promise.reject(new Error('The deterministic document has no exam blueprint.'))
          }
          onClose={closePanel}
          onStartReview={(_documentId, conceptId) =>
            onAction(`Opened deterministic review for ${conceptId}.`)
          }
          theme={theme}
        />
      ) : panelOpen && isReview ? (
        <ReviewFixture
          onAction={onAction}
          onClose={closePanel}
          stateId={stateId as Extract<LearningBoredPreviewStateId, `review-${string}`>}
        />
      ) : panelOpen ? (
        <LearningBoredWorkSurfaceShell
          height='study'
          onClose={closePanel}
          passage={LEARNINGBORED_PREVIEW_PASSAGE}
          passageOpen={stateId.startsWith('capture-')}
          stageLabel={stageLabel}
          theme={theme}
        >
          {generationState ? (
            <GenerationFixture onAction={onAction} state={generationState} />
          ) : null}
          {stateId === 'board-complete' || stateId === 'board-svg-unavailable' ? (
            <BoardFixture
              onAction={onAction}
              onSourceSpanEnter={setHighlightedSpan}
              onSourceSpanLeave={() => setHighlightedSpan(null)}
              showSvg={stateId === 'board-complete'}
              theme={theme}
            />
          ) : null}
          {stateId.startsWith('figure-') ? (
            <FigureFixture onAction={onAction} stateId={stateId} />
          ) : null}
          {stateId.startsWith('comprehension-') ? (
            <ComprehensionFixture onAction={onAction} stateId={stateId} />
          ) : null}
        </LearningBoredWorkSurfaceShell>
      ) : null}
    </div>
  );
}
