'use client';

import { BookOpenCheck } from 'lucide-react';

import { useTranslation } from '@/hooks/useTranslation';
import type { LearningBoredDocumentSummary } from './client';

export interface LearningBoredLibraryStatusProps {
  document: LearningBoredDocumentSummary | null;
}

type Translate = (message: string) => string;

export interface LearningBoredLibraryStatusLabels {
  dueLabel: string;
  boardLabel: string;
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
        : translate(`${document.dueCount} due`);
  const boardLabel =
    document.boardCount === 1 ? translate('1 Board') : translate(`${document.boardCount} Boards`);

  return {
    dueLabel,
    boardLabel,
    accessibleLabel: `${dueLabel}. ${boardLabel}`,
  };
}

const LearningBoredLibraryStatus: React.FC<LearningBoredLibraryStatusProps> = ({ document }) => {
  const _ = useTranslation();
  if (!document) return null;

  const labels = getLearningBoredLibraryStatusLabels(document, _);
  if (!labels) return null;

  return (
    <p
      className='text-base-content/70 flex min-h-5 items-center gap-1.5 truncate text-xs'
      aria-hidden='true'
    >
      <BookOpenCheck className='size-3.5 shrink-0' aria-hidden='true' />
      <strong className={document.dueCount > 0 ? 'text-base-content' : undefined}>
        {labels.dueLabel}
      </strong>
      <span aria-hidden='true'>·</span>
      <span>{labels.boardLabel}</span>
    </p>
  );
};

export default LearningBoredLibraryStatus;
