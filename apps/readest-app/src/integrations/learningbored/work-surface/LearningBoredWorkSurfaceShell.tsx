'use client';

import { BookOpenText, X } from 'lucide-react';
import type { ReactNode } from 'react';

import type { LearningBoredCapturedPassage } from '../types';
import LearningBoredBrandMark from '../presentation/LearningBoredBrandMark';
import type {
  LearningBoredPresentationTheme,
  LearningBoredTranslationFunc,
} from '../presentation/context';
import { formatLearningBoredCopy } from '../presentation/context';
import { learningBoredDirectionContractAttributes } from '../presentation/direction-contract';

import styles from './LearningBoredWorkSurface.module.css';

export interface LearningBoredWorkSurfaceShellProps {
  children: ReactNode;
  stageLabel: string;
  theme: LearningBoredPresentationTheme;
  height?: 'study' | 'review';
  title?: string;
  ariaLabel?: string;
  passage?: LearningBoredCapturedPassage | null;
  passageOpen?: boolean;
  onClose?: () => void;
  translate?: LearningBoredTranslationFunc;
  footer?: ReactNode;
}

export default function LearningBoredWorkSurfaceShell({
  children,
  stageLabel,
  theme,
  height = 'study',
  title = 'LearningBored',
  ariaLabel = 'LearningBored Board panel',
  passage,
  passageOpen = true,
  onClose,
  translate = formatLearningBoredCopy,
  footer,
}: LearningBoredWorkSurfaceShellProps) {
  const contextAfterOffset = passage
    ? passage.contextOffset + passage.selectedText.length
    : undefined;

  return (
    <aside
      {...learningBoredDirectionContractAttributes}
      aria-label={translate(ariaLabel)}
      className={`lb-presentation ${styles['root']}`}
      data-lb-presentation='study-work-surface'
      data-lb-theme={theme}
      data-lb-work-surface-height={height}
      data-testid='learningbored-work-surface'
    >
      <header className={styles['header']}>
        <div className={styles['brandCluster']}>
          <LearningBoredBrandMark className={styles['brandMark']} />
          <div className={styles['brandText']}>
            <h2 className={styles['heading']}>{translate(title)}</h2>
            <p className={styles['stage']}>{translate(stageLabel)}</p>
          </div>
        </div>
        {onClose ? (
          <button
            type='button'
            className={styles['iconButton']}
            aria-label={translate('Close LearningBored panel')}
            title={translate('Close LearningBored panel')}
            onClick={onClose}
          >
            <X aria-hidden='true' />
          </button>
        ) : null}
      </header>

      <div
        aria-label={translate('AI-generated content notice')}
        className={styles['notice']}
        role='note'
      >
        <strong>{translate('AI-generated study aid.')}</strong>{' '}
        {translate('Check important details against the source.')}
      </div>

      <div className={styles['body']}>
        {passage ? (
          <section className={styles['passageSection']}>
            <details open={passageOpen}>
              <summary className={styles['passageSummary']}>
                <BookOpenText aria-hidden='true' />
                {translate('Captured passage')}
              </summary>
              <blockquote className={styles['passage']}>{passage.selectedText}</blockquote>
              <p className={styles['passageMeta']}>
                {translate('Anchored at context offsets')} {passage.contextOffset}–
                {contextAfterOffset}
              </p>
            </details>
          </section>
        ) : null}
        {children}
      </div>
      {footer}
    </aside>
  );
}

export { styles as learningBoredWorkSurfaceStyles };
