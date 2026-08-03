'use client';

import { BookOpenText, RotateCcw } from 'lucide-react';
import { useId } from 'react';

import { useTranslation } from '@/hooks/useTranslation';
import type {
  LearningBoredConceptMastery,
  LearningBoredMasteryResult,
  LearningBoredMasteryTier,
} from './client';

const TIER_PRIORITY: Record<LearningBoredMasteryTier, number> = {
  lapsed: 0,
  learning: 1,
  new: 2,
  retained: 3,
};

const TIER_LABELS: Record<LearningBoredMasteryTier, string> = {
  new: 'New',
  learning: 'Learning',
  retained: 'Retained',
  lapsed: 'Lapsed',
};

export function sortLearningBoredConceptsByAttention(
  concepts: readonly LearningBoredConceptMastery[],
): LearningBoredConceptMastery[] {
  return [...concepts].sort(
    (left, right) =>
      TIER_PRIORITY[left.tier] - TIER_PRIORITY[right.tier] ||
      right.dueCount - left.dueCount ||
      (left.score ?? -1) - (right.score ?? -1) ||
      left.name.localeCompare(right.name) ||
      left.conceptId.localeCompare(right.conceptId),
  );
}

function scoreLabel(concept: LearningBoredConceptMastery): string {
  if (concept.score === null) return 'Not started';
  return `${Math.floor(concept.score * 100)}%`;
}

function reviewedDateLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
}

export interface LearningBoredMasterySummaryProps {
  mastery: LearningBoredMasteryResult;
  selectedTier: LearningBoredMasteryTier | null;
  onSelectTier: (tier: LearningBoredMasteryTier | null) => void;
}

