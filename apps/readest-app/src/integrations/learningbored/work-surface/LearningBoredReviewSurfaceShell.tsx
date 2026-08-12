'use client';

import type { ReactNode } from 'react';

import LearningBoredBrandMark from '../presentation/LearningBoredBrandMark';
import LearningBoredCloseButton from '../presentation/LearningBoredCloseButton';
import type { LearningBoredTranslationFunc } from '../presentation/context';
import {
  formatLearningBoredCopy,
  useLearningBoredPresentationTheme,
} from '../presentation/context';
import { learningBoredDirectionContractAttributes } from '../presentation/direction-contract';

import styles from './LearningBoredReviewSurface.module.css';

export interface LearningBoredReviewSurfaceShellProps {
  children: ReactNode;
  subtitle: string;
  state: string;
  busy?: boolean;
  onClose?: () => void;
  statusMessage?: string;
  translate?: LearningBoredTranslationFunc;
}

export default function LearningBoredReviewSurfaceShell({
  children,
  subtitle,
  state,
  busy = false,
  onClose,
  statusMessage = '',
  translate = formatLearningBoredCopy,
}: LearningBoredReviewSurfaceShellProps) {
  const theme = useLearningBoredPresentationTheme();

  return (
    <aside
      {...learningBoredDirectionContractAttributes}
      aria-busy={busy || undefined}
      aria-label={translate('LearningBored review panel')}
      className={`lb-presentation ${styles['root']}`}
      data-lb-presentation='review-work-surface'
      data-lb-review-state={state}
      data-lb-theme={theme}
      data-lb-work-surface-height='review'
      data-testid='learningbored-review-panel'
    >
      <header className={styles['header']}>
        <div className={styles['brandCluster']}>
          <LearningBoredBrandMark className={styles['brandMark']} />
          <div className={styles['brandText']}>
            <h1 className={styles['heading']}>{translate('Review')}</h1>
            <p className={styles['subtitle']}>{translate(subtitle)}</p>
          </div>
        </div>
        {onClose ? (
          <LearningBoredCloseButton label={translate('Close review')} onClose={onClose} />
        ) : null}
      </header>
      <div
        role='note'
        aria-label={translate('AI-generated review notice')}
        className={styles['notice']}
      >
        <strong>{translate('AI-generated study aid.')}</strong>{' '}
        {translate('Check important details against the source.')}
      </div>
      <p
        className='sr-only'
        data-testid='learningbored-review-status'
        role='status'
        aria-live='polite'
        aria-atomic='true'
      >
        {statusMessage}
      </p>
      <div className={styles['body']}>{children}</div>
    </aside>
  );
}

export { styles as learningBoredReviewSurfaceStyles };
