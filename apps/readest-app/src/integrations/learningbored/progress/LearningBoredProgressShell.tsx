'use client';

import { AlertTriangle, ArrowLeft, Inbox, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';

import LearningBoredBrandMark from '../presentation/LearningBoredBrandMark';
import LearningBoredCloseButton from '../presentation/LearningBoredCloseButton';
import type {
  LearningBoredPresentationTheme,
  LearningBoredTranslationFunc,
} from '../presentation/context';
import { formatLearningBoredCopy } from '../presentation/context';
import { learningBoredDirectionContractAttributes } from '../presentation/direction-contract';
import styles from './LearningBoredProgress.module.css';

export interface LearningBoredProgressShellProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
  theme: LearningBoredPresentationTheme;
  onClose: () => void;
  onBack?: () => void;
  backLabel?: string;
  translate?: LearningBoredTranslationFunc;
}

export function LearningBoredProgressShell({
  children,
  title,
  subtitle,
  theme,
  onClose,
  onBack,
  backLabel = 'Back to progress',
  translate = formatLearningBoredCopy,
}: LearningBoredProgressShellProps) {
  return (
    <aside
      {...learningBoredDirectionContractAttributes}
      aria-label={translate('LearningBored progress panel')}
      className={`lb-presentation learningbored-progress ${styles['root']}`}
      data-lb-presentation='progress-work-surface'
      data-lb-theme={theme}
      data-testid='learningbored-progress-panel'
    >
      <header className={styles['header']}>
        <div className={styles['headerCluster']}>
          {onBack ? (
            <button className={styles['backButton']} onClick={onBack} type='button'>
              <ArrowLeft aria-hidden='true' />
              {translate(backLabel)}
            </button>
          ) : (
            <>
              <LearningBoredBrandMark className={styles['headerMark']} />
              <div className={styles['headerText']}>
                <h1 className={styles['heading']}>{translate(title)}</h1>
                {subtitle ? <p className={styles['subtitle']}>{subtitle}</p> : null}
              </div>
            </>
          )}
        </div>
        <LearningBoredCloseButton label={translate('Close progress')} onClose={onClose} />
      </header>
      <div className={styles['body']}>{children}</div>
    </aside>
  );
}

export interface LearningBoredProgressStatusProps {
  children: ReactNode;
  tone?: 'loading' | 'error' | 'empty';
  actionLabel?: string;
  onAction?: () => void;
  translate?: LearningBoredTranslationFunc;
}

export function LearningBoredProgressStatus({
  children,
  tone = 'loading',
  actionLabel,
  onAction,
  translate = formatLearningBoredCopy,
}: LearningBoredProgressStatusProps) {
  const role = tone === 'error' ? 'alert' : 'status';
  return (
    <div className={styles['status']} data-tone={tone} role={role}>
      <div className={styles['statusLine']}>
        {tone === 'loading' ? (
          <span aria-hidden='true' className={styles['spinner']} />
        ) : tone === 'error' ? (
          <AlertTriangle aria-hidden='true' className={styles['statusIcon']} />
        ) : (
          <Inbox aria-hidden='true' className={styles['statusIcon']} />
        )}
        <p className={styles['statusCopy']}>{children}</p>
      </div>
      {actionLabel && onAction ? (
        <button className={styles['secondaryButton']} onClick={onAction} type='button'>
          <RefreshCw aria-hidden='true' />
          {translate(actionLabel)}
        </button>
      ) : null}
    </div>
  );
}

export { styles as learningBoredProgressStyles };
