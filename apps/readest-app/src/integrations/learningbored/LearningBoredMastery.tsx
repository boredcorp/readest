'use client';

import { BookOpenText, ChevronDown, RotateCcw } from 'lucide-react';
import { useId, useState } from 'react';

import type {
  LearningBoredConceptMastery,
  LearningBoredMasteryResult,
  LearningBoredMasteryTier,
} from './client';
import { useLearningBoredTranslation } from './presentation/context';
import { learningBoredProgressStyles as styles } from './progress/LearningBoredProgressShell';

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

const MASTERY_TIERS = ['new', 'learning', 'retained', 'lapsed'] as const;

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

function dueLabel(concept: LearningBoredConceptMastery): string {
  if (concept.dueCount === 0) return 'No items due';
  return concept.dueCount === 1 ? '1 due' : `${concept.dueCount} due`;
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
  const _ = useLearningBoredTranslation();
  const total = mastery.concepts.length;

  return (
    <section aria-labelledby='learningbored-mastery-heading' className={styles['section']}>
      <div className={styles['sectionHeader']}>
        <div>
          <h2 className={styles['sectionTitle']} id='learningbored-mastery-heading'>
            {_('Concept progress')}
          </h2>
          <p className={styles['sectionCopy']}>
            {_('Mastery reflects anchored recall only. Added explanations never affect it.')}
          </p>
        </div>
        <button
          aria-pressed={selectedTier === null}
          className={`${styles['secondaryButton']} ${styles['filterReset']}`}
          onClick={() => onSelectTier(null)}
          type='button'
        >
          {total === 1 ? _('1 concept') : _(`${total} concepts`)}
        </button>
      </div>

      <ul aria-label={_('Filter concepts by mastery state')} className={styles['tierFilters']}>
        {MASTERY_TIERS.map((tier) => (
          <li key={tier}>
            <button
              aria-label={`${_(TIER_LABELS[tier])}: ${mastery.summary[tier]}`}
              aria-pressed={selectedTier === tier}
              className={styles['filterButton']}
              disabled={mastery.summary[tier] === 0}
              onClick={() => onSelectTier(tier)}
              type='button'
            >
              <span aria-hidden='true' className={styles['tierLabel']}>
                <span aria-hidden='true' className={styles['tierMarker']} data-tier={tier} />
                <span>{_(TIER_LABELS[tier])}</span>
              </span>
              <span aria-hidden='true' className={styles['tierCount']}>
                {mastery.summary[tier]}
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
  emptyMessage?: string;
  initialExpandedConceptId?: string | null;
}

export const LearningBoredConceptList: React.FC<LearningBoredConceptListProps> = ({
  concepts,
  onOpenBoard,
  onStartReview,
  heading = 'Needs your attention',
  emptyMessage = 'No grounded concepts are available yet.',
  initialExpandedConceptId = null,
}) => {
  const _ = useLearningBoredTranslation();
  const headingId = useId();
  const instanceId = useId();
  const [expandedConceptId, setExpandedConceptId] = useState<string | null>(
    initialExpandedConceptId,
  );
  const sortedConcepts = sortLearningBoredConceptsByAttention(concepts);

  return (
    <section aria-labelledby={headingId} className={styles['section']}>
      <h3 className={styles['sectionTitle']} id={headingId}>
        {_(heading)}
      </h3>
      {sortedConcepts.length > 0 ? (
        <ol className={styles['conceptList']}>
          {sortedConcepts.map((concept) => {
            const detailsId = `${instanceId}-${concept.conceptId}`;
            const expanded = expandedConceptId === concept.conceptId;
            const basis =
              concept.itemCount === 1
                ? _('Based on 1 anchored recall item')
                : _(`Based on ${concept.itemCount} anchored recall items`);
            const reviewDate =
              concept.lastReviewedAt === null
                ? _('Not reviewed yet')
                : reviewedDateLabel(concept.lastReviewedAt);

            return (
              <li
                className={styles['conceptCard']}
                data-expanded={expanded ? 'true' : 'false'}
                data-tier={concept.tier}
                key={concept.conceptId}
              >
                <h4 className={styles['conceptCardHeading']}>{concept.name}</h4>
                <button
                  aria-label={`${concept.name}. ${_(TIER_LABELS[concept.tier])}. ${_(scoreLabel(concept))}. ${_(dueLabel(concept))}. ${basis}. ${
                    concept.lastReviewedAt === null
                      ? reviewDate
                      : `${_('Last reviewed')} ${reviewDate}`
                  }`}
                  aria-controls={detailsId}
                  aria-expanded={expanded}
                  className={styles['conceptToggle']}
                  onClick={() => setExpandedConceptId(expanded ? null : concept.conceptId)}
                  type='button'
                >
                  <span>
                    <span className={styles['conceptMeta']}>
                      {basis} ·{' '}
                      {concept.lastReviewedAt === null ? (
                        reviewDate
                      ) : (
                        <>
                          {_('Last reviewed')}{' '}
                          <time dateTime={concept.lastReviewedAt}>{reviewDate}</time>
                        </>
                      )}
                    </span>
                  </span>
                  <span className={styles['conceptValueRow']}>
                    <span className={styles['tierBadge']} data-tier={concept.tier}>
                      {_(TIER_LABELS[concept.tier])}
                    </span>
                    <strong className={styles['score']}>{_(scoreLabel(concept))}</strong>
                    <span className={styles['dueLabel']}>{_(dueLabel(concept))}</span>
                    <ChevronDown aria-hidden='true' className={styles['conceptChevron']} />
                  </span>
                </button>

                {expanded ? (
                  <div className={styles['conceptDetails']} id={detailsId}>
                    <dl className={styles['evidence']}>
                      <dt>{_('Anchored recall')}</dt>
                      <dd>{concept.itemCount}</dd>
                      <dt>{_('Last review')}</dt>
                      <dd>{reviewDate}</dd>
                    </dl>

                    {concept.dueCount > 0 ? (
                      <section
                        aria-label={
                          concept.dueCount === 1
                            ? _(`1 due item for ${concept.name}`)
                            : _(`${concept.dueCount} due items for ${concept.name}`)
                        }
                        className={styles['dueRegion']}
                      >
                        <h5 className={styles['dueHeading']}>
                          {concept.dueCount === 1
                            ? _('1 due recall item')
                            : _(`${concept.dueCount} due recall items`)}
                        </h5>
                        <ul className={styles['dueList']}>
                          {concept.dueItemIds.map((itemId, index) => (
                            <li
                              className={styles['dueItem']}
                              data-recall-item-id={itemId}
                              key={itemId}
                            >
                              {_(`Due recall item ${index + 1}`)}
                            </li>
                          ))}
                        </ul>
                        {concept.dueCount > concept.dueItemIds.length ? (
                          <p className={styles['supportCopy']}>
                            {_(`${concept.dueCount - concept.dueItemIds.length} more due`)}
                          </p>
                        ) : null}
                      </section>
                    ) : null}

                    <div className={styles['actionRow']}>
                      {concept.boardIds.map((boardId, index) => (
                        <button
                          className={styles['secondaryButton']}
                          key={boardId}
                          onClick={() => onOpenBoard(boardId)}
                          type='button'
                        >
                          <BookOpenText aria-hidden='true' />
                          {concept.boardIds.length === 1
                            ? _('Open Board')
                            : _(`Open Board ${index + 1}`)}
                        </button>
                      ))}
                      {concept.dueCount > 0 ? (
                        <button
                          className={styles['primaryButton']}
                          onClick={() => onStartReview(concept.conceptId)}
                          type='button'
                        >
                          <RotateCcw aria-hidden='true' />
                          {_('Review this concept')}
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className={styles['sectionCopy']}>{_(emptyMessage)}</p>
      )}
    </section>
  );
};
