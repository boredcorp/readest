'use client';

import { ArrowLeft, BookOpenText, RefreshCw, X } from 'lucide-react';
import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type {
  LearningBoredBoardResult,
  LearningBoredClient,
  LearningBoredDocumentSummary,
  LearningBoredMasteryResult,
  LearningBoredMasteryTier,
  LearningBoredReadinessResult,
} from './client';
import { LearningBoredConceptList, LearningBoredMasterySummary } from './LearningBoredMastery';
import type { LearningBoredExamOverlayProps } from './LearningBoredExamOverlay';
import { useLearningBoredTranslation } from './presentation/context';

type LearningBoredExamOverlayModule = {
  default: React.ComponentType<LearningBoredExamOverlayProps>;
};

function loadLearningBoredExamOverlay(): Promise<LearningBoredExamOverlayModule> {
  return import('./LearningBoredExamOverlay');
}

const PROGRESS_STYLES = `
  .learningbored-progress {
    --lb-progress-paper: #faf7f0;
    --lb-progress-raised: #fffdf8;
    --lb-progress-recessed: #eee7da;
    --lb-progress-border: #d8cdbd;
    --lb-progress-ink: #172633;
    --lb-progress-muted: #586873;
    --lb-progress-focus: #0d6870;
    --lb-mastery-new: #6f7a87;
    --lb-mastery-learning: #a8620d;
    --lb-mastery-retained: #256b47;
    --lb-mastery-lapsed: #9c3f2c;
    background: var(--lb-progress-paper);
    border-color: var(--lb-progress-border);
    color: var(--lb-progress-ink);
  }
  .learningbored-progress :is(button, input, summary):focus-visible {
    outline: 3px solid var(--lb-progress-focus);
    outline-offset: 2px;
  }
  .learningbored-mastery-fill-new,
  .learningbored-mastery-marker-new { background: var(--lb-mastery-new); }
  .learningbored-mastery-fill-learning,
  .learningbored-mastery-marker-learning { background: var(--lb-mastery-learning); }
  .learningbored-mastery-fill-retained,
  .learningbored-mastery-marker-retained { background: var(--lb-mastery-retained); }
  .learningbored-mastery-fill-lapsed,
  .learningbored-mastery-marker-lapsed { background: var(--lb-mastery-lapsed); }
  .learningbored-mastery-marker {
    width: 0.75rem;
    height: 0.75rem;
    border: 1px solid var(--lb-progress-ink);
    border-radius: 9999px;
  }
  .learningbored-mastery-card {
    background: var(--lb-progress-raised);
    border-color: var(--lb-progress-border);
    border-left-width: 0.35rem;
  }
  .learningbored-mastery-card-new { border-left-color: var(--lb-mastery-new); }
  .learningbored-mastery-card-learning { border-left-color: var(--lb-mastery-learning); }
  .learningbored-mastery-card-retained { border-left-color: var(--lb-mastery-retained); }
  .learningbored-mastery-card-lapsed { border-left-color: var(--lb-mastery-lapsed); }
  .learningbored-mastery-card-new .learningbored-mastery-tier { border-style: dotted; }
  .learningbored-mastery-card-learning .learningbored-mastery-tier { border-style: dashed; }
  .learningbored-mastery-card-retained .learningbored-mastery-tier { border-style: solid; }
  .learningbored-mastery-card-lapsed .learningbored-mastery-tier { border-style: double; }
`;

interface ProgressData {
  document: LearningBoredDocumentSummary;
  mastery: LearningBoredMasteryResult;
  readiness: LearningBoredReadinessResult | null;
}

interface BoardDrillInState {
  boardId: string;
  board: LearningBoredBoardResult | null;
  loading: boolean;
  error: string | null;
}

