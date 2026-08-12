'use client';

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
import {
  type LearningBoredPresentationTheme,
  useLearningBoredPresentationTheme,
  useLearningBoredTranslation,
} from './presentation/context';
import {
  LearningBoredProgressShell,
  LearningBoredProgressStatus,
  learningBoredProgressStyles as styles,
} from './progress/LearningBoredProgressShell';

type LearningBoredExamOverlayModule = {
  default: React.ComponentType<LearningBoredExamOverlayProps>;
};

class LearningBoredOptionalReadinessBoundary extends React.Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function loadLearningBoredExamOverlay(): Promise<LearningBoredExamOverlayModule> {
  return import('./LearningBoredExamOverlay');
}

interface ProgressData {
  document: LearningBoredDocumentSummary;
  mastery: LearningBoredMasteryResult;
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
  /** Deterministic presentation seam; production inherits the Reader presentation theme. */
  theme?: LearningBoredPresentationTheme;
  /** Deterministic presentation seam; production starts with every concept collapsed. */
  initialSelectedConceptId?: string | null;
  /** Deterministic presentation seam; production starts at the progress overview. */
  initialBoardId?: string | null;
}

const LearningBoredProgressPanel: React.FC<LearningBoredProgressPanelProps> = ({
  client,
  documentId,
  onClose,
  onStartReview,
  loadExamOverlay = loadLearningBoredExamOverlay,
  theme: themeOverride,
  initialSelectedConceptId = null,
  initialBoardId = null,
}) => {
  const _ = useLearningBoredTranslation();
  const inheritedTheme = useLearningBoredPresentationTheme();
  const theme = themeOverride ?? inheritedTheme;
  const translateRef = useRef(_);
  translateRef.current = _;
  const initialBoardRequestedRef = useRef(false);
  const [data, setData] = useState<ProgressData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadRevision, setLoadRevision] = useState(0);
  const [readiness, setReadiness] = useState<LearningBoredReadinessResult | null>(null);
  const [readinessLoading, setReadinessLoading] = useState(false);
  const [readinessError, setReadinessError] = useState<string | null>(null);
  const [readinessRevision, setReadinessRevision] = useState(0);
  const [overlayRevision, setOverlayRevision] = useState(0);
  const [boardDrillIn, setBoardDrillIn] = useState<BoardDrillInState | null>(
    initialBoardId ? { boardId: initialBoardId, board: null, loading: true, error: null } : null,
  );
  const [selectedTier, setSelectedTier] = useState<LearningBoredMasteryTier | null>(null);
  const LearningBoredExamOverlay = useMemo(() => {
    void overlayRevision;
    return lazy(loadExamOverlay);
  }, [loadExamOverlay, overlayRevision]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setData(null);

    void (async () => {
      try {
        const [document, mastery] = await Promise.all([
          client.getDocument(documentId, { signal: controller.signal }),
          client.getDocumentMastery(documentId, { signal: controller.signal }),
        ]);
        if (controller.signal.aborted) return;

        setData({ document, mastery });
      } catch (loadError) {
        if (loadError instanceof Error && loadError.name === 'AbortError') return;
        setError(translateRef.current('Your progress could not be loaded. Please try again.'));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [client, documentId, loadRevision]);

  useEffect(() => {
    const controller = new AbortController();
    setReadiness(null);
    setReadinessError(null);

    if (!data || data.document.blueprintId === null) {
      setReadinessLoading(false);
      return () => controller.abort();
    }

    setReadinessLoading(true);
    void client
      .getDocumentReadiness(documentId, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setReadiness(result);
      })
      .catch((loadError: unknown) => {
        if (loadError instanceof Error && loadError.name === 'AbortError') return;
        if (!controller.signal.aborted) {
          setReadinessError(
            translateRef.current(
              'Exam readiness could not be loaded. Concept progress is still available.',
            ),
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setReadinessLoading(false);
      });

    return () => controller.abort();
  }, [client, data, documentId, readinessRevision]);

  const openBoard = useCallback(
    async (boardId: string) => {
      setBoardDrillIn({ boardId, board: null, loading: true, error: null });
      try {
        const board = await client.getBoard(boardId, { includeScaffold: false });
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

  useEffect(() => {
    if (!initialBoardId || initialBoardRequestedRef.current) return;
    initialBoardRequestedRef.current = true;
    void openBoard(initialBoardId);
  }, [initialBoardId, openBoard]);

  if (boardDrillIn) {
    return (
      <LearningBoredProgressShell
        backLabel='Back to progress'
        onBack={() => setBoardDrillIn(null)}
        onClose={onClose}
        theme={theme}
        title='Board outline'
        translate={_}
      >
        {boardDrillIn.loading ? (
          <LearningBoredProgressStatus translate={_}>
            {_('Opening Board…')}
          </LearningBoredProgressStatus>
        ) : boardDrillIn.error ? (
          <LearningBoredProgressStatus
            actionLabel='Try again'
            onAction={() => void openBoard(boardDrillIn.boardId)}
            tone='error'
            translate={_}
          >
            {boardDrillIn.error}
          </LearningBoredProgressStatus>
        ) : boardDrillIn.board ? (
          <article aria-labelledby='learningbored-board-outline-heading'>
            <h2 className={styles['sectionTitle']} id='learningbored-board-outline-heading'>
              {boardDrillIn.board.title}
            </h2>
            <p className={styles['sectionCopy']}>
              {_('Read the grounded outline without depending on its figures.')}
            </p>
            <ol className={styles['boardOutline']}>
              {boardDrillIn.board.outline.map((item) => (
                <li
                  className={styles['boardOutlineItem']}
                  data-provenance={item.provenance}
                  key={item.id}
                >
                  <div className={styles['outlineHeader']}>
                    <h3 className={styles['conceptName']}>{item.label}</h3>
                    <span className={styles['provenance']}>
                      {item.provenance === 'scaffold' ? _('Added explanation') : _('From passage')}
                    </span>
                  </div>
                  <p className={styles['outlineDescription']}>{item.description}</p>
                </li>
              ))}
            </ol>
          </article>
        ) : null}
      </LearningBoredProgressShell>
    );
  }

  return (
    <LearningBoredProgressShell
      onClose={onClose}
      subtitle={data?.document.title}
      theme={theme}
      title='LearningBored progress'
      translate={_}
    >
      {loading ? (
        <LearningBoredProgressStatus translate={_}>
          {_('Loading your progress…')}
        </LearningBoredProgressStatus>
      ) : error ? (
        <LearningBoredProgressStatus
          actionLabel='Try again'
          onAction={() => setLoadRevision((revision) => revision + 1)}
          tone='error'
          translate={_}
        >
          {error}
        </LearningBoredProgressStatus>
      ) : data ? (
        <>
          {data.document.blueprintId !== null ? (
            <div className={styles['overlay']}>
              {readinessLoading ? (
                <LearningBoredProgressStatus translate={_}>
                  {_('Loading exam progress…')}
                </LearningBoredProgressStatus>
              ) : readinessError ? (
                <LearningBoredProgressStatus
                  actionLabel='Try exam progress again'
                  onAction={() => setReadinessRevision((revision) => revision + 1)}
                  tone='error'
                  translate={_}
                >
                  {readinessError}
                </LearningBoredProgressStatus>
              ) : readiness ? (
                <LearningBoredOptionalReadinessBoundary
                  fallback={
                    <LearningBoredProgressStatus
                      actionLabel='Try exam view again'
                      onAction={() => setOverlayRevision((revision) => revision + 1)}
                      tone='error'
                      translate={_}
                    >
                      {_(
                        'Exam readiness could not be opened. Concept progress is still available.',
                      )}
                    </LearningBoredProgressStatus>
                  }
                  key={overlayRevision}
                >
                  <Suspense
                    fallback={
                      <LearningBoredProgressStatus translate={_}>
                        {_('Loading exam progress…')}
                      </LearningBoredProgressStatus>
                    }
                  >
                    <LearningBoredExamOverlay
                      client={client}
                      document={data.document}
                      mastery={data.mastery}
                      onOpenBoard={(boardId) => void openBoard(boardId)}
                      onStartReview={(conceptId) => onStartReview(documentId, conceptId)}
                      readiness={readiness}
                    />
                  </Suspense>
                </LearningBoredOptionalReadinessBoundary>
              ) : null}
            </div>
          ) : null}
          <LearningBoredMasterySummary
            mastery={data.mastery}
            onSelectTier={setSelectedTier}
            selectedTier={selectedTier}
          />
          <LearningBoredConceptList
            concepts={
              selectedTier === null
                ? data.mastery.concepts
                : data.mastery.concepts.filter((concept) => concept.tier === selectedTier)
            }
            initialExpandedConceptId={initialSelectedConceptId}
            emptyMessage={
              selectedTier === null
                ? 'No grounded concepts are available yet.'
                : 'No concepts are in this mastery state.'
            }
            onOpenBoard={(boardId) => void openBoard(boardId)}
            onStartReview={(conceptId) => onStartReview(documentId, conceptId)}
          />
        </>
      ) : (
        <LearningBoredProgressStatus tone='empty' translate={_}>
          {_('No grounded concepts are available yet.')}
        </LearningBoredProgressStatus>
      )}
    </LearningBoredProgressShell>
  );
};

export default LearningBoredProgressPanel;
