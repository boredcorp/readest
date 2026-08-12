'use client';

import DOMPurify from 'dompurify';
import { Check, Clock3, RefreshCw, ShieldAlert } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';

import {
  LEARNINGBORED_FIGURE_REGENERATION_ISSUES,
  type LearningBoredBoardFigure,
  type LearningBoredFigureRegenerationIssue,
  type LearningBoredFigureRegenerationSnapshot,
} from '../client';
import type { LearningBoredTranslationFunc } from '../presentation/context';
import { formatLearningBoredCopy } from '../presentation/context';

import styles from './LearningBoredWorkSurface.module.css';

export interface LearningBoredFigureRegenerationDraftView {
  figure: LearningBoredBoardFigure;
  issue: LearningBoredFigureRegenerationIssue;
}

const FIGURE_REGENERATION_ISSUE_LABELS: Record<LearningBoredFigureRegenerationIssue, string> = {
  wrong_arrangement: 'The arrangement is wrong',
  missing_part: 'A required part is missing',
  too_detailed: 'The picture is too detailed',
  too_abstract: 'The picture is too abstract',
  unclear: 'The picture is unclear',
};

export function isActiveFigureRegeneration(
  regeneration: LearningBoredFigureRegenerationSnapshot | null,
): boolean {
  return Boolean(
    regeneration && ['queued', 'illustrating', 'validating'].includes(regeneration.status),
  );
}

export function getFigureRegenerationLabel(
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

function sanitizeProjection(svg?: string | null): string | null {
  if (!svg) return null;
  return DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    ADD_ATTR: ['data-provenance', 'data-source-start', 'data-source-end', 'role', 'tabindex'],
  });
}

export interface LearningBoredFigureSurfaceProps {
  figure: LearningBoredBoardFigure;
  replaceDisabled?: boolean;
  onReplace?: (trigger: HTMLButtonElement) => void;
  visualAriaLabel?: string;
  translate?: LearningBoredTranslationFunc;
}

export default function LearningBoredFigureSurface({
  figure,
  replaceDisabled = false,
  onReplace,
  visualAriaLabel,
  translate = formatLearningBoredCopy,
}: LearningBoredFigureSurfaceProps) {
  const projectionSvg = useMemo(
    () => sanitizeProjection(figure.projectionSvg),
    [figure.projectionSvg],
  );

  return (
    <article className={styles['figureCard']} data-figure-id={figure.id}>
      {projectionSvg ? (
        <div
          className={`learningbored-figure-projection ${styles['figureProjection']}`}
          role='region'
          aria-label={
            visualAriaLabel ??
            `${translate('Figure visual — scroll to explore')}: ${figure.description}`
          }
          tabIndex={0}
          data-testid='learningbored-figure-pan'
          dangerouslySetInnerHTML={{ __html: projectionSvg }}
        />
      ) : (
        <div className={styles['figureFallback']}>
          <p aria-hidden='true'>
            <strong>{translate('Figure unavailable:')}</strong> {figure.description}
          </p>
        </div>
      )}
      {onReplace ? (
        <div className={styles['figureActions']}>
          <button
            type='button'
            className={styles['secondaryButton']}
            aria-label={`${translate('Replace figure')}: ${figure.description}`}
            disabled={replaceDisabled}
            onClick={(event) => onReplace(event.currentTarget)}
          >
            <RefreshCw aria-hidden='true' />
            {translate('Replace figure')}
          </button>
        </div>
      ) : null}
    </article>
  );
}

export interface LearningBoredFigureReplacementStateProps {
  draft: LearningBoredFigureRegenerationDraftView | null;
  regeneration: LearningBoredFigureRegenerationSnapshot | null;
  error: string | null;
  submitting: boolean;
  onIssueChange: (issue: LearningBoredFigureRegenerationIssue) => void;
  onConfirm: () => void;
  onDismiss: () => void;
  translate?: LearningBoredTranslationFunc;
}

export function LearningBoredFigureReplacementState({
  draft,
  regeneration,
  error,
  submitting,
  onIssueChange,
  onConfirm,
  onDismiss,
  translate = formatLearningBoredCopy,
}: LearningBoredFigureReplacementStateProps) {
  const draftHeadingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (draft) draftHeadingRef.current?.focus();
  }, [draft]);

  if (!draft && !regeneration && !error) return null;

  return (
    <section className={styles['section']} aria-label={translate('Figure replacement')}>
      {draft ? (
        <div
          className={styles['replacementPanel']}
          aria-labelledby='learningbored-replace-figure-title'
        >
          <div>
            <h4
              ref={draftHeadingRef}
              id='learningbored-replace-figure-title'
              className={styles['sectionHeading']}
              tabIndex={-1}
            >
              {translate('Replace this figure?')}
            </h4>
            <p className={styles['sectionCopy']}>
              {translate(
                'This uses 1 Chalk. Your current figure stays visible until the replacement passes every check.',
              )}
            </p>
          </div>
          <label className={styles['field']}>
            {translate('What should improve?')}
            <select
              className={styles['select']}
              value={draft.issue}
              disabled={submitting}
              onChange={(event) =>
                onIssueChange(event.target.value as LearningBoredFigureRegenerationIssue)
              }
            >
              {LEARNINGBORED_FIGURE_REGENERATION_ISSUES.map((issue) => (
                <option key={issue} value={issue}>
                  {translate(FIGURE_REGENERATION_ISSUE_LABELS[issue])}
                </option>
              ))}
            </select>
          </label>
          <div className={styles['toolbarRow']}>
            <button
              type='button'
              className={styles['textButton']}
              disabled={submitting}
              onClick={onDismiss}
            >
              {translate('Keep current figure')}
            </button>
            <button
              type='button'
              className={styles['primaryButton']}
              disabled={submitting}
              onClick={onConfirm}
            >
              {submitting ? translate('Starting replacement…') : translate('Use 1 Chalk')}
            </button>
          </div>
        </div>
      ) : null}

      {regeneration ? (
        <div className={styles['replacementPanel']} aria-live='polite'>
          <div className={styles['replacementStatus']}>
            {isActiveFigureRegeneration(regeneration) ? (
              <Clock3 aria-hidden='true' />
            ) : regeneration.status === 'completed' ? (
              <Check aria-hidden='true' />
            ) : (
              <ShieldAlert aria-hidden='true' />
            )}
            <div>
              <h4 className={styles['sectionHeading']}>
                {translate(getFigureRegenerationLabel(regeneration.status))}
              </h4>
              {isActiveFigureRegeneration(regeneration) ? (
                <p className={styles['sectionCopy']}>
                  {translate(
                    'The current figure remains available while the replacement is checked.',
                  )}
                </p>
              ) : null}
              {regeneration.status === 'completed' ? (
                <p className={styles['success']}>
                  {translate(`${regeneration.chalkCost} Chalk charged exactly once.`)}
                </p>
              ) : null}
              {regeneration.status === 'failed' || regeneration.status === 'cancelled' ? (
                <p className={styles['sectionCopy']}>
                  {regeneration.failureReason}{' '}
                  {regeneration.refundConfirmed
                    ? translate('Your Chalk was refunded. The previous figure is unchanged.')
                    : ''}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className={styles['error']} role='alert'>
          {error}
        </p>
      ) : null}
    </section>
  );
}