export interface LearningBoredProgressPanelProps {
  client: LearningBoredClient;
  documentId: string;
  onClose: () => void;
  onStartReview: (documentId: string, conceptId: string) => void;
  /** Test seam proving the optional overlay chunk is not requested for ordinary documents. */
  loadExamOverlay?: () => Promise<LearningBoredExamOverlayModule>;
}

const LearningBoredProgressPanel: React.FC<LearningBoredProgressPanelProps> = ({
  client,
  documentId,
  onClose,
  onStartReview,
  loadExamOverlay = loadLearningBoredExamOverlay,
}) => {
  const _ = useLearningBoredTranslation();
  const translateRef = useRef(_);
  translateRef.current = _;
  const [data, setData] = useState<ProgressData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadRevision, setLoadRevision] = useState(0);
  const [boardDrillIn, setBoardDrillIn] = useState<BoardDrillInState | null>(null);
  const [selectedTier, setSelectedTier] = useState<LearningBoredMasteryTier | null>(null);
  const LearningBoredExamOverlay = useMemo(() => lazy(loadExamOverlay), [loadExamOverlay]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const [document, mastery] = await Promise.all([
          client.getDocument(documentId, { signal: controller.signal }),
          client.getDocumentMastery(documentId, { signal: controller.signal }),
        ]);
        if (controller.signal.aborted) return;

        const readiness =
          document.blueprintId === null
            ? null
            : await client.getDocumentReadiness(documentId, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setData({ document, mastery, readiness });
      } catch (loadError) {
        if (loadError instanceof Error && loadError.name === 'AbortError') return;
        setError(translateRef.current('Your progress could not be loaded. Please try again.'));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [client, documentId, loadRevision]);

  const openBoard = useCallback(
    async (boardId: string) => {
      setBoardDrillIn({ boardId, board: null, loading: true, error: null });
      try {
        const board = await client.getBoard(boardId, { includeScaffold: true });
        setBoardDrillIn((current) =>
          current?.boardId === boardId ? { boardId, board, loading: false, error: null } : current,
        );
      } catch {
        setBoardDrillIn((current) =>
          current?.boardId === boardId
            ? {
                boardId,
                board: null,
                loading: false,
                error: translateRef.current('That Board could not be opened. Please try again.'),
              }
            : current,
        );
      }
    },
    [client],
  );

  if (boardDrillIn) {
    return (
      <aside
        aria-label={_('LearningBored Board drill-in')}
        className='learningbored-progress relative z-10 flex h-[44dvh] w-full shrink-0 flex-col border-t sm:h-full sm:w-[clamp(360px,32vw,520px)] sm:border-l sm:border-t-0'
      >
        <style>{PROGRESS_STYLES}</style>
        <header className='flex min-h-14 items-center justify-between gap-3 border-b border-[var(--lb-progress-border)] px-3'>
          <button
            type='button'
            className='btn btn-ghost btn-sm min-h-11'
            onClick={() => setBoardDrillIn(null)}
          >
            <ArrowLeft className='size-4' />
            {_('Back to progress')}
          </button>
          <button
            type='button'
            className='btn btn-ghost btn-sm min-h-11 min-w-11'
            aria-label={_('Close progress')}
            onClick={onClose}
          >
            <X className='size-5' />
          </button>
        </header>
        <div className='flex-1 overflow-y-auto p-5'>
          {boardDrillIn.loading ? (
            <p role='status' className='flex items-center gap-3'>
              <span className='loading loading-spinner' /> {_('Opening Board…')}
            </p>
          ) : boardDrillIn.error ? (
            <div>
              <p role='alert'>{boardDrillIn.error}</p>
              <button
                type='button'
                className='btn mt-4 min-h-11'
                onClick={() => void openBoard(boardDrillIn.boardId)}
              >
                <RefreshCw className='size-4' /> {_('Try again')}
              </button>
            </div>
          ) : boardDrillIn.board ? (
            <article>
              <p className='text-xs font-semibold uppercase tracking-[0.12em] text-[var(--lb-progress-muted)]'>
                {_('Board outline')}
              </p>
              <h2 className='mt-2 text-2xl font-semibold'>{boardDrillIn.board.title}</h2>
              <ol className='mt-5 space-y-3'>
                {boardDrillIn.board.outline.map((item) => (
                  <li
                    key={item.id}
                    className='rounded-xl border border-[var(--lb-progress-border)] bg-[var(--lb-progress-raised)] p-4'
                  >
                    <div className='flex items-start justify-between gap-3'>
                      <h3 className='font-semibold'>{item.label}</h3>
                      <span className='rounded-full border px-2 py-1 text-xs'>
                        {item.provenance === 'scaffold'
                          ? _('Added explanation')
                          : _('From passage')}
                      </span>
                    </div>
                    <p className='mt-2 text-sm leading-6'>{item.description}</p>
                  </li>
                ))}
              </ol>
            </article>
          ) : null}
        </div>
      </aside>
    );
  }

  return (
    <aside
      aria-label={_('LearningBored progress panel')}
      className='learningbored-progress relative z-10 flex h-[44dvh] w-full shrink-0 flex-col border-t sm:h-full sm:w-[clamp(360px,32vw,520px)] sm:border-l sm:border-t-0'
    >
      <style>{PROGRESS_STYLES}</style>
      <header className='flex min-h-14 items-center justify-between gap-3 border-b border-[var(--lb-progress-border)] px-4'>
        <div className='flex min-w-0 items-center gap-2'>
          <BookOpenText className='size-5 shrink-0 text-[var(--lb-progress-focus)]' />
          <div className='min-w-0'>
            <h1 className='truncate font-semibold'>{_('LearningBored progress')}</h1>
            {data ? (
              <p className='truncate text-xs text-[var(--lb-progress-muted)]'>
                {data.document.title}
              </p>
            ) : null}
          </div>
        </div>
        <button
          type='button'
          className='btn btn-ghost btn-sm min-h-11 min-w-11'
          aria-label={_('Close progress')}
          onClick={onClose}
        >
          <X className='size-5' />
        </button>
      </header>

      <div className='flex-1 overflow-y-auto p-5'>
        {loading ? (
          <p role='status' className='flex items-center gap-3'>
            <span className='loading loading-spinner' /> {_('Loading your progress…')}
          </p>
        ) : error ? (
          <div>
            <p role='alert'>{error}</p>
            <button
              type='button'
              className='btn mt-4 min-h-11'
              onClick={() => setLoadRevision((revision) => revision + 1)}
            >
              <RefreshCw className='size-4' /> {_('Try again')}
            </button>
          </div>
        ) : data ? (
          <>
            <LearningBoredMasterySummary
              mastery={data.mastery}
              selectedTier={selectedTier}
              onSelectTier={setSelectedTier}
            />
            <LearningBoredConceptList
              concepts={
                selectedTier === null
                  ? data.mastery.concepts
                  : data.mastery.concepts.filter((concept) => concept.tier === selectedTier)
              }
              onOpenBoard={(boardId) => void openBoard(boardId)}
              onStartReview={(conceptId) => onStartReview(documentId, conceptId)}
            />
            {data.document.blueprintId !== null && data.readiness ? (
              <div className='mt-8 border-t border-[var(--lb-progress-border)] pt-6'>
                <Suspense
                  fallback={
                    <p role='status' className='flex items-center gap-3'>
                      <span className='loading loading-spinner' /> {_('Loading exam progress…')}
                    </p>
                  }
                >
                  <LearningBoredExamOverlay
                    client={client}
                    document={data.document}
                    mastery={data.mastery}
                    readiness={data.readiness}
                    onOpenBoard={(boardId) => void openBoard(boardId)}
                    onStartReview={(conceptId) => onStartReview(documentId, conceptId)}
                  />
                </Suspense>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </aside>
  );
};

export default LearningBoredProgressPanel;
