'use client';

import { BookOpenText, X } from 'lucide-react';
import type { ReactNode } from 'react';

import type { LearningBoredTranslationFunc } from '../presentation/context';
import { formatLearningBoredCopy } from '../presentation/context';

const REVIEW_SURFACE_STYLES = `
  .learningbored-review-panel {
    --lb-review-paper: #faf7f0;
    --lb-review-raised: #fffdf8;
    --lb-review-recessed: #eee7da;
    --lb-review-border: #d8cdbd;
    --lb-review-ink: #172633;
    --lb-review-muted: #586873;
    --lb-review-focus: #0d6870;
    --lb-review-focus-soft: #dceceb;
    --lb-review-anchor: #9b6b16;
    --lb-review-danger: #8a3f36;
    background: var(--lb-review-paper);
    border-color: var(--lb-review-border);
    color: var(--lb-review-ink);
    height: 78dvh;
    min-height: 0;
  }
  .learningbored-review-card {
    background: var(--lb-review-raised);
    border-color: var(--lb-review-border);
  }
  .learningbored-review-question {
    font-family: Georgia, 'Times New Roman', serif;
    text-wrap: balance;
  }
  .learningbored-review-panel :focus-visible {
    outline: 3px solid var(--lb-review-focus);
    outline-offset: 3px;
  }
  .learningbored-review-primary {
    background: var(--lb-review-focus);
    color: white;
  }
  .learningbored-review-grade {
    background: var(--lb-review-raised);
    border-color: var(--lb-review-border);
    color: var(--lb-review-ink);
  }
  .learningbored-review-grade:hover:not(:disabled) {
    background: var(--lb-review-focus-soft);
    border-color: var(--lb-review-focus);
  }
  .learningbored-review-anchor {
    border-color: var(--lb-review-anchor);
    background: var(--lb-review-raised);
  }
  @media (min-width: 640px) {
    .learningbored-review-panel {
      height: 100%;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .learningbored-review-panel * {
      scroll-behavior: auto !important;
      transition-duration: 0ms !important;
      animation-duration: 0ms !important;
    }
  }
`;

export interface LearningBoredReviewSurfaceShellProps {
  children: ReactNode;
  subtitle: string;
  onClose?: () => void;
  statusMessage?: string;
  translate?: LearningBoredTranslationFunc;
}

export default function LearningBoredReviewSurfaceShell({
  children,
  subtitle,
  onClose,
  statusMessage = '',
  translate = formatLearningBoredCopy,
}: LearningBoredReviewSurfaceShellProps) {
  return (
    <aside
      aria-label={translate('LearningBored review panel')}
      className='lb-presentation learningbored-review-panel relative z-10 flex w-full min-w-0 shrink-0 flex-col border-t sm:max-h-none sm:w-[clamp(360px,32vw,520px)] sm:border-l sm:border-t-0'
      data-lb-presentation='review-work-surface'
      data-lb-work-surface-height='review'
      data-testid='learningbored-review-panel'
    >
      <style>{REVIEW_SURFACE_STYLES}</style>
      <header className='flex min-h-14 shrink-0 items-center justify-between gap-3 border-b border-[var(--lb-review-border)] px-4'>
        <div className='flex min-w-0 items-center gap-3'>
          <BookOpenText
            className='size-5 shrink-0 text-[var(--lb-review-focus)]'
            aria-hidden='true'
          />
          <div className='min-w-0'>
            <h1 className='truncate text-base font-semibold'>{translate('Review')}</h1>
            <p className='truncate text-xs text-[var(--lb-review-muted)]'>{translate(subtitle)}</p>
          </div>
        </div>
        {onClose ? (
          <button
            type='button'
            className='btn btn-ghost btn-sm min-h-11 min-w-11'
            aria-label={translate('Close review')}
            onClick={onClose}
          >
            <X className='size-5' />
          </button>
        ) : null}
      </header>
      <div
        role='note'
        aria-label={translate('AI-generated review notice')}
        className='shrink-0 border-b border-[var(--lb-review-border)] bg-[var(--lb-review-recessed)] px-4 py-2 text-xs leading-5 text-[var(--lb-review-muted)]'
      >
        {translate('AI-generated study aid. Check important details against the source.')}
      </div>
      <p className='sr-only' aria-live='polite' aria-atomic='true'>
        {statusMessage}
      </p>
      {children}
    </aside>
  );
}
