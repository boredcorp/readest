'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BarChart3, BookOpenText, Check, Flag, RefreshCw } from 'lucide-react';

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
  type LearningBoredReviewGradeOutboxEntry,
} from './review-grade-outbox';
import { useLearningBoredTranslation } from './presentation/context';
import LearningBoredReviewSurfaceShell from './work-surface/LearningBoredReviewSurfaceShell';

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

const LearningBoredReviewPanel: React.FC<LearningBoredReviewPanelProps> = ({
  client,
  documentId,
  conceptId,
  onClose,
  onOpenProgress,
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
        const cleared = clearLearningBoredReviewGradeOutbox(entry.request.clientRequestId);
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
        setStatusMessage(_(`${GRADE_LABELS[entry.request.grade]} recorded. Next question.`));
        if (mode === 'reconcile') {
          setAnswer(null);
          setSelectedOptionId(null);
          await loadQueue(signal, { preserveError: false, resetProgress: false });
          return;
        }

        setQueue((currentQueue) => {
          if (!currentQueue) return currentQueue;
          const wasNew = entry.occurrence.state === 'new' && entry.occurrence.dueAt === null;
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
          const cleared = clearLearningBoredReviewGradeOutbox(entry.request.clientRequestId);
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
      loadQueue,
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
      const stored = writeLearningBoredReviewGradeOutbox(entry);
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
      setStatusMessage(_('Question removed from review.'));
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
    [_, advancePast, client, current, finishAction, gradeRecovery, startAction],
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
      const cleared = clearLearningBoredReviewGradeOutbox(entry.request.clientRequestId);
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

    const stored = writeLearningBoredReviewGradeOutbox(entry);
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
  }, [_, gradeRecovery, holdPendingGrade, releasePendingGrade, submitGrade]);

  const reloadQueue = useCallback(() => {
    const entry = pendingGradeRef.current;
    if (entry) {
      const cleared = clearLearningBoredReviewGradeOutbox(entry.request.clientRequestId);
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
  }, [_, holdPendingGrade, loadQueue, releasePendingGrade]);

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
      const stored = readLearningBoredReviewGradeOutbox();
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
          const cleared = clearLearningBoredReviewGradeOutbox(entry.request.clientRequestId);
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
            const cleared = clearLearningBoredReviewGradeOutbox(entry.request.clientRequestId);
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
  }, [client, holdPendingGrade, loadQueue, releasePendingGrade]);

  const recoveryNotice = error ? (
    <div
      className='mt-3 rounded-lg border border-[var(--lb-review-danger)] p-3 text-sm'
      role='alert'
    >
      <p>{error}</p>
      {pendingGrade && (gradeRecovery === 'persist' || gradeRecovery === 'retry') && (
        <button
          type='button'
          className='btn btn-sm mt-3 min-h-11'
          disabled={pendingAction !== null}
          onClick={retryPendingGrade}
        >
          <RefreshCw className='size-4' />
          {_('Retry grade')}
        </button>
      )}
      {gradeRecovery === 'reload' && (
        <button
          type='button'
          className='btn btn-sm mt-3 min-h-11'
          disabled={pendingAction !== null}
          onClick={reloadQueue}
        >
          <RefreshCw className='size-4' />
          {_('Reload review')}
        </button>
      )}
    </div>
  ) : null;

  return (
    <LearningBoredReviewSurfaceShell
      subtitle={documentId ? 'From this Board' : 'Your due questions'}
      statusMessage={statusMessage}
      onClose={onClose}
      translate={_}
    >
      {loading ? (
        <div className='flex flex-1 items-center justify-center p-6' role='status'>
          <span className='loading loading-spinner text-[var(--lb-review-focus)]' />
          <span className='ms-3'>{_('Loading your review queue…')}</span>
        </div>
      ) : error && !queue ? (
        <section className='flex flex-1 flex-col items-center justify-center p-6 text-center'>
          <p role='alert'>{error}</p>
          <button type='button' className='btn mt-4 min-h-11' onClick={() => void loadQueue()}>
            <RefreshCw className='size-4' />
            {_('Try again')}
          </button>
        </section>
      ) : !started ? (
        <section className='flex flex-1 flex-col justify-between overflow-y-auto p-5'>
          <div>
            <p className='text-sm font-semibold uppercase tracking-[0.12em] text-[var(--lb-review-focus)]'>
              {_('Ready when you are')}
            </p>
            <h2 className='learningbored-review-question mt-3 text-3xl font-semibold leading-tight'>
              {remainingCount === 1
                ? _('1 question is due now.')
                : _(`${remainingCount} questions are due now.`)}
            </h2>
            <div className='learningbored-review-card mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border text-center'>
              <div className='p-4'>
                <strong className='block text-2xl'>{queue?.reviewedToday ?? 0}</strong>
                <span className='text-xs text-[var(--lb-review-muted)]'>{_('Reviewed today')}</span>
              </div>
              <div className='border-l border-[var(--lb-review-border)] p-4'>
                <strong className='block text-2xl'>{queue?.dailyTarget ?? 0}</strong>
                <span className='text-xs text-[var(--lb-review-muted)]'>{_('Daily target')}</span>
              </div>
            </div>
            <p className='mt-5 text-sm leading-6 text-[var(--lb-review-muted)]'>
              {_('Take one question at a time. Reveal the answer before choosing a grade.')}
            </p>
            {continuationExhausted && items.length === 0 && (
              <p className='mt-3 text-sm leading-6 text-[var(--lb-review-muted)]'>
                {_('No validated questions are available from the remaining queue right now.')}
              </p>
            )}
            {recoveryNotice}
          </div>
          <button
            type='button'
            className='learningbored-review-primary mt-8 min-h-14 w-full rounded-xl px-5 text-base font-semibold disabled:opacity-50'
            disabled={items.length === 0 || pendingGrade !== null || gradeRecovery === 'reload'}
            onClick={() => {
              setStarted(true);
              setStatusMessage(_('Review started.'));
            }}
          >
            {pendingGrade !== null || gradeRecovery === 'reload'
              ? _('Confirm the pending grade first')
              : items.length > 0
                ? _('Begin review')
                : _('Nothing available right now')}
          </button>
        </section>
      ) : !current ? (
        <section className='flex flex-1 flex-col items-center justify-center p-6 text-center'>
          {remainingCount > 0 && !continuationExhausted ? (
            <RefreshCw className='size-9 text-[var(--lb-review-focus)]' aria-hidden='true' />
          ) : (
            <Check className='size-9 text-[var(--lb-review-focus)]' aria-hidden='true' />
          )}
          <h2 className='learningbored-review-question mt-4 text-2xl font-semibold'>
            {remainingCount > 0 && !continuationExhausted
              ? _('More questions are available')
              : _('Review complete')}
          </h2>
          <p className='mt-2 max-w-xs text-sm leading-6 text-[var(--lb-review-muted)]'>
            {continuationExhausted && remainingCount > 0
              ? _(
                  `${reviewedCount} reviewed. No more validated questions are available from the remaining queue right now.`,
                )
              : _(
                  `${reviewedCount} reviewed${removedCount > 0 ? `, ${removedCount} removed` : ''}. ${remainingCount} remain.`,
                )}
          </p>
          {recoveryNotice}
          {remainingCount > 0 && !continuationExhausted ? (
            <button
              type='button'
              className='learningbored-review-primary mt-6 min-h-14 rounded-xl px-5 font-semibold disabled:opacity-50'
              disabled={pendingAction !== null}
              onClick={continueQueue}
            >
              {_(`Continue review — ${remainingCount} remaining`)}
            </button>
          ) : (
            <div className='mt-6 flex flex-wrap justify-center gap-2'>
              {documentId && onOpenProgress ? (
                <button
                  type='button'
                  className='btn btn-primary min-h-11'
                  onClick={() => onOpenProgress(documentId)}
                >
                  <BarChart3 className='size-4' />
                  {_('View progress')}
                </button>
              ) : null}
              <button type='button' className='btn min-h-11' onClick={onClose}>
                {_('Return to reading')}
              </button>
            </div>
          )}
        </section>
      ) : (
        <>
          <div className='flex-1 overflow-y-auto px-4 py-4'>
            <div className='flex items-center justify-between gap-3 text-xs text-[var(--lb-review-muted)]'>
              <span>
                {_(
                  `Question ${completedCount + 1} of ${Math.max(
                    sessionPlannedCount,
                    completedCount + items.length,
                    1,
                  )}`,
                )}
              </span>
              <span className='truncate'>{sourceLocation(current)}</span>
            </div>

            <article className='learningbored-review-card mt-3 rounded-xl border p-4'>
              <h2
                ref={questionRef}
                tabIndex={-1}
                className='learningbored-review-question text-xl font-semibold leading-8'
              >
                {current.recallItem.stem}
              </h2>

              {current.recallItem.options && (
                <fieldset className='mt-5 space-y-2' disabled={answer !== null}>
                  <legend className='sr-only'>{_('Choose an answer')}</legend>
                  {current.recallItem.options.map((option) => (
                    <label
                      key={option.id}
                      className='flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border border-[var(--lb-review-border)] bg-[var(--lb-review-paper)] px-3 py-2 text-sm'
                    >
                      <input
                        type='radio'
                        name={`review-answer-${current.recallItem.id}`}
                        value={option.id}
                        checked={selectedOptionId === option.id}
                        onChange={() => setSelectedOptionId(option.id)}
                      />
                      <span>{option.text}</span>
                    </label>
                  ))}
                </fieldset>
              )}
            </article>

            {!answer ? (
              <button
                type='button'
                data-review-reveal
                aria-keyshortcuts='Space'
                className='learningbored-review-primary mt-4 min-h-14 w-full rounded-xl px-5 text-base font-semibold disabled:opacity-50'
                disabled={pendingAction !== null}
                onClick={() => void reveal()}
              >
                {pendingAction === 'reveal' ? _('Revealing…') : _('Reveal answer')}
                <span className='ms-2 text-xs font-normal opacity-80'>{_('Space')}</span>
              </button>
            ) : (
              <div className='mt-4 space-y-4'>
                <section
                  ref={answerRef}
                  tabIndex={-1}
                  className='learningbored-review-card rounded-xl border p-4'
                >
                  <p className='text-xs font-semibold uppercase tracking-[0.12em] text-[var(--lb-review-focus)]'>
                    {_('Answer')}
                  </p>
                  <p className='mt-2 text-lg font-semibold leading-7'>{answer.answer}</p>
                  <p className='mt-3 text-sm leading-6 text-[var(--lb-review-muted)]'>
                    {answer.explanation}
                  </p>
                </section>

                {answer.optionRationales.length > 0 && (
                  <section aria-labelledby='review-rationales-heading'>
                    <h3 id='review-rationales-heading' className='text-sm font-semibold'>
                      {_('Why each choice works or does not')}
                    </h3>
                    <ul className='mt-2 space-y-2'>
                      {answer.optionRationales.map((option) => (
                        <li
                          key={option.id}
                          className='learningbored-review-card rounded-lg border p-3 text-sm leading-6'
                        >
                          <p className='font-semibold'>
                            {option.text} {selectedOptionId === option.id ? _('— your choice') : ''}
                          </p>
                          <p className='text-[var(--lb-review-muted)]'>
                            <span className='font-medium text-[var(--lb-review-ink)]'>
                              {option.isCorrect ? _('Correct.') : _('Not correct.')}
                            </span>{' '}
                            {option.rationale}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {answer.rubric && (
                  <section aria-labelledby='review-rubric-heading'>
                    <h3 id='review-rubric-heading' className='text-sm font-semibold'>
                      {_('A complete answer includes')}
                    </h3>
                    <ul className='mt-2 list-disc space-y-1 ps-5 text-sm leading-6'>
                      {answer.rubric.map((point) => (
                        <li key={point}>{point}</li>
                      ))}
                    </ul>
                  </section>
                )}

                <section className='learningbored-review-anchor rounded-xl border-l-4 p-4'>
                  <h3 className='flex items-center gap-2 text-sm font-semibold'>
                    <BookOpenText className='size-4' aria-hidden='true' />
                    {_('Source anchor')}
                  </h3>
                  <p className='mt-1 text-xs text-[var(--lb-review-muted)]'>
                    {[answer.anchor.title, answer.anchor.chapter, answer.anchor.pageLabel]
                      .filter((part): part is string => Boolean(part?.trim()))
                      .join(' · ')}
                  </p>
                  <blockquote className='mt-3 border-l border-[var(--lb-review-border)] ps-3 text-sm leading-6'>
                    {answer.anchor.sourceText}
                  </blockquote>
                </section>
              </div>
            )}

            <div className='mt-4 flex flex-wrap gap-2 border-t border-[var(--lb-review-border)] pt-3'>
              <span className='me-1 flex items-center text-xs text-[var(--lb-review-muted)]'>
                <Flag className='me-1 size-3.5' aria-hidden='true' />
                {_('Remove this question:')}
              </span>
              <button
                type='button'
                className='min-h-11 rounded-lg px-2 text-xs font-medium underline underline-offset-4 disabled:opacity-50'
                disabled={pendingAction !== null || gradeRecovery !== null}
                onClick={() => suppress('ambiguous_question')}
              >
                {_('Ambiguous')}
              </button>
              {current.recallItem.kind === 'multiple_choice' && (
                <button
                  type='button'
                  className='min-h-11 rounded-lg px-2 text-xs font-medium underline underline-offset-4 disabled:opacity-50'
                  disabled={pendingAction !== null || gradeRecovery !== null}
                  onClick={() => suppress('bad_distractor')}
                >
                  {_('Bad choice')}
                </button>
              )}
            </div>

            {recoveryNotice}
          </div>

          {answer && (
            <footer className='shrink-0 border-t border-[var(--lb-review-border)] bg-[var(--lb-review-recessed)] p-3'>
              <p className='mb-2 text-center text-xs text-[var(--lb-review-muted)]'>
                {_('How well did you recall it? Use keys 1–4.')}
              </p>
              <fieldset className='grid grid-cols-2 gap-2'>
                <legend className='sr-only'>{_('Recall grade')}</legend>
                {LEARNINGBORED_REVIEW_GRADES.map((value, index) => {
                  const preview = current.intervalPreviews[value];
                  const interval = formatInterval(preview.intervalSeconds, preview.intervalDays);
                  return (
                    <button
                      key={value}
                      type='button'
                      aria-keyshortcuts={String(index + 1)}
                      aria-label={_(`${GRADE_LABELS[value]}, next review ${interval}`)}
                      className='learningbored-review-grade min-h-14 rounded-xl border px-3 py-2 text-start disabled:opacity-50'
                      disabled={pendingAction !== null || gradeRecovery !== null}
                      onClick={() => grade(value)}
                    >
                      <span className='flex items-center justify-between gap-2 text-sm font-semibold'>
                        {_(GRADE_LABELS[value])}
                        <kbd className='text-[10px] font-normal opacity-60'>{index + 1}</kbd>
                      </span>
                      <span className='mt-0.5 block text-xs text-[var(--lb-review-muted)]'>
                        {interval}
                      </span>
                    </button>
                  );
                })}
              </fieldset>
            </footer>
          )}
        </>
      )}
    </LearningBoredReviewSurfaceShell>
  );
};

export default LearningBoredReviewPanel;
