'use client';

import { BookOpenText } from 'lucide-react';
import { useMemo, useState } from 'react';

import type {
  LearningBoredBoardKind,
  LearningBoredComprehensionOutcome,
  LearningBoredFigureRegenerationIssue,
  LearningBoredSourceSpan,
} from '../client';
import LearningBoredBoardSurface from '../work-surface/LearningBoredBoardSurface';
import LearningBoredProgressPanel from '../LearningBoredProgressPanel';
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
import LearningBoredReviewSurfaceShell from '../work-surface/LearningBoredReviewSurfaceShell';
import LearningBoredWorkSurfaceShell, {
  learningBoredWorkSurfaceStyles,
} from '../work-surface/LearningBoredWorkSurfaceShell';
import type { LearningBoredPreviewStateId, LearningBoredPreviewTheme } from './contract';
import styles from './LearningBoredPreview.module.css';
import {
  LEARNINGBORED_PREVIEW_BOARD,
  LEARNINGBORED_PREVIEW_FIGURE_REPLACEMENT,
  LEARNINGBORED_PREVIEW_PASSAGE,
  LEARNINGBORED_PREVIEW_PASSAGE_TEXT,
  LEARNINGBORED_PREVIEW_SECOND_FIGURE,
  createLearningBoredStudyPanelPreviewClient,
  getLearningBoredPreviewBoard,
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
  const panelClient = useMemo(createLearningBoredStudyPanelPreviewClient, []);
  const generationState = generationStates[stateId];
  const isProgress = stateId === 'progress-overview';
  const isReview = stateId === 'review-topology';
  const stageLabel = useMemo(() => {
    if (generationState?.kind === 'active') return generationState.label;
    if (stateId.startsWith('capture-')) return 'Passage captured';
    if (stateId.startsWith('board-')) return 'Board ready';
    if (stateId.startsWith('figure-')) return 'Figure resilience';
    if (stateId.startsWith('comprehension-')) return 'Comprehension check';
    if (isReview) return 'Review topology';
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
          loadExamOverlay={() =>
            Promise.reject(new Error('The deterministic document has no exam blueprint.'))
          }
          onClose={closePanel}
          onStartReview={(_documentId, conceptId) =>
            onAction(`Opened deterministic review for ${conceptId}.`)
          }
        />
      ) : panelOpen && isReview ? (
        <LearningBoredReviewSurfaceShell
          onClose={closePanel}
          statusMessage='Review topology fixture ready.'
          subtitle='From this Board'
        >
          <section className={styles['reviewTopology']} aria-labelledby='preview-review-title'>
            <p>Ready when you are</p>
            <h2 id='preview-review-title'>0 questions are due now.</h2>
            <p>
              Review content migration belongs to §7. This state proves only the production Review
              surface topology, with no queue, answer, grade, or retry-outbox controller mounted.
            </p>
            <button className='btn min-h-11' disabled type='button'>
              Nothing available right now
            </button>
          </section>
        </LearningBoredReviewSurfaceShell>
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
