'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BarChart3, BookOpenText, Check, Flag, LoaderCircle, RefreshCw } from 'lucide-react';

import {
  LEARNINGBORED_REVIEW_GRADES,
  type LearningBoredClient,
  type LearningBoredDueReviewItem,
  type LearningBoredFeedbackCategory,
  type LearningBoredReviewAnswer,
  type LearningBoredReviewGrade,
  type LearningBoredReviewQueueSummary,
  type LearningBoredSubmitReviewGradeInput,
} from './client';
import {
  clearLearningBoredReviewGradeOutbox,
  createLearningBoredReviewGradeOutboxEntry,
  readLearningBoredReviewGradeOutbox,
  writeLearningBoredReviewGradeOutbox,
  type LearningBoredReviewGradeOutboxClearResult,
  type LearningBoredReviewGradeOutboxEntry,
  type LearningBoredReviewGradeOutboxReadResult,
  type LearningBoredReviewGradeOutboxWriteResult,
} from './review-grade-outbox';
import {
  formatLearningBoredCopy,
  type LearningBoredTranslationFunc,
  useLearningBoredTranslation,
} from './presentation/context';
import LearningBoredReviewSurfaceShell, {
  learningBoredReviewSurfaceStyles as styles,
} from './work-surface/LearningBoredReviewSurfaceShell';

const GRADE_LABELS: Record<LearningBoredReviewGrade, string> = {
  again: 'Again',
  hard: 'Hard',
  good: 'Good',
  easy: 'Easy',
};

type PendingAction = 'reveal' | 'grade' | 'suppress' | null;
type GradeRecovery = 'persist' | 'retry' | 'reload' | null;
type GradeSubmissionMode = 'initial' | 'reconcile';

export interface LearningBoredReviewPanelProps {
  client: LearningBoredClient;
  documentId?: string;
  conceptId?: string;
  onClose: () => void;
  onOpenProgress?: (documentId: string) => void;
  outboxStore?: LearningBoredReviewOutboxStore;
}

export interface LearningBoredReviewOutboxStore {
  read: () => LearningBoredReviewGradeOutboxReadResult;
  write: (entry: LearningBoredReviewGradeOutboxEntry) => LearningBoredReviewGradeOutboxWriteResult;
  clear: (clientRequestId: string) => LearningBoredReviewGradeOutboxClearResult;
}

const defaultLearningBoredReviewOutboxStore: LearningBoredReviewOutboxStore = {
  read: readLearningBoredReviewGradeOutbox,
  write: writeLearningBoredReviewGradeOutbox,
  clear: clearLearningBoredReviewGradeOutbox,
};

export type LearningBoredReviewVisualState =
  | 'loading'
  | 'load-error'
  | 'start'
  | 'question'
  | 'selected-choice'
  | 'reveal-request'
  | 'revealed-answer'
  | 'grading'
  | 'pending-outbox'
  | 'rejection-recovery'
  | 'suppression'
  | 'continuation'
  | 'empty'
  | 'completion';

export interface LearningBoredReviewRecoveryView {
  message: string;
  action: 'retry-grade' | 'reload-review' | null;
  actionDisabled: boolean;
}

interface LearningBoredReviewScreenBase {
  recovery: LearningBoredReviewRecoveryView | null;
}

export type LearningBoredReviewScreen =
  | ({ kind: 'loading' } & LearningBoredReviewScreenBase)
  | ({ kind: 'load-error'; message: string } & LearningBoredReviewScreenBase)
  | ({
      kind: 'start';
      remainingCount: number;
      reviewedToday: number;
      dailyTarget: number;
      hasItems: boolean;
      continuationExhausted: boolean;
      beginBlocked: boolean;
    } & LearningBoredReviewScreenBase)
  | ({
      kind: 'summary';
      mode: 'continuation' | 'empty' | 'completion';
      remainingCount: number;
      reviewedCount: number;
      removedCount: number;
      documentId?: string;
      canOpenProgress: boolean;
    } & LearningBoredReviewScreenBase)
  | ({
      kind: 'question';
      item: LearningBoredDueReviewItem;
      questionNumber: number;
      totalQuestions: number;
      selectedOptionId: string | null;
      controlsDisabled: boolean;
      answer?: never;
    } & LearningBoredReviewScreenBase)
  | ({
      kind: 'revealed';
      item: LearningBoredDueReviewItem;
      questionNumber: number;
      totalQuestions: number;
      selectedOptionId: string | null;
      controlsDisabled: boolean;
      answer: LearningBoredReviewAnswer;
    } & LearningBoredReviewScreenBase);

export interface LearningBoredReviewViewState {
  subtitle: string;
  visualState: LearningBoredReviewVisualState;
  statusMessage: string;
  screen: LearningBoredReviewScreen;
}

export interface LearningBoredReviewPresentationActions {
  onBegin: () => void;
  onTryAgain: () => void;
  onContinue: () => void;
  onReveal: () => void;
  onSelectOption: (optionId: string) => void;
  onGrade: (grade: LearningBoredReviewGrade) => void;
  onSuppress: (
    category: Extract<LearningBoredFeedbackCategory, 'ambiguous_question' | 'bad_distractor'>,
  ) => void;
  onRetryGrade: () => void;
  onReloadReview: () => void;
  onClose: () => void;
  onOpenProgress?: (documentId: string) => void;
}

