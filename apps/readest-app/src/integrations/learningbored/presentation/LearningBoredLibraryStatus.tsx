'use client';

import { BookOpenCheck } from 'lucide-react';

import { useTranslation } from '@/hooks/useTranslation';
import type { LearningBoredDocumentSummary } from '../client';

export interface LearningBoredLibraryStatusProps {
  document: LearningBoredDocumentSummary | null;
  className?: string;
}

type Translate = (message: string, values?: Record<string, string | number>) => string;

export interface LearningBoredLibraryStatusLabels {
  dueLabel: string;
  boardLabel: string;
  recallLabel: string;
  accessibleLabel: string;
}

export function getLearningBoredLibraryStatusLabels(
  document: LearningBoredDocumentSummary | null,
  translate: Translate,
): LearningBoredLibraryStatusLabels | null {
  if (!document) return null;

  const dueLabel =
    document.dueCount === 0
      ? translate('Nothing due')
      : document.dueCount === 1
        ? translate('1 due')
        : translate('{{count}} due', { count: document.dueCount });
  const boardLabel =
    document.boardCount === 1
      ? translate('1 Board')
      : translate('{{count}} Boards', { count: document.boardCount });
  const recallLabel =
    document.recallItemCount === 1
      ? translate('1 recall item')
      : translate('{{count}} recall items', { count: document.recallItemCount });

  return {
    dueLabel,
    boardLabel,
    recallLabel,
    accessibleLabel: `${dueLabel}. ${boardLabel}. ${recallLabel}`,
  };
}

const LearningBoredLibraryStatus: React.FC<LearningBoredLibraryStatusProps> = ({
  document,
  className,
}) => {
  const _ = useTranslation();
  if (!document) return null;

  const labels = getLearningBoredLibraryStatusLabels(document, _);
  if (!labels) return null;

  return (
    <p
      className={
        className ?? 'text-base-content/70 flex min-h-5 items-center gap-1.5 truncate text-xs'
      }
      aria-hidden='true'
    >
      <span className='lb-library-status-due'>
        <BookOpenCheck className='size-3.5 shrink-0' aria-hidden='true' />
        <strong className={document.dueCount > 0 ? 'text-base-content' : undefined}>
          {labels.dueLabel}
        </strong>
      </span>
      <span className='lb-library-status-metrics'>
        <span>{labels.boardLabel}</span>
        <span aria-hidden='true'>·</span>
        <span>{labels.recallLabel}</span>
      </span>
    </p>
  );
};

export default LearningBoredLibraryStatus;
