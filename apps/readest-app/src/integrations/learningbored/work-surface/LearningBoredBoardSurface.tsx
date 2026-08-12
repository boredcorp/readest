'use client';

import { BarChart3, BookOpenText, Clock3, Flag } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';

import DOMPurify from 'dompurify';
import {
  LEARNINGBORED_BOARD_KINDS,
  type LearningBoredBoardFigure,
  type LearningBoredBoardKind,
  type LearningBoredBoardResult,
  type LearningBoredSourceSpan,
} from '../client';
import type { LearningBoredTranslationFunc } from '../presentation/context';
import { formatLearningBoredCopy } from '../presentation/context';

import DroppedClaimsNotice from './DroppedClaimsNotice';
import LearningBoredBoardOutline, {
  LearningBoredSourceInteraction,
} from './LearningBoredBoardOutline';
import LearningBoredFigureSurface from './LearningBoredFigureSurface';
import styles from './LearningBoredWorkSurface.module.css';

export const LEARNINGBORED_BOARD_KIND_LABELS: Record<LearningBoredBoardKind, string> = {
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

function sanitizeBoardSvg(svg?: string | null): string | null {
  if (!svg) return null;
  return DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    ADD_ATTR: ['data-provenance', 'data-source-start', 'data-source-end', 'role', 'tabindex'],
  });
}

function useDesktopBoardVisual(): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 640px)');
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return matches;
}

function sourceSpanFromTarget(target: EventTarget | null): LearningBoredSourceSpan | null {
  if (!(target instanceof Element)) return null;
  const anchor = target.closest<HTMLElement>('[data-source-start][data-source-end]');
  if (!anchor) return null;
  const sourceStart = Number(anchor.dataset['sourceStart']);
  const sourceEnd = Number(anchor.dataset['sourceEnd']);
  return Number.isInteger(sourceStart) && Number.isInteger(sourceEnd) && sourceEnd > sourceStart
    ? { sourceStart, sourceEnd }
    : null;
}

export interface LearningBoredBoardSurfaceProps {
  board: LearningBoredBoardResult;
  selectedKind: LearningBoredBoardKind;
  showScaffold: boolean;
  rerendering?: boolean;
  droppedClaimCount?: number;
  replaceDisabled?: boolean;
  onKindChange?: (kind: LearningBoredBoardKind) => void;
  onScaffoldChange?: (visible: boolean) => void;
  onReplaceFigure?: (figure: LearningBoredBoardFigure, trigger: HTMLButtonElement) => void;
  onStartReview?: (documentId: string) => void;
  onOpenProgress?: (documentId: string) => void;
  onReport?: () => void;
  reportOpen?: boolean;
  reportControlsId?: string;
  figureReplacement?: ReactNode;
  comprehension?: ReactNode;
  reportForm?: ReactNode;
  showActions?: boolean;
  onSourceSpanEnter?: (span: LearningBoredSourceSpan) => void;
  onSourceSpanLeave?: () => void;
  translate?: LearningBoredTranslationFunc;
}