export interface LearningBoredReviewPresentationProps {
  viewState: LearningBoredReviewViewState;
  actions: LearningBoredReviewPresentationActions;
  translate?: LearningBoredTranslationFunc;
  questionRef?: React.RefObject<HTMLHeadingElement | null>;
  answerRef?: React.RefObject<HTMLElement | null>;
}

function formatInterval(seconds: number, days: number): string {
  if (seconds < 60) return `${seconds} sec`;
  if (seconds < 3_600) return `${Math.max(1, Math.round(seconds / 60))} min`;
  if (seconds < 86_400) return `${Math.max(1, Math.round(seconds / 3_600))} hr`;
  if (days < 365) return `${Math.max(1, days)} ${days === 1 ? 'day' : 'days'}`;
  const years = Math.max(1, Math.round(days / 365));
  return `${years} ${years === 1 ? 'year' : 'years'}`;
}

function sourceLocation(item: LearningBoredDueReviewItem): string {
  return [item.source.documentTitle, item.source.chapter, item.source.pageLabel]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(' · ');
}

function createReviewRequestId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `reader-review-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isDefinitiveGradeFailure(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('status' in error)) return false;
  const status = (error as { status?: unknown }).status;
  return (
    typeof status === 'number' &&
    status >= 400 &&
    status < 500 &&
    status !== 408 &&
    status !== 425 &&
    status !== 429
  );
}

const REVIEW_STATE_LABELS: Record<LearningBoredReviewVisualState, string> = {
  loading: 'Loading review',
  'load-error': 'Review unavailable',
  start: 'Review ready',
  question: 'Question',
  'selected-choice': 'Choice selected',
  'reveal-request': 'Revealing answer',
  'revealed-answer': 'Answer revealed',
  grading: 'Saving grade',
  'pending-outbox': 'Grade awaiting confirmation',
  'rejection-recovery': 'Action needed',
  suppression: 'Removing question',
  continuation: 'More questions',
  empty: 'No validated questions',
  completion: 'Review complete',
};

function ReviewRecoveryNotice({
  recovery,
  actions,
  translate,
}: {
  recovery: LearningBoredReviewRecoveryView | null;
  actions: LearningBoredReviewPresentationActions;
  translate: LearningBoredTranslationFunc;
}) {
  if (!recovery) return null;

  return (
    <div className={styles['recovery']} role='alert'>
      <p>{recovery.message}</p>
      {recovery.action === 'retry-grade' ? (
        <button
          type='button'
          className={`${styles['secondaryButton']} ${styles['recoveryAction']}`}
          disabled={recovery.actionDisabled}
          onClick={actions.onRetryGrade}
        >
          <RefreshCw className={styles['buttonIcon']} aria-hidden='true' />
          {translate('Retry grade')}
        </button>
      ) : null}
      {recovery.action === 'reload-review' ? (
        <button
          type='button'
          className={`${styles['secondaryButton']} ${styles['recoveryAction']}`}
          disabled={recovery.actionDisabled}
          onClick={actions.onReloadReview}
        >
          <RefreshCw className={styles['buttonIcon']} aria-hidden='true' />
          {translate('Reload review')}
        </button>
      ) : null}
    </div>
  );
}

/**
 * Data-only production Review surface. The discriminated screen union makes answer data impossible
 * to supply for the pre-reveal `question` screen, so deterministic previews can mount real states
 * without weakening the controller's deliberate-reveal boundary.
 */
export function LearningBoredReviewPresentation({
  viewState,
  actions,
  translate = formatLearningBoredCopy,
  questionRef,
  answerRef,
}: LearningBoredReviewPresentationProps) {
  const { screen, visualState } = viewState;
  const stateLabel = translate(REVIEW_STATE_LABELS[visualState]);
  const busy =
    visualState === 'loading' ||
    visualState === 'reveal-request' ||
    visualState === 'grading' ||
    visualState === 'suppression';

  let content: React.ReactNode;
  if (screen.kind === 'loading') {
    content = (
      <div className={styles['centerState']} role='status'>
        <LoaderCircle className={styles['spinner']} aria-hidden='true' />
        <p className={styles['description']}>{translate('Loading your review queue…')}</p>
      </div>
    );
  } else if (screen.kind === 'load-error') {
    content = (
      <section className={styles['centerState']}>
        <span className={styles['stateMarker']}>{stateLabel}</span>
        <p className={styles['description']} role='alert'>
          {screen.message}
        </p>
        <button
          type='button'
          className={`${styles['secondaryButton']} ${styles['startAction']}`}
          onClick={actions.onTryAgain}
        >
          <RefreshCw className={styles['buttonIcon']} aria-hidden='true' />
          {translate('Try again')}
        </button>
      </section>
    );
  } else if (screen.kind === 'start') {
    content = (
      <section className={styles['startState']}>
        <div>
          <span className={styles['stateMarker']}>{stateLabel}</span>
          <h2 className={styles['title']}>
            {screen.remainingCount === 1
              ? translate('1 question is due now.')
              : translate(`${screen.remainingCount} questions are due now.`)}
          </h2>
          <div className={styles['metrics']}>
            <div className={styles['metric']}>
              <strong className={styles['metricValue']}>{screen.reviewedToday}</strong>
              <span className={styles['metricLabel']}>{translate('Reviewed today')}</span>
            </div>
            <div className={styles['metric']}>
              <strong className={styles['metricValue']}>{screen.dailyTarget}</strong>
              <span className={styles['metricLabel']}>{translate('Daily target')}</span>
            </div>
          </div>
          <p className={styles['description']}>
            {translate('Take one question at a time. Reveal the answer before choosing a grade.')}
          </p>
          {screen.continuationExhausted && !screen.hasItems ? (
            <p className={styles['description']}>
              {translate(
                'No validated questions are available from the remaining queue right now.',
              )}
            </p>
          ) : null}
          <ReviewRecoveryNotice
            recovery={screen.recovery}
            actions={actions}
            translate={translate}
          />
        </div>
        <button
          type='button'
          className={`${styles['primaryButton']} ${styles['fullWidth']} ${styles['startAction']}`}
          disabled={screen.beginBlocked}
          onClick={actions.onBegin}
        >
          {screen.beginBlocked && screen.hasItems
            ? translate('Confirm the pending grade first')
            : screen.hasItems
              ? translate('Begin review')
              : translate('Nothing available right now')}
        </button>
      </section>
    );
  } else if (screen.kind === 'summary') {
    const continuing = screen.mode === 'continuation';
    const unavailable = screen.mode === 'empty';
    content = (
      <section className={styles['centerState']}>
        {continuing ? (
          <RefreshCw className={styles['stateIcon']} aria-hidden='true' />
        ) : (
          <Check className={styles['stateIcon']} aria-hidden='true' />
        )}
        <span className={styles['stateMarker']}>{stateLabel}</span>
        <h2 className={styles['title']}>
          {continuing
            ? translate('More questions are available')
            : unavailable
              ? translate('No validated questions are due')
              : translate('Review complete')}
        </h2>
        <p className={styles['description']}>
          {unavailable
            ? translate(
                `${screen.reviewedCount} reviewed. No more validated questions are available from the remaining queue right now.`,
              )
            : translate(
                `${screen.reviewedCount} reviewed${screen.removedCount > 0 ? `, ${screen.removedCount} removed` : ''}. ${screen.remainingCount} remain.`,
              )}
        </p>
        <ReviewRecoveryNotice recovery={screen.recovery} actions={actions} translate={translate} />
        {continuing ? (
          <button
            type='button'
            className={`${styles['primaryButton']} ${styles['startAction']}`}
            disabled={visualState === 'suppression'}
            onClick={actions.onContinue}
          >
            {translate(`Continue review — ${screen.remainingCount} remaining`)}
          </button>
        ) : (
          <div className={styles['buttonRow']}>
            {screen.documentId && screen.canOpenProgress && actions.onOpenProgress ? (
              <button
                type='button'
                className={styles['primaryButton']}
                onClick={() => actions.onOpenProgress?.(screen.documentId!)}
              >
                <BarChart3 className={styles['buttonIcon']} aria-hidden='true' />
                {translate('View progress')}
              </button>
            ) : null}
            <button type='button' className={styles['secondaryButton']} onClick={actions.onClose}>
              {translate('Return to reading')}
            </button>
          </div>
        )}
      </section>
    );
  } else {
    const answer = screen.kind === 'revealed' ? screen.answer : null;
    const source = sourceLocation(screen.item);
    content = (
      <>
        <div
          aria-label={translate('Review question and answer')}
          className={styles['questionScroll']}
          role='region'
          tabIndex={0}
        >
          <div className={styles['questionMeta']}>
            <span>
              {translate(`Question ${screen.questionNumber} of ${screen.totalQuestions}`)}
            </span>
            <span className={styles['questionState']}>{stateLabel}</span>
            <span className={styles['sourceLocation']}>{source}</span>
          </div>

          <article className={styles['questionPlane']}>
            <h2 ref={questionRef} tabIndex={-1} className={styles['questionHeading']}>
              {screen.item.recallItem.stem}
            </h2>

            {screen.item.recallItem.options ? (
              <fieldset
                className={styles['choices']}
                disabled={answer !== null || screen.controlsDisabled}
              >
                <legend className='sr-only'>{translate('Choose an answer')}</legend>
                {screen.item.recallItem.options.map((option) => (
                  <label key={option.id} className={styles['choice']}>
                    <input
                      type='radio'
                      name={`review-answer-${screen.item.recallItem.id}`}
                      value={option.id}
                      checked={screen.selectedOptionId === option.id}
                      onChange={() => actions.onSelectOption(option.id)}
                    />
                    <span>{option.text}</span>
                  </label>
                ))}
              </fieldset>
            ) : null}
          </article>

          {!answer ? (
            <button
              type='button'
              data-review-reveal
              aria-keyshortcuts='Space'
              className={`${styles['primaryButton']} ${styles['fullWidth']} ${styles['revealButton']}`}
              disabled={screen.controlsDisabled}
              onClick={actions.onReveal}
            >
              {visualState === 'reveal-request'
                ? translate('Revealing…')
                : translate('Reveal answer')}
              <span className={styles['shortcut']}>{translate('Space')}</span>
            </button>
          ) : (
            <div className={styles['revealedStack']}>
              <section ref={answerRef} tabIndex={-1} className={styles['answerSection']}>
                <p className={styles['answerLabel']}>{translate('Answer')}</p>
                <p className={styles['answerText']}>{answer.answer}</p>
                <p className={styles['answerExplanation']}>{answer.explanation}</p>
              </section>

              {answer.optionRationales.length > 0 ? (
                <section aria-labelledby='review-rationales-heading'>
                  <h3 id='review-rationales-heading' className={styles['sectionHeading']}>
                    {translate('Why each choice works or does not')}
                  </h3>
                  <ul className={styles['rationaleList']}>
                    {answer.optionRationales.map((option) => (
                      <li key={option.id} className={styles['rationaleItem']}>
                        <p className={styles['rationaleTitle']}>
                          {option.text}{' '}
                          {screen.selectedOptionId === option.id ? translate('— your choice') : ''}
                        </p>
                        <p className={styles['rationaleCopy']}>
                          <span className={styles['rationaleResult']}>
                            {option.isCorrect ? translate('Correct.') : translate('Not correct.')}
                          </span>{' '}
                          {option.rationale}
                        </p>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {answer.rubric ? (
                <section aria-labelledby='review-rubric-heading'>
                  <h3 id='review-rubric-heading' className={styles['sectionHeading']}>
                    {translate('A complete answer includes')}
                  </h3>
                  <ul className={styles['rubricList']}>
                    {answer.rubric.map((point) => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <section className={styles['sourceAnchor']}>
                <h3 className={styles['sourceHeading']}>
                  <BookOpenText className={styles['sourceIcon']} aria-hidden='true' />
                  {translate('Source anchor')}
                </h3>
                <p className={styles['sourceMeta']}>
                  {[answer.anchor.title, answer.anchor.chapter, answer.anchor.pageLabel]
                    .filter((part): part is string => Boolean(part?.trim()))
                    .join(' · ')}
                </p>
                <blockquote className={styles['sourceQuote']}>
                  {answer.anchor.sourceText}
                </blockquote>
              </section>
            </div>
          )}

          <div className={styles['removeRow']}>
            <span className={styles['removeLabel']}>
              <Flag className={styles['flagIcon']} aria-hidden='true' />
              {translate('Remove this question:')}
            </span>
            <button
              type='button'
              className={styles['textButton']}
              disabled={screen.controlsDisabled}
              onClick={() => actions.onSuppress('ambiguous_question')}
            >
              {translate('Ambiguous')}
            </button>
            {screen.item.recallItem.kind === 'multiple_choice' ? (
              <button
                type='button'
                className={styles['textButton']}
                disabled={screen.controlsDisabled}
                onClick={() => actions.onSuppress('bad_distractor')}
              >
                {translate('Bad choice')}
              </button>
            ) : null}
          </div>

          <ReviewRecoveryNotice
            recovery={screen.recovery}
            actions={actions}
            translate={translate}
          />
        </div>

        {answer ? (
          <footer className={styles['gradeFooter']}>
            <p className={styles['gradePrompt']}>
              {translate('How well did you recall it? Use keys 1–4.')}
            </p>
            <fieldset className={styles['gradeGrid']}>
              <legend className='sr-only'>{translate('Recall grade')}</legend>
              {LEARNINGBORED_REVIEW_GRADES.map((value, index) => {
                const preview = screen.item.intervalPreviews[value];
                const interval = formatInterval(preview.intervalSeconds, preview.intervalDays);
                return (
                  <button
                    key={value}
                    type='button'
                    aria-keyshortcuts={String(index + 1)}
                    aria-label={translate(`${GRADE_LABELS[value]}, next review ${interval}`)}
                    className={styles['gradeButton']}
                    disabled={screen.controlsDisabled}
                    onClick={() => actions.onGrade(value)}
                  >
                    <span className={styles['gradeName']}>
                      {translate(GRADE_LABELS[value])}
                      <kbd className={styles['key']}>{index + 1}</kbd>
                    </span>
                    <span className={styles['interval']}>{interval}</span>
                  </button>
                );
              })}
            </fieldset>
          </footer>
        ) : null}
      </>
    );
  }

  return (
    <LearningBoredReviewSurfaceShell
      subtitle={viewState.subtitle}
      state={visualState}
      busy={busy}
      statusMessage={viewState.statusMessage}
      onClose={actions.onClose}
      translate={translate}
    >
      {content}
    </LearningBoredReviewSurfaceShell>
  );
}

const LearningBoredReviewPanel: React.FC<LearningBoredReviewPanelProps> = ({
  client,
  documentId,
  conceptId,
  onClose,
  onOpenProgress,
  outboxStore = defaultLearningBoredReviewOutboxStore,
}) => {
  const _ = useLearningBoredTranslation();
  const [items, setItems] = useState<LearningBoredDueReviewItem[]>([]);
  const [queue, setQueue] = useState<LearningBoredReviewQueueSummary | null>(null);
  const [sessionPlannedCount, setSessionPlannedCount] = useState(0);
  const [reviewedCount, setReviewedCount] = useState(0);
  const [removedCount, setRemovedCount] = useState(0);
  const [continuationExhausted, setContinuationExhausted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [started, setStarted] = useState(false);
  const [answer, setAnswer] = useState<LearningBoredReviewAnswer | null>(null);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [pendingGrade, setPendingGrade] = useState<LearningBoredReviewGradeOutboxEntry | null>(
    null,
  );
  const [gradeRecovery, setGradeRecovery] = useState<GradeRecovery>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState('');
  const translateRef = useRef(_);
  translateRef.current = _;
  const pendingActionRef = useRef<PendingAction>(null);
  const pendingGradeRef = useRef<LearningBoredReviewGradeOutboxEntry | null>(null);
  const shownAtRef = useRef(Date.now());
  const questionRef = useRef<HTMLHeadingElement>(null);
  const answerRef = useRef<HTMLElement>(null);

  const current = items[0] ?? null;

  const startAction = useCallback((action: Exclude<PendingAction, null>): boolean => {
    if (pendingActionRef.current !== null) return false;
    pendingActionRef.current = action;
    setPendingAction(action);
    return true;
  }, []);

  const finishAction = useCallback(() => {
    pendingActionRef.current = null;
    setPendingAction(null);
  }, []);

  const holdPendingGrade = useCallback((entry: LearningBoredReviewGradeOutboxEntry) => {
    pendingGradeRef.current = entry;
    setPendingGrade(entry);
  }, []);

  const releasePendingGrade = useCallback(() => {
    pendingGradeRef.current = null;
    setPendingGrade(null);
  }, []);

  const loadQueue = useCallback(
    async (
      signal?: AbortSignal,
      options: { preserveError?: boolean; resetProgress?: boolean } = {},
    ) => {
      setLoading(true);
      if (!options.preserveError) setError(null);
      try {
        const result = await client.getNextReviewItems(
          {
            limit: 20,
            ...(documentId ? { documentId } : {}),
            ...(conceptId ? { conceptId } : {}),
          },
          { signal },
        );
        setItems(result.items);
        setQueue(result.queue);
        const potentialCount = result.queue.dueNow + result.queue.newAvailable;
        setContinuationExhausted(result.items.length === 0 && potentialCount > 0);
        if (options.resetProgress) {
          setReviewedCount(0);
          setRemovedCount(0);
          setSessionPlannedCount(Math.max(result.items.length, potentialCount));
        } else {
          setSessionPlannedCount((count) => Math.max(count, result.items.length));
        }
        return result;
      } catch (loadError) {
        if (loadError instanceof Error && loadError.name === 'AbortError') return;
        setError(translateRef.current('Your review queue could not be loaded. Please try again.'));
        return undefined;
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [client, conceptId, documentId],
  );

  useEffect(() => {
    if (!started || !current || answer) return;
    shownAtRef.current = Date.now();
    requestAnimationFrame(() => questionRef.current?.focus());
  }, [answer, current, started]);

  useEffect(() => {
    if (!answer) return;
    const frame = requestAnimationFrame(() => answerRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [answer]);

  const advancePast = useCallback((recallItemId: string) => {
    setItems((currentItems) => currentItems.filter((item) => item.recallItem.id !== recallItemId));
    setAnswer(null);
    setSelectedOptionId(null);
    setGradeRecovery(null);
  }, []);

  const reveal = useCallback(async () => {
    if (!current || answer || pendingGradeRef.current || !startAction('reveal')) return;
    const recallItemId = current.recallItem.id;
    setError(null);
    try {
      const revealed = await client.revealReviewItem(recallItemId);
      if (revealed.recallItemId !== recallItemId) {
        throw new Error('The revealed answer did not match the current recall item.');
      }
      setAnswer(revealed.answer);
      setStatusMessage(_('Answer revealed. Choose a grade from 1 to 4.'));
    } catch {
      setError(_('The answer could not be revealed. Please try again.'));
    } finally {
      finishAction();
    }
  }, [_, answer, client, current, finishAction, startAction]);

  const submitGrade = useCallback(
    async (
      entry: LearningBoredReviewGradeOutboxEntry,
      mode: GradeSubmissionMode,
      signal?: AbortSignal,
    ) => {
      if (!startAction('grade')) return;
      setError(null);
      setGradeRecovery(null);
      try {
        const result = await (signal
          ? client.submitReviewGrade(entry.request, { signal })
          : client.submitReviewGrade(entry.request));
        if (
          result.clientRequestId !== entry.request.clientRequestId ||
          result.recallItemId !== entry.request.recallItemId ||
          result.grade !== entry.request.grade
        ) {
          throw new Error('The grade response did not match the submitted request.');
        }
        const cleared = outboxStore.clear(entry.request.clientRequestId);
        if (cleared.status !== 'cleared') {
          if (cleared.status === 'conflict') holdPendingGrade(cleared.entry);
          setGradeRecovery('retry');
          setError(
            _(
              'Your grade was saved, but its local safety record could not be cleared. Retry before grading another question.',
            ),
          );
          return;
        }

        releasePendingGrade();
        setReviewedCount((count) => count + 1);
        const wasNew = entry.occurrence.state === 'new' && entry.occurrence.dueAt === null;
        const dueNowAfter = Math.max(0, (queue?.dueNow ?? 0) - (wasNew ? 0 : 1));
        const newAvailableAfter = Math.max(0, (queue?.newAvailable ?? 0) - (wasNew ? 1 : 0));
        const remainingAfter = dueNowAfter + newAvailableAfter;
        const gradeLabel = GRADE_LABELS[entry.request.grade];
        setStatusMessage(
          _(
            items.length > 1
              ? `${gradeLabel} recorded. Next question.`
              : remainingAfter > 0
                ? `${gradeLabel} recorded. More questions are ready.`
                : `${gradeLabel} recorded. Review complete.`,
          ),
        );
        if (mode === 'reconcile') {
          setAnswer(null);
          setSelectedOptionId(null);
          await loadQueue(signal, { preserveError: false, resetProgress: false });
          return;
        }

        setQueue((currentQueue) => {
          if (!currentQueue) return currentQueue;
          return {
            ...currentQueue,
            dueNow: Math.max(0, currentQueue.dueNow - (wasNew ? 0 : 1)),
            dueToday: Math.max(0, currentQueue.dueToday - (wasNew ? 0 : 1)),
            newAvailable: Math.max(0, currentQueue.newAvailable - (wasNew ? 1 : 0)),
            reviewedToday: currentQueue.reviewedToday + 1,
          };
        });
        advancePast(entry.request.recallItemId);
      } catch (gradeError) {
        if (gradeError instanceof Error && gradeError.name === 'AbortError') return;
        if (isDefinitiveGradeFailure(gradeError)) {
          const cleared = outboxStore.clear(entry.request.clientRequestId);
          if (cleared.status === 'cleared') releasePendingGrade();
          else if (cleared.status === 'conflict') holdPendingGrade(cleared.entry);
          setGradeRecovery('reload');
          setError(
            _(
              'This question changed or is no longer available. Reload the queue before continuing.',
            ),
          );
        } else {
          setGradeRecovery('retry');
          setError(
            _(
              'That grade may not have reached LearningBored. Retry uses the same request so it cannot be counted twice.',
            ),
          );
        }
      } finally {
        finishAction();
      }
    },
    [
      _,
      advancePast,
      client,
      finishAction,
      holdPendingGrade,
      items.length,
      loadQueue,
      outboxStore,
      queue?.dueNow,
      queue?.newAvailable,
      releasePendingGrade,
      startAction,
    ],
  );

  const grade = useCallback(
    (value: LearningBoredReviewGrade) => {
      if (
        !current ||
        !answer ||
        pendingActionRef.current !== null ||
        pendingGradeRef.current ||
        gradeRecovery !== null
      ) {
        return;
      }
      const input: LearningBoredSubmitReviewGradeInput = {
        clientRequestId: createReviewRequestId(),
        recallItemId: current.recallItem.id,
        reviewOccurrence: {
          state: current.reviewState.state,
          dueAt: current.reviewState.dueAt,
          reps: current.reviewState.reps,
          lapses: current.reviewState.lapses,
        },
        grade: value,
        elapsedMs: Math.min(86_400_000, Math.max(0, Date.now() - shownAtRef.current)),
        ...(selectedOptionId ? { answeredOptionId: selectedOptionId } : {}),
      };
      const entry = createLearningBoredReviewGradeOutboxEntry(current, documentId, input);
      holdPendingGrade(entry);
      const stored = outboxStore.write(entry);
      if (stored.status === 'stored') {
        void submitGrade(entry, 'initial');
        return;
      }
      if (stored.status === 'conflict') {
        holdPendingGrade(stored.entry);
        setGradeRecovery('retry');
        setError(
          _(
            'A previous grade is still awaiting confirmation. Confirm it before grading another question.',
          ),
        );
        return;
      }
      setGradeRecovery('persist');
      setError(
        _(
          'This grade was not sent because its retry-safe local record could not be saved. Retry when local storage is available.',
        ),
      );
    },
    [
      _,
      answer,
      current,
      documentId,
      gradeRecovery,
      holdPendingGrade,
      outboxStore,
      selectedOptionId,
      submitGrade,
    ],
  );

  const suppress = useCallback(
    (category: Extract<LearningBoredFeedbackCategory, 'ambiguous_question' | 'bad_distractor'>) => {
      if (
        !current ||
        pendingGradeRef.current ||
        gradeRecovery !== null ||
        !startAction('suppress')
      ) {
        return;
      }
      const recallItemId = current.recallItem.id;
      const wasNew = current.reviewState.state === 'new' && current.reviewState.dueAt === null;
      const dueNowAfter = Math.max(0, (queue?.dueNow ?? 0) - (wasNew ? 0 : 1));
      const newAvailableAfter = Math.max(0, (queue?.newAvailable ?? 0) - (wasNew ? 1 : 0));
      const remainingAfter = dueNowAfter + newAvailableAfter;
      setError(null);
      setQueue((currentQueue) =>
        currentQueue
          ? {
              ...currentQueue,
              dueNow: Math.max(0, currentQueue.dueNow - (wasNew ? 0 : 1)),
              dueToday: Math.max(0, currentQueue.dueToday - (wasNew ? 0 : 1)),
              newAvailable: Math.max(0, currentQueue.newAvailable - (wasNew ? 1 : 0)),
            }
          : currentQueue,
      );
      setRemovedCount((count) => count + 1);
      setStatusMessage(
        _(
          items.length > 1
            ? 'Question removed. Next question.'
            : remainingAfter > 0
              ? 'Question removed. More questions are ready.'
              : 'Question removed. Review complete.',
        ),
      );
      advancePast(recallItemId);
      void client
        .submitFeedback({ recallItemId, category, suppressItem: true })
        .catch(() =>
          setError(
            _(
              'The question was removed from this session, but LearningBored could not confirm suppression.',
            ),
          ),
        )
        .finally(finishAction);
    },
    [
      _,
      advancePast,
      client,
      current,
      finishAction,
      gradeRecovery,
      items.length,
      queue?.dueNow,
      queue?.newAvailable,
      startAction,
    ],
  );

  useEffect(() => {
    if (!started || !current) return;
    const handleShortcut = (event: KeyboardEvent) => {
      if (
        event.repeat ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        pendingAction !== null
      ) {
        return;
      }
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.matches('input, select, textarea, [contenteditable="true"]')) return;

      if (!answer && event.code === 'Space') {
        if (target?.closest('button:not([data-review-reveal])')) return;
        event.preventDefault();
        void reveal();
        return;
      }

      if (answer && /^[1-4]$/u.test(event.key)) {
        event.preventDefault();
        const value = LEARNINGBORED_REVIEW_GRADES[Number(event.key) - 1];
        if (value) grade(value);
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [answer, current, grade, pendingAction, reveal, started]);

  const completedCount = reviewedCount + removedCount;
  const remainingCount = Math.max(0, (queue?.dueNow ?? 0) + (queue?.newAvailable ?? 0));

  const retryPendingGrade = useCallback(() => {
    const entry = pendingGradeRef.current;
    if (!entry) return;
    if (entry.expiresAt <= Date.now()) {
      const cleared = outboxStore.clear(entry.request.clientRequestId);
      if (cleared.status === 'conflict') {
        holdPendingGrade(cleared.entry);
        setGradeRecovery('retry');
        setError(
          _(
            'A previous grade is still awaiting confirmation. Confirm it before grading another question.',
          ),
        );
        return;
      }
      if (cleared.status === 'unavailable') {
        setError(
          _(
            'The expired local grade safety record could not be cleared. Try again before continuing.',
          ),
        );
        return;
      }
      releasePendingGrade();
      setGradeRecovery('reload');
      setError(_('The pending grade expired. Reload the queue before continuing.'));
      return;
    }

    const stored = outboxStore.write(entry);
    if (stored.status === 'unavailable') {
      setError(
        _(
          'This grade was not sent because its retry-safe local record could not be confirmed. Retry when local storage is available.',
        ),
      );
      return;
    }
    if (stored.status === 'conflict') {
      holdPendingGrade(stored.entry);
      setGradeRecovery('retry');
      setError(
        _(
          'A previous grade is still awaiting confirmation. Confirm it before grading another question.',
        ),
      );
      return;
    }
    void submitGrade(entry, gradeRecovery === 'persist' ? 'initial' : 'reconcile');
  }, [_, gradeRecovery, holdPendingGrade, outboxStore, releasePendingGrade, submitGrade]);

  const reloadQueue = useCallback(() => {
    const entry = pendingGradeRef.current;
    if (entry) {
      const cleared = outboxStore.clear(entry.request.clientRequestId);
      if (cleared.status !== 'cleared') {
        if (cleared.status === 'conflict') holdPendingGrade(cleared.entry);
        setGradeRecovery('reload');
        setError(
          _(
            'The local grade safety record could not be cleared. Try again before starting another grade.',
          ),
        );
        return;
      }
      releasePendingGrade();
    }
    setStarted(false);
    setItems([]);
    setQueue(null);
    setSessionPlannedCount(0);
    setReviewedCount(0);
    setRemovedCount(0);
    setContinuationExhausted(false);
    setAnswer(null);
    setSelectedOptionId(null);
    setGradeRecovery(null);
    setStatusMessage(_('Reloading the review queue.'));
    void loadQueue(undefined, { resetProgress: true });
  }, [_, holdPendingGrade, loadQueue, outboxStore, releasePendingGrade]);

  const continueQueue = useCallback(() => {
    setAnswer(null);
    setSelectedOptionId(null);
    setStatusMessage(_('Loading the next review questions.'));
    void loadQueue(undefined, { resetProgress: false });
  }, [_, loadQueue]);

  useEffect(() => {
    const controller = new AbortController();
    const initialize = async () => {
      let preserveError = false;
      const stored = outboxStore.read();
      if (stored.status === 'unavailable') {
        preserveError = true;
        setError(
          translateRef.current(
            'Retry-safe grade storage is unavailable. Questions remain readable, but a grade will not be sent unless its safety record can be saved.',
          ),
        );
      } else if (stored.status === 'available') {
        const entry = stored.entry;
        holdPendingGrade(entry);
        setGradeRecovery('retry');
        try {
          const result = await client.submitReviewGrade(entry.request, {
            signal: controller.signal,
          });
          if (
            result.clientRequestId !== entry.request.clientRequestId ||
            result.recallItemId !== entry.request.recallItemId ||
            result.grade !== entry.request.grade
          ) {
            throw new Error('The grade response did not match the submitted request.');
          }
          const cleared = outboxStore.clear(entry.request.clientRequestId);
          if (cleared.status === 'cleared') {
            releasePendingGrade();
            setGradeRecovery(null);
            setStatusMessage(translateRef.current('Your previous grade was confirmed.'));
          } else {
            if (cleared.status === 'conflict') holdPendingGrade(cleared.entry);
            preserveError = true;
            setError(
              translateRef.current(
                'Your previous grade was saved, but its local safety record could not be cleared. Retry before grading another question.',
              ),
            );
          }
        } catch (gradeError) {
          if (gradeError instanceof Error && gradeError.name === 'AbortError') return;
          preserveError = true;
          if (isDefinitiveGradeFailure(gradeError)) {
            const cleared = outboxStore.clear(entry.request.clientRequestId);
            if (cleared.status === 'cleared') releasePendingGrade();
            else if (cleared.status === 'conflict') holdPendingGrade(cleared.entry);
            setGradeRecovery('reload');
            setError(
              translateRef.current(
                'A previously pending question changed or is no longer available. Reload the queue before continuing.',
              ),
            );
          } else {
            setGradeRecovery('retry');
            setError(
              translateRef.current(
                'A previous grade is still awaiting confirmation. Retry uses its original request so it cannot be counted twice.',
              ),
            );
          }
        }
      }

      if (!controller.signal.aborted) {
        await loadQueue(controller.signal, { preserveError, resetProgress: true });
      }
    };
    void initialize();
    return () => controller.abort();
  }, [client, holdPendingGrade, loadQueue, outboxStore, releasePendingGrade]);

  const recovery: LearningBoredReviewRecoveryView | null = error
    ? {
        message: error,
        action:
          pendingGrade && (gradeRecovery === 'persist' || gradeRecovery === 'retry')
            ? 'retry-grade'
            : gradeRecovery === 'reload'
              ? 'reload-review'
              : null,
        actionDisabled: pendingAction !== null,
      }
    : null;

  let visualState: LearningBoredReviewVisualState;
  if (loading) visualState = 'loading';
  else if (error && !queue) visualState = 'load-error';
  else if (pendingAction === 'suppress') visualState = 'suppression';
  else if (pendingAction === 'reveal') visualState = 'reveal-request';
  else if (pendingAction === 'grade') visualState = 'grading';
  else if (gradeRecovery === 'retry' && pendingGrade) visualState = 'pending-outbox';
  else if (gradeRecovery !== null) visualState = 'rejection-recovery';
  else if (pendingGrade) visualState = 'pending-outbox';
  else if (!started && queue !== null && items.length === 0) visualState = 'empty';
  else if (!started) visualState = 'start';
  else if (!current && remainingCount > 0 && !continuationExhausted) {
    visualState = 'continuation';
  } else if (!current && remainingCount > 0) visualState = 'empty';
  else if (!current) visualState = 'completion';
  else if (answer) visualState = 'revealed-answer';
  else if (selectedOptionId) visualState = 'selected-choice';
  else visualState = 'question';

  let screen: LearningBoredReviewScreen;
  if (loading) {
    screen = { kind: 'loading', recovery };
  } else if (error && !queue) {
    screen = { kind: 'load-error', message: error, recovery };
  } else if (!started && queue !== null && items.length === 0) {
    screen = {
      kind: 'summary',
      mode: 'empty',
      remainingCount,
      reviewedCount,
      removedCount,
      ...(documentId ? { documentId } : {}),
      canOpenProgress: Boolean(documentId && onOpenProgress),
      recovery,
    };
  } else if (!started) {
    screen = {
      kind: 'start',
      remainingCount,
      reviewedToday: queue?.reviewedToday ?? 0,
      dailyTarget: queue?.dailyTarget ?? 0,
      hasItems: items.length > 0,
      continuationExhausted,
      beginBlocked: items.length === 0 || pendingGrade !== null || gradeRecovery === 'reload',
      recovery,
    };
  } else if (!current) {
    screen = {
      kind: 'summary',
      mode:
        remainingCount > 0 && !continuationExhausted
          ? 'continuation'
          : remainingCount > 0
            ? 'empty'
            : 'completion',
      remainingCount,
      reviewedCount,
      removedCount,
      ...(documentId ? { documentId } : {}),
      canOpenProgress: Boolean(documentId && onOpenProgress),
      recovery,
    };
  } else {
    const sharedQuestion = {
      item: current,
      questionNumber: completedCount + 1,
      totalQuestions: Math.max(sessionPlannedCount, completedCount + items.length, 1),
      selectedOptionId,
      controlsDisabled: pendingAction !== null || gradeRecovery !== null,
      recovery,
    };
    screen = answer
      ? { kind: 'revealed', ...sharedQuestion, answer }
      : { kind: 'question', ...sharedQuestion };
  }

  const viewState: LearningBoredReviewViewState = {
    subtitle: documentId ? 'From this Board' : 'Your due questions',
    visualState,
    statusMessage,
    screen,
  };

  return (
    <LearningBoredReviewPresentation
      viewState={viewState}
      translate={_}
      questionRef={questionRef}
      answerRef={answerRef}
      actions={{
        onBegin: () => {
          setStarted(true);
          setStatusMessage(_('Review started.'));
        },
        onTryAgain: () => void loadQueue(),
        onContinue: continueQueue,
        onReveal: () => void reveal(),
        onSelectOption: setSelectedOptionId,
        onGrade: grade,
        onSuppress: suppress,
        onRetryGrade: retryPendingGrade,
        onReloadReview: reloadQueue,
        onClose,
        ...(onOpenProgress ? { onOpenProgress } : {}),
      }}
    />
  );
};

export default LearningBoredReviewPanel;