export const LearningBoredMasterySummary: React.FC<LearningBoredMasterySummaryProps> = ({
  mastery,
  selectedTier,
  onSelectTier,
}) => {
  const _ = useTranslation();
  const total = mastery.concepts.length;

  return (
    <section aria-labelledby='learningbored-mastery-heading'>
      <div className='flex items-end justify-between gap-3'>
        <div>
          <p className='text-xs font-semibold uppercase tracking-[0.12em] text-[var(--lb-progress-muted)]'>
            {_('Anchored recall only')}
          </p>
          <h2 id='learningbored-mastery-heading' className='mt-1 text-2xl font-semibold'>
            {_('Concept progress')}
          </h2>
        </div>
        <button
          type='button'
          className='btn btn-ghost btn-sm min-h-11 text-[var(--lb-progress-muted)]'
          aria-pressed={selectedTier === null}
          onClick={() => onSelectTier(null)}
        >
          {total === 1 ? _('1 concept') : _(`${total} concepts`)}
        </button>
      </div>

      <div
        className='mt-4 flex h-3 overflow-hidden rounded-full border border-[var(--lb-progress-border)] bg-[var(--lb-progress-raised)]'
        aria-hidden='true'
      >
        {(['new', 'learning', 'retained', 'lapsed'] as const).map((tier) => {
          const count = mastery.summary[tier];
          return count > 0 ? (
            <span
              key={tier}
              className={`learningbored-mastery-fill learningbored-mastery-fill-${tier}`}
              style={{ width: `${(count / Math.max(1, total)) * 100}%` }}
              title={`${TIER_LABELS[tier]}: ${count}`}
            />
          ) : null;
        })}
      </div>

      <ul className='mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4'>
        {(['new', 'learning', 'retained', 'lapsed'] as const).map((tier) => (
          <li key={tier}>
            <button
              type='button'
              className='btn btn-ghost min-h-11 w-full justify-start gap-2 px-2 text-xs'
              aria-pressed={selectedTier === tier}
              onClick={() => onSelectTier(tier)}
            >
              <span
                className={`learningbored-mastery-marker learningbored-mastery-marker-${tier}`}
                aria-hidden='true'
              />
              <span>
                {_(TIER_LABELS[tier])}: {mastery.summary[tier]}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
};

export interface LearningBoredConceptListProps {
  concepts: readonly LearningBoredConceptMastery[];
  onOpenBoard: (boardId: string) => void;
  onStartReview: (conceptId: string) => void;
  heading?: string;
}

export const LearningBoredConceptList: React.FC<LearningBoredConceptListProps> = ({
  concepts,
  onOpenBoard,
  onStartReview,
  heading = 'Needs your attention',
}) => {
  const _ = useTranslation();
  const headingId = useId();
  const sortedConcepts = sortLearningBoredConceptsByAttention(concepts);

  return (
    <section className='mt-6' aria-labelledby={headingId}>
      <h3 id={headingId} className='text-base font-semibold'>
        {_(heading)}
      </h3>
      {sortedConcepts.length > 0 ? (
        <ol className='mt-3 space-y-3'>
          {sortedConcepts.map((concept) => {
            const firstBoardId = concept.boardIds[0];
            const hasProgressAction = concept.dueCount > 0 || firstBoardId !== undefined;
            const basis =
              concept.itemCount === 1
                ? _('Based on 1 anchored recall item')
                : _(`Based on ${concept.itemCount} anchored recall items`);
            const action =
              concept.dueCount > 0
                ? _('Review due')
                : firstBoardId !== undefined
                  ? _('Open Board')
                  : null;

            const progressContent = (
              <>
                <span className='min-w-0 text-left text-xs leading-5 text-[var(--lb-progress-muted)]'>
                  <span className='block'>{basis}</span>
                  <span className='block'>
                    {concept.lastReviewedAt === null ? (
                      _('Not reviewed yet')
                    ) : (
                      <>
                        {_('Last reviewed')}{' '}
                        <time dateTime={concept.lastReviewedAt}>
                          {reviewedDateLabel(concept.lastReviewedAt)}
                        </time>
                      </>
                    )}
                  </span>
                </span>
                <span className='shrink-0 text-right'>
                  <span className='learningbored-mastery-tier inline-flex rounded-full border px-2 py-1 text-xs font-semibold'>
                    {_(TIER_LABELS[concept.tier])}
                  </span>
                  <strong className='mt-1 block text-sm'>{_(scoreLabel(concept))}</strong>
                  {action ? (
                    <span className='mt-1 block text-xs font-semibold text-[var(--lb-progress-focus)]'>
                      {action}
                    </span>
                  ) : null}
                </span>
                {hasProgressAction ? (
                  <span className='sr-only'>
                    {concept.dueCount > 0
                      ? concept.dueCount === 1
                        ? _(`Review 1 due item for ${concept.name}`)
                        : _(`Review ${concept.dueCount} due items for ${concept.name}`)
                      : _(`Open the first Board for ${concept.name}`)}
                  </span>
                ) : null}
              </>
            );

            return (
              <li
                key={concept.conceptId}
                className={`learningbored-mastery-card learningbored-mastery-card-${concept.tier} rounded-xl border p-4`}
              >
                <h4 className='font-semibold leading-6'>{concept.name}</h4>

                {hasProgressAction ? (
                  <button
                    type='button'
                    className='mt-3 flex min-h-11 w-full items-start justify-between gap-3 rounded-lg border border-[var(--lb-progress-border)] bg-[var(--lb-progress-raised)] p-3'
                    onClick={() => {
                      if (concept.dueCount > 0) onStartReview(concept.conceptId);
                      else if (firstBoardId !== undefined) onOpenBoard(firstBoardId);
                    }}
                  >
                    {progressContent}
                  </button>
                ) : (
                  <div className='mt-3 flex items-start justify-between gap-3'>
                    {progressContent}
                  </div>
                )}

                <div className='mt-3 flex flex-wrap gap-2'>
                  {concept.boardIds.length > 0
                    ? concept.boardIds.map((boardId, index) => (
                        <button
                          key={boardId}
                          type='button'
                          className='btn btn-outline btn-sm min-h-11'
                          onClick={() => onOpenBoard(boardId)}
                        >
                          <BookOpenText className='size-4' />
                          {concept.boardIds.length === 1
                            ? _('Open Board')
                            : _(`Open Board ${index + 1}`)}
                        </button>
                      ))
                    : null}
                  {concept.dueCount > 0 ? (
                    <button
                      type='button'
                      className='btn btn-primary btn-sm min-h-11'
                      onClick={() => onStartReview(concept.conceptId)}
                    >
                      <RotateCcw className='size-4' />
                      {concept.dueCount === 1
                        ? _('Review 1 due')
                        : _(`Review ${concept.dueCount} due`)}
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className='mt-3 text-sm text-[var(--lb-progress-muted)]'>
          {_('No grounded concepts are available yet.')}
        </p>
      )}
    </section>
  );
};