export default function LearningBoredBoardSurface({
  board,
  selectedKind,
  showScaffold,
  rerendering = false,
  droppedClaimCount = 0,
  replaceDisabled = false,
  onKindChange,
  onScaffoldChange,
  onReplaceFigure,
  onStartReview,
  onOpenProgress,
  onReport,
  reportOpen = false,
  reportControlsId,
  figureReplacement,
  comprehension,
  reportForm,
  showActions = true,
  onSourceSpanEnter,
  onSourceSpanLeave,
  translate = formatLearningBoredCopy,
}: LearningBoredBoardSurfaceProps) {
  const desktopBoardVisual = useDesktopBoardVisual();
  const visibleOutline = showScaffold
    ? board.outline
    : board.outline.filter((item) => item.provenance !== 'scaffold');
  const visibleFigures = showScaffold
    ? board.figures
    : board.figures.filter((figure) => figure.provenance !== 'scaffold');
  const selectedSvg = showScaffold ? board.svg : board.svgWithoutScaffold;
  const sanitizedSvg = useMemo(() => sanitizeBoardSvg(selectedSvg), [selectedSvg]);

  return (
    <>
      <section className={styles['toolbar']}>
        <div className={styles['toolbarRow']}>
          <label className={styles['field']} htmlFor='learningbored-kind'>
            <span className={styles['fieldLabel']}>{translate('Board shape')}</span>
            <select
              id='learningbored-kind'
              className={styles['select']}
              value={selectedKind}
              disabled={rerendering || !onKindChange}
              onChange={(event) => onKindChange?.(event.target.value as LearningBoredBoardKind)}
            >
              {LEARNINGBORED_BOARD_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {translate(LEARNINGBORED_BOARD_KIND_LABELS[kind])}
                </option>
              ))}
            </select>
          </label>
          <label className={styles['toggleLabel']}>
            <input
              type='checkbox'
              checked={showScaffold}
              disabled={!onScaffoldChange}
              onChange={(event) => onScaffoldChange?.(event.target.checked)}
            />
            {translate('Added help')}
          </label>
        </div>
        <p className={styles['freeCopy']}>
          <span>{translate('Changing Board shape is free.')}</span>{' '}
          <span>{translate('No Chalk is charged.')}</span>
        </p>
        {rerendering ? (
          <p className={`${styles['muted']} ${styles['inlineStatus']}`} role='status'>
            <Clock3 aria-hidden='true' />
            {translate('Changing the Board shape…')}
          </p>
        ) : null}
      </section>

      <section className={styles['section']}>
        <h3 className={styles['boardTitle']}>
          <LearningBoredSourceInteraction
            span={board.titleSourceSpan}
            onEnter={onSourceSpanEnter}
            onLeave={onSourceSpanLeave}
          >
            {board.title}
          </LearningBoredSourceInteraction>
        </h3>
        <DroppedClaimsNotice count={droppedClaimCount} translate={translate} />
        {desktopBoardVisual && sanitizedSvg ? (
          <div
            className={`learningbored-svg ${styles['boardSvg']}`}
            role='region'
            aria-label={translate('Board visual — scroll to explore')}
            tabIndex={0}
            data-testid='learningbored-board-pan'
            onMouseOver={(event) => {
              const span = sourceSpanFromTarget(event.target);
              if (span) onSourceSpanEnter?.(span);
            }}
            onMouseOut={(event) => {
              if (sourceSpanFromTarget(event.target)) onSourceSpanLeave?.();
            }}
            onFocusCapture={(event) => {
              const span = sourceSpanFromTarget(event.target);
              if (span) onSourceSpanEnter?.(span);
            }}
            onBlurCapture={onSourceSpanLeave}
            dangerouslySetInnerHTML={{ __html: sanitizedSvg }}
          />
        ) : null}
        <LearningBoredBoardOutline
          items={visibleOutline}
          onSourceSpanEnter={onSourceSpanEnter}
          onSourceSpanLeave={onSourceSpanLeave}
          translate={translate}
        />
      </section>

      {desktopBoardVisual && visibleFigures.length > 0 ? (
        <section className={styles['section']} aria-label={translate('Figure actions')}>
          <div className={styles['figureList']}>
            {visibleFigures.map((figure, index) => (
              <button
                key={figure.id}
                type='button'
                className={styles['secondaryButton']}
                aria-label={`${translate('Replace figure')} ${index + 1}: ${figure.description}`}
                disabled={replaceDisabled || !onReplaceFigure}
                onClick={(event) => onReplaceFigure?.(figure, event.currentTarget)}
              >
                <span>
                  {translate('Replace figure')} {index + 1}
                </span>
                <span className={styles['figureActionDescription']}>{figure.description}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {!desktopBoardVisual && visibleFigures.length > 0 ? (
        <section className={styles['section']}>
          <h3 className={styles['sectionHeading']}>{translate('Figures')}</h3>
          <div className={styles['figureList']}>
            {visibleFigures.map((figure, index) => (
              <LearningBoredFigureSurface
                key={figure.id}
                figure={figure}
                visualAriaLabel={`${translate('Figure')} ${index + 1} — ${translate('scroll to explore')}: ${figure.description}`}
                replaceDisabled={replaceDisabled}
                onReplace={
                  onReplaceFigure ? (trigger) => onReplaceFigure(figure, trigger) : undefined
                }
                translate={translate}
              />
            ))}
          </div>
        </section>
      ) : null}

      {figureReplacement}

      <section className={styles['section']}>
        <h3 className={styles['sectionHeading']}>{translate('Recall preview')}</h3>
        <p className={styles['sectionCopy']}>
          {translate('These questions will be ready for review. Answers are not shown here.')}
        </p>
        {board.recallQuestions.length > 0 ? (
          <>
            <ol className={styles['recallList']}>
              {board.recallQuestions.map((item, index) => (
                <li key={item.id} className={styles['recallItem']}>
                  <span className={styles['recallNumber']}>{index + 1}.</span>
                  {item.question}
                </li>
              ))}
            </ol>
            {onStartReview ? (
              <div className={styles['buttonStack']}>
                <button
                  type='button'
                  className={`${styles['primaryButton']} ${styles['fullWidth']}`}
                  onClick={() => onStartReview(board.documentId)}
                >
                  <BookOpenText aria-hidden='true' />
                  {translate('Start review')}
                </button>
              </div>
            ) : null}
          </>
        ) : (
          <p className={styles['sectionCopy']}>{translate('No recall questions were created.')}</p>
        )}
      </section>

      {comprehension}

      {showActions && (onOpenProgress || onReport) ? (
        <section className={styles['section']}>
          <div className={styles['buttonGrid']}>
            <button
              type='button'
              className={styles['secondaryButton']}
              disabled={!onOpenProgress}
              onClick={() => onOpenProgress?.(board.documentId)}
            >
              <BarChart3 aria-hidden='true' />
              {translate('Progress')}
            </button>
            <button
              type='button'
              className={styles['textButton']}
              disabled={!onReport}
              aria-expanded={onReport ? reportOpen : undefined}
              aria-controls={onReport ? reportControlsId : undefined}
              onClick={onReport}
            >
              <Flag aria-hidden='true' />
              {translate('Report')}
            </button>
          </div>
          {reportForm}
        </section>
      ) : null}
    </>
  );
}
