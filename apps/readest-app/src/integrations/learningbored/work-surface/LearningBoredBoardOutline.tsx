'use client';

import type { CSSProperties, ReactNode } from 'react';

import type { LearningBoredBoardOutlineItem, LearningBoredSourceSpan } from '../client';
import type { LearningBoredTranslationFunc } from '../presentation/context';
import { formatLearningBoredCopy } from '../presentation/context';

import styles from './LearningBoredWorkSurface.module.css';

export interface LearningBoredSourceInteractionProps {
  span?: LearningBoredSourceSpan;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  onEnter?: (span: LearningBoredSourceSpan) => void;
  onLeave?: () => void;
}

export function LearningBoredSourceInteraction({
  span,
  children,
  className,
  style,
  onEnter,
  onLeave,
}: LearningBoredSourceInteractionProps) {
  if (!span) {
    return (
      <span className={className} style={style}>
        {children}
      </span>
    );
  }

  return (
    <button
      type='button'
      className={`${styles['sourceButton']} ${className ?? ''}`}
      style={style}
      data-interactive='true'
      data-source-start={span.sourceStart}
      data-source-end={span.sourceEnd}
      onMouseEnter={() => onEnter?.(span)}
      onMouseLeave={onLeave}
      onFocus={() => onEnter?.(span)}
      onBlur={onLeave}
    >
      {children}
    </button>
  );
}

export interface LearningBoredBoardOutlineProps {
  items: LearningBoredBoardOutlineItem[];
  onSourceSpanEnter?: (span: LearningBoredSourceSpan) => void;
  onSourceSpanLeave?: () => void;
  translate?: LearningBoredTranslationFunc;
}

export default function LearningBoredBoardOutline({
  items,
  onSourceSpanEnter,
  onSourceSpanLeave,
  translate = formatLearningBoredCopy,
}: LearningBoredBoardOutlineProps) {
  return (
    <ol className={styles['outline']} aria-label={translate('Board text outline')}>
      {items.map((item) => (
        <li key={item.id} className={styles['outlineItem']} data-provenance={item.provenance}>
          <LearningBoredSourceInteraction
            span={item.sourceSpan}
            onEnter={onSourceSpanEnter}
            onLeave={onSourceSpanLeave}
            className={styles['outlineBody']}
          >
            <span className={styles['outlineLabel']}>{item.label}</span>
            {item.kind === 'relationship' || item.kind === 'group' ? (
              <span className={styles['outlineMeta']}>
                {translate(item.kind === 'relationship' ? 'Relationship' : 'Group')}
              </span>
            ) : null}
            {item.provenance === 'scaffold' ? (
              <span className={styles['scaffoldMarker']}>
                {translate('Added to help — not from your document')}
                {item.scaffoldForm ? ` · ${translate(item.scaffoldForm.replace('_', ' '))}` : ''}
              </span>
            ) : null}
            <span className={styles['outlineDescription']}>{item.description}</span>
            {item.caption ? (
              <span className={styles['outlineDetail']}>
                <strong>{translate('Figure caption:')}</strong> {item.caption}
              </span>
            ) : null}
            {item.analogyLimit ? (
              <span className={styles['outlineDetail']}>
                <strong>{translate('Where the analogy stops:')}</strong> {item.analogyLimit}
              </span>
            ) : null}
            {item.undefined ? (
              <span className={styles['outlineWarning']}>
                {translate('Named but not defined in the passage')}
              </span>
            ) : null}
            {item.figureFailed ? (
              <span className={styles['outlineDetail']}>
                {translate('Illustration unavailable. The structural explanation remains.')}
              </span>
            ) : null}
          </LearningBoredSourceInteraction>
          {item.labels && item.labels.length > 0 ? (
            <ol className={styles['labelList']} aria-label={translate('Figure labels')}>
              {item.labels.map((label, index) => (
                <li key={label.id}>
                  <LearningBoredSourceInteraction
                    span={label.sourceSpan}
                    onEnter={onSourceSpanEnter}
                    onLeave={onSourceSpanLeave}
                  >
                    <strong>
                      {index + 1}. {label.text}:
                    </strong>{' '}
                    {label.description}
                  </LearningBoredSourceInteraction>
                </li>
              ))}
            </ol>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
